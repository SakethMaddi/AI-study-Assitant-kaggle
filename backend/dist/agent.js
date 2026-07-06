"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.runner = exports.sessionService = exports.studyAgent = void 0;
const adk_1 = require("@google/adk");
const path = __importStar(require("path"));
const dotenv = __importStar(require("dotenv"));
dotenv.config();
// Define the path to the compiled MCP server
const mcpServerPath = path.join(__dirname, "mcp_server.js");
console.log("Configuring MCP Toolset pointing to:", mcpServerPath);
// Create the MCP Toolset using Stdio transport
const mcpToolset = new adk_1.MCPToolset({
    type: "StdioConnectionParams",
    serverParams: {
        command: "node",
        args: [mcpServerPath],
        env: process.env,
    },
});
// Define the AI Study Assistant Agent
exports.studyAgent = new adk_1.LlmAgent({
    name: "study_assistant_agent",
    model: "gemini-2.5-flash",
    description: "An AI study assistant that answers questions based on an uploaded document or the internet.",
    instruction: `You are an expert AI Study Assistant.
Your job is to help users learn by:
1. Answering their questions/doubts. Always check the uploaded document first by calling the "read_document" tool. If the information is not present in the document or if it is incomplete/outdated, call the "search_internet" tool to find reliable facts from the web.
2. Summarizing the document. When asked to summarize, read the document content first and write a beautiful, structured summary using Markdown (with sections like Key Concepts, Main Takeaways, and Summary).
3. Generating Quizzes. When asked to generate a quiz, read the document first, and construct a multiple-choice quiz.
   The quiz MUST be output as a valid JSON array of 5 questions.
   Format the JSON exactly as follows:
   [
     {
       "question": "The question text?",
       "options": ["Option A", "Option B", "Option C", "Option D"],
       "correctAnswer": "Option A",
       "explanation": "Why Option A is correct."
     }
   ]
   Return ONLY the raw JSON array. Do not include any additional commentary. If you output markdown blocks like \\\`\\\`\\\`json, that is fine, but do not add introductory or trailing text.

Rules:
- Be clear, supportive, and educational.
- If you use the internet search, cite that you found the information from the web.
- If you use the document, mention that it is from the document.`,
    tools: [mcpToolset],
});
// Configure the Session Service and Runner
exports.sessionService = new adk_1.InMemorySessionService();
exports.runner = new adk_1.Runner({
    appName: "study_assistant",
    agent: exports.studyAgent,
    sessionService: exports.sessionService,
});
