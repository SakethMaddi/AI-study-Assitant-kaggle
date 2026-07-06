import os
import sys
import re
from google.genai import types
from google.adk import Agent
from google.adk.workflow import START, Workflow
from google.adk.tools import McpToolset
from google.adk.tools.mcp_tool import StdioConnectionParams
from mcp.client.stdio import StdioServerParameters
from google.adk.plugins import BasePlugin

# 1. Security PII & Prompt Injection Defense Plugin
class SecurityPIIPlugin(BasePlugin):
    """
    Custom ADK Plugin that intercepts user messages before they reach the agent.
    It redacts Personally Identifiable Information (PII) like emails and phone numbers,
    and detects/defends against prompt injection attempts.
    """
    def __init__(self):
        super().__init__(name="security_pii")
        
    async def on_user_message_callback(self, *, invocation_context, user_message) -> types.Content:
        if not user_message or not user_message.parts:
            return user_message
            
        # Extract full user message text
        text = "".join(part.text for part in user_message.parts if part.text)
        
        # --- PII Redaction ---
        # Redact email addresses
        email_pattern = r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+"
        text = re.sub(email_pattern, "[REDACTED_EMAIL]", text)
        
        # Redact phone numbers
        phone_pattern = r"(?:\+?\d{1,3}[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}"
        text = re.sub(phone_pattern, "[REDACTED_PHONE]", text)
        
        # --- Prompt Injection Defense ---
        injection_keywords = [
            "ignore all previous instructions",
            "ignore previous instructions",
            "system override",
            "ignore previous guidelines",
            "you must now act as",
            "forget what I said before",
            "forget previous instructions"
        ]
        
        for keyword in injection_keywords:
            if keyword in text.lower():
                # Replace query with a blocked notification, short-circuiting execution
                return types.Content(parts=[types.Part.from_text(
                    text="[SECURITY BLOCK: Message flagged for potential prompt injection policy violation.]"
                )])
                
        # Return cleaned text
        return types.Content(parts=[types.Part.from_text(text=text)])

# 2. Tools & MCP Server connection
mcp_server_script = os.path.join(os.path.dirname(os.path.dirname(__file__)), "mcp_study_server.py")

connection_params = StdioConnectionParams(
    server_params=StdioServerParameters(
        command=sys.executable,
        args=[mcp_server_script],
        env=os.environ.copy()
    )
)
mcp_toolset = McpToolset(connection_params=connection_params)

# 3. Graph Core Agents
document_agent = Agent(
    name="document_agent",
    model="gemini-2.5-flash",
    instruction="""You are a Document Specialist. Your job is to read the uploaded document using get_document_content() and answer questions, summarize, or generate quizzes.
If you cannot answer the query using the document content, reply that you need to search the web.
""",
    tools=[mcp_toolset]
)

research_agent = Agent(
    name="research_agent",
    model="gemini-2.5-flash",
    instruction="""You are a Research Agent. Your job is to search the web using search_web() to find information.
Summarize the findings and answer the user query based on the search results.
""",
    tools=[mcp_toolset]
)

coordinator_agent = Agent(
    name="coordinator_agent",
    model="gemini-2.5-flash",
    instruction="""You are the main Coordinator for the Study Assistant.
Your job is to route the user request to the correct specialist:
- If the user wants a summary, quiz, study tips, or has a doubt about the document content, transfer to document_agent.
- If the user has a doubt or question that is NOT in the document or requires external research, transfer to research_agent.
""",
    sub_agents=[document_agent, research_agent]
)

# 4. Stateful Graph Core Workflow
root_agent = Workflow(
    name="study_graph_workflow",
    edges=[
        (START, coordinator_agent)
    ]
)
