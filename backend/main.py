import os
import json
import uuid
import shutil
from fastapi import FastAPI, UploadFile, File, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import pdfplumber

# Import our ADK Agent functions
import study_agent

app = FastAPI(title="AI Study Assistant Backend")

# Configure CORS so React app can communicate with FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify the exact origins (e.g. ["http://localhost:5173"])
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Shared uploads directory
UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)
DOCUMENT_PATH = os.path.join(UPLOADS_DIR, "active_document.txt")

# Middleware to capture the API key header and set it in the environment
@app.middleware("http")
async def api_key_middleware(request: Request, call_next):
    # Check if frontend passed API Key in custom header
    api_key = request.headers.get("X-Gemini-API-Key")
    if api_key:
        os.environ["GEMINI_API_KEY"] = api_key
        os.environ["GOOGLE_GENAI_API_KEY"] = api_key
    response = await call_next(request)
    return response

class ChatRequest(BaseModel):
    message: str
    sessionId: str

def clean_json_response(raw_text: str) -> str:
    """Helper to clean markdown JSON blocks if the model wrapped its output."""
    cleaned = raw_text.strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    return cleaned.strip()

@app.post("/api/upload")
async def upload_document(file: UploadFile = File(...)):
    # Verify file extension
    filename = file.filename
    ext = os.path.splitext(filename)[1].lower()
    
    if ext not in [".pdf", ".txt", ".md"]:
        raise HTTPException(status_code=400, detail="Unsupported file format. Please upload a PDF or text file.")
    
    # Save the file temporarily
    temp_file_path = os.path.join(UPLOADS_DIR, f"temp_{filename}")
    try:
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        extracted_text = ""
        # Extract text based on file format
        if ext == ".pdf":
            try:
                with pdfplumber.open(temp_file_path) as pdf:
                    for page in pdf.pages:
                        page_text = page.extract_text()
                        if page_text:
                            extracted_text += page_text + "\n"
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Failed to parse PDF: {str(e)}")
        else:
            try:
                with open(temp_file_path, "r", encoding="utf-8", errors="ignore") as f:
                    extracted_text = f.read()
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Failed to read text file: {str(e)}")
                
        # If no text was extracted
        if not extracted_text.strip():
            raise HTTPException(status_code=400, detail="The document seems to be empty or does not contain extractable text.")
            
        # Write extracted text to the shared location for the MCP server
        with open(DOCUMENT_PATH, "w", encoding="utf-8") as f:
            f.write(extracted_text)
            
    finally:
        # Clean up temporary file
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)
            
    # Generate a unique session ID for this document upload
    session_id = str(uuid.uuid4())
    
    # Check if Gemini API key is configured
    if not os.environ.get("GEMINI_API_KEY") and not os.environ.get("GOOGLE_GENAI_API_KEY"):
         return JSONResponse(
             content={
                 "summary": "Document uploaded successfully! Please enter your Gemini API Key in the UI header to generate the summary, chat, and quiz.",
                 "sessionId": session_id,
                 "needsApiKey": True
             }
         )
         
    try:
        # Ask ADK Agent to summarize the document
        summary = study_agent.summarize_document(session_id)
        return {"summary": summary, "sessionId": session_id, "needsApiKey": False}
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"detail": f"Failed to generate summary: {str(e)}", "sessionId": session_id}
        )

@app.post("/api/chat")
async def chat_doubt(request: ChatRequest):
    session_id = request.sessionId
    message = request.message
    
    if not os.environ.get("GEMINI_API_KEY") and not os.environ.get("GOOGLE_GENAI_API_KEY"):
         raise HTTPException(status_code=400, detail="Gemini API Key is missing. Please set it in the UI header.")
         
    try:
        answer = study_agent.ask_doubt(session_id, message)
        return {"answer": answer}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/quiz")
async def get_quiz(sessionId: str = Query(...)):
    if not os.environ.get("GEMINI_API_KEY") and not os.environ.get("GOOGLE_GENAI_API_KEY"):
         raise HTTPException(status_code=400, detail="Gemini API Key is missing. Please set it in the UI header.")
         
    try:
        raw_quiz = study_agent.generate_quiz(sessionId)
        cleaned_quiz = clean_json_response(raw_quiz)
        
        # Parse the JSON response from the agent
        try:
            quiz_data = json.loads(cleaned_quiz)
            return {"quiz": quiz_data}
        except json.JSONDecodeError:
            # Fallback if agent returned invalid JSON format
            return {
                "raw": raw_quiz,
                "quiz": [
                    {
                        "question": "Failed to parse generated quiz into JSON structure. Raw response returned.",
                        "options": [raw_quiz[:100], "Error parsing response", "Please retry", "N/A"],
                        "correctAnswer": 0,
                        "explanation": raw_quiz
                    }
                ]
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/tips")
async def get_study_tips(sessionId: str = Query(...)):
    if not os.environ.get("GEMINI_API_KEY") and not os.environ.get("GOOGLE_GENAI_API_KEY"):
         raise HTTPException(status_code=400, detail="Gemini API Key is missing. Please set it in the UI header.")
         
    try:
        tips = study_agent.generate_study_tips(sessionId)
        return {"tips": tips}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/health")
async def health_check():
    has_api_key = bool(os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_GENAI_API_KEY"))
    return {"status": "healthy", "has_api_key": has_api_key}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
