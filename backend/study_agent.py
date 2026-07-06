import os
import sys
from dotenv import load_dotenv
from google.genai import types
from google.adk import Runner
from google.adk.sessions import InMemorySessionService

# Import root_agent workflow and SecurityPIIPlugin from our graph core app
from study_agent_app.agent import root_agent, SecurityPIIPlugin

# Load environment variables (from .env file)
load_dotenv()

# Verify API Key exists
API_KEY = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_GENAI_API_KEY")
if not API_KEY:
    print("WARNING: GEMINI_API_KEY is not set. The ADK agent will fail to call Gemini.", file=sys.stderr)

# Instantiate the ADK Runner with graph workflow, security plugin, and in-memory session service
runner = Runner(
    app_name="study_assistant_app",
    agent=root_agent,
    session_service=InMemorySessionService(),
    auto_create_session=True,
    plugins=[SecurityPIIPlugin()]
)


def extract_text_from_event(event) -> str:
    """Helper to extract text parts from an event message."""
    if not event.message or not event.message.parts:
        return ""
    return "".join(part.text for part in event.message.parts if part.text)

def run_agent_query(user_id: str, session_id: str, query: str) -> str:
    """Sends a query to the agent and returns the final consolidated response text."""
    new_message = types.Content(parts=[types.Part.from_text(text=query)])
    
    response_text = ""
    # Run the agent synchronously using the runner
    events = runner.run(
        user_id=user_id,
        session_id=session_id,
        new_message=new_message
    )
    
    for event in events:
        if event.is_final_response():
            text = extract_text_from_event(event)
            if text:
                response_text = text
                
    return response_text

def summarize_document(session_id: str) -> str:
    """Summarizes the uploaded document."""
    query = "Please read the document and provide a structured, detailed, and comprehensive summary."
    return run_agent_query(user_id="student", session_id=session_id, query=query)

def generate_quiz(session_id: str) -> str:
    """Generates a 5-question multiple choice quiz from the document."""
    query = (
        "Read the document and generate a 5-question multiple choice quiz. "
        "Format your output strictly as a JSON array of questions, containing: "
        "'question' (string), 'options' (array of 4 strings), 'correctAnswer' (integer index 0-3), "
        "and 'explanation' (string). Return only the raw JSON array without markdown blocks."
    )
    return run_agent_query(user_id="student", session_id=session_id, query=query)

def ask_doubt(session_id: str, question: str) -> str:
    """Answers a user doubt using the document or web search."""
    return run_agent_query(user_id="student", session_id=session_id, query=question)

def generate_study_tips(session_id: str) -> str:
    """Generates study tips and exam preparation advice tailored to the document content."""
    query = (
        "Read the document and provide tailored study tips and exam preparation advice. "
        "Highlight the most critical high-yield concepts that are likely to appear on an exam. "
        "Suggest study strategies (e.g. active recall prompts, Feynman technique explanations, or simple mnemonics) "
        "and mention any complex or tricky areas to pay extra attention to."
    )
    return run_agent_query(user_id="student", session_id=session_id, query=query)

