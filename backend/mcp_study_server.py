import os
# pyrefly: ignore [missing-import]
from mcp.server.fastmcp import FastMCP
from duckduckgo_search import DDGS

# Create FastMCP server
mcp = FastMCP("StudyAssistantServer")

# File path to store active document text
UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "uploads")
DOCUMENT_PATH = os.path.join(UPLOADS_DIR, "active_document.txt")

@mcp.tool()
def get_document_content() -> str:
    """
    Retrieve the entire text content of the currently uploaded document/PDF.
    Use this to get the context necessary to summarize the document, answer questions, or generate quizzes.
    """
    if not os.path.exists(DOCUMENT_PATH):
        return "No study document has been uploaded yet. Please upload a PDF or text document first."
    
    try:
        with open(DOCUMENT_PATH, "r", encoding="utf-8") as f:
            content = f.read().strip()
        if not content:
            return "The uploaded document is empty."
        return content
    except Exception as e:
        return f"Error reading document: {str(e)}"

@mcp.tool()
def search_web(query: str) -> str:
    """
    Search the internet for external information using DuckDuckGo.
    Use this tool ONLY if the user's question (doubt) cannot be answered using the uploaded document's content,
    or if the user explicitly asks for external/up-to-date information.
    """
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=5))
            if not results:
                return f"No search results found for query: '{query}'"
            
            formatted = []
            for r in results:
                title = r.get("title", "No Title")
                href = r.get("href", "No Link")
                body = r.get("body", "No description available.")
                formatted.append(f"Title: {title}\nURL: {href}\nSnippet: {body}")
            
            return "\n\n---\n\n".join(formatted)
    except Exception as e:
        return f"Error performing web search: {str(e)}"

if __name__ == "__main__":
    # Start the stdio MCP server
    mcp.run()
