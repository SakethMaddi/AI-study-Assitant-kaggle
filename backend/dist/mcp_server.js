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
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// Define the file path where the active document text is stored
const UPLOADS_DIR = path.join(__dirname, "..", "uploads");
const DOC_FILE_PATH = path.join(UPLOADS_DIR, "current_document.txt");
// Initialize MCP Server
const server = new index_js_1.Server({
    name: "study-assistant-mcp-server",
    version: "1.0.0",
}, {
    capabilities: {
        tools: {},
    },
});
// Register list of tools
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "read_document",
                description: "Reads the content of the currently uploaded study document. Use this tool when you need to answer questions based on the document.",
                inputSchema: {
                    type: "object",
                    properties: {},
                },
            },
            {
                name: "search_internet",
                description: "Searches the internet for general knowledge doubts and updates. Use this tool ONLY when the information is NOT present in the study document or you need external verification.",
                inputSchema: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            description: "The search query to run on the web.",
                        },
                    },
                    required: ["query"],
                },
            },
        ],
    };
});
// Helper to query DuckDuckGo HTML search and extract snippets
async function performWebSearch(query) {
    try {
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const response = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
        });
        if (!response.ok) {
            throw new Error(`DuckDuckGo returned status ${response.status}`);
        }
        const html = await response.text();
        // Simple robust regex to extract search result snippets
        const snippetRegex = /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
        const titleRegex = /<a class="result__a"[^>]*>([\s\S]*?)<\/a>/g;
        const snippets = [];
        const titles = [];
        let snippetMatch;
        while ((snippetMatch = snippetRegex.exec(html)) !== null && snippets.length < 5) {
            const rawText = snippetMatch[1];
            const cleanText = rawText
                .replace(/<[^>]*>/g, "") // Strip HTML tags
                .replace(/&amp;/g, "&")
                .replace(/&quot;/g, '"')
                .replace(/&apos;/g, "'")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/\s+/g, " ")
                .trim();
            snippets.push(cleanText);
        }
        let titleMatch;
        while ((titleMatch = titleRegex.exec(html)) !== null && titles.length < 5) {
            const rawText = titleMatch[1];
            const cleanText = rawText
                .replace(/<[^>]*>/g, "")
                .replace(/&amp;/g, "&")
                .replace(/&quot;/g, '"')
                .replace(/&apos;/g, "'")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/\s+/g, " ")
                .trim();
            titles.push(cleanText);
        }
        const results = [];
        for (let i = 0; i < snippets.length; i++) {
            results.push(`Result ${i + 1}: ${titles[i] || "Search Result"}\nSnippet: ${snippets[i]}`);
        }
        if (results.length === 0) {
            return ["No results found on the internet. Please try a different query."];
        }
        return results;
    }
    catch (error) {
        console.error("Search error:", error);
        return [`Error performing web search: ${error.message || error}`];
    }
}
// Handle tool executions
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (name === "read_document") {
        try {
            if (!fs.existsSync(DOC_FILE_PATH)) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "No study document has been uploaded yet. Please instruct the user to upload a document first.",
                        },
                    ],
                };
            }
            const content = fs.readFileSync(DOC_FILE_PATH, "utf-8");
            return {
                content: [
                    {
                        type: "text",
                        text: content || "The document is empty.",
                    },
                ],
            };
        }
        catch (error) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error reading active study document: ${error.message || error}`,
                    },
                ],
            };
        }
    }
    if (name === "search_internet") {
        const query = args?.query;
        if (!query) {
            return {
                content: [
                    {
                        type: "text",
                        text: "Error: No query parameter was provided to search_internet.",
                    },
                ],
            };
        }
        const searchResults = await performWebSearch(query);
        return {
            content: [
                {
                    type: "text",
                    text: `Web search results for "${query}":\n\n${searchResults.join("\n\n")}`,
                },
            ],
        };
    }
    throw new Error(`Tool not found: ${name}`);
});
// Run the server on Stdio
async function run() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    // Using console.error because stdout is reserved for JSON-RPC messages
    console.error("Study Assistant MCP Server started on Stdio transport.");
}
run().catch((err) => {
    console.error("Failed to run MCP Server:", err);
    process.exit(1);
});
