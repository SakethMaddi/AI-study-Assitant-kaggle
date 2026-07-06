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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const multer_1 = __importDefault(require("multer"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const pdf = require("pdf-parse");
const agent_1 = require("./agent");
const adk_1 = require("@google/adk");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Setup Multer for document uploads
const UPLOADS_DIR = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        // Save as current_upload with original extension
        cb(null, `upload_${Date.now()}_${file.originalname}`);
    },
});
const upload = (0, multer_1.default)({ storage });
const DOC_FILE_PATH = path.join(UPLOADS_DIR, "current_document.txt");
const METADATA_PATH = path.join(UPLOADS_DIR, "metadata.json");
// API Route: Document Upload
app.post("/api/upload", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }
        const filePath = req.file.path;
        const fileExt = path.extname(req.file.originalname).toLowerCase();
        let text = "";
        console.log(`Received file: ${req.file.originalname}, parsing...`);
        if (fileExt === ".pdf") {
            const dataBuffer = fs.readFileSync(filePath);
            const parsedPdf = await pdf(dataBuffer);
            text = parsedPdf.text;
        }
        else if (fileExt === ".txt" || fileExt === ".md") {
            text = fs.readFileSync(filePath, "utf-8");
        }
        else {
            // Delete temporary file
            fs.unlinkSync(filePath);
            return res.status(400).json({ error: "Unsupported file type. Please upload a PDF, TXT, or MD file." });
        }
        // Save parsed text to the active document path
        fs.writeFileSync(DOC_FILE_PATH, text, "utf-8");
        // Save metadata
        fs.writeFileSync(METADATA_PATH, JSON.stringify({
            originalName: req.file.originalname,
            uploadedAt: new Date().toISOString(),
            charCount: text.length,
        }), "utf-8");
        // Clean up uploaded file from disk to save space
        fs.unlinkSync(filePath);
        console.log(`Parsed successfully. ${text.length} characters written to current_document.txt`);
        return res.json({
            success: true,
            filename: req.file.originalname,
            charCount: text.length,
        });
    }
    catch (error) {
        console.error("Upload error:", error);
        return res.status(500).json({ error: `Failed to parse document: ${error.message || error}` });
    }
});
// API Route: Get Document Metadata
app.get("/api/document", (req, res) => {
    try {
        if (!fs.existsSync(DOC_FILE_PATH)) {
            return res.json({ uploaded: false });
        }
        const metadata = fs.existsSync(METADATA_PATH)
            ? JSON.parse(fs.readFileSync(METADATA_PATH, "utf-8"))
            : { originalName: "document.txt", uploadedAt: new Date().toISOString(), charCount: 0 };
        return res.json({ uploaded: true, ...metadata });
    }
    catch (error) {
        return res.json({ uploaded: false });
    }
});
// API Route: Delete Document
app.delete("/api/document", (req, res) => {
    try {
        if (fs.existsSync(DOC_FILE_PATH)) {
            fs.unlinkSync(DOC_FILE_PATH);
        }
        if (fs.existsSync(METADATA_PATH)) {
            fs.unlinkSync(METADATA_PATH);
        }
        return res.json({ success: true });
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
});
// API Route: Summarize Document
app.post("/api/summarize", async (req, res) => {
    try {
        if (!fs.existsSync(DOC_FILE_PATH)) {
            return res.status(400).json({ error: "Please upload a study document first." });
        }
        console.log("Generating summary...");
        const sessionId = `summary-${Date.now()}`;
        const responseStream = agent_1.runner.runAsync({
            userId: "user",
            sessionId,
            newMessage: {
                parts: [{ text: "Please read the document and generate a comprehensive summary with Key Concepts, Main Takeaways, and a concluding Summary." }],
            },
        });
        let text = "";
        for await (const event of responseStream) {
            text += (0, adk_1.stringifyContent)(event);
        }
        console.log("Summary generated successfully.");
        return res.json({ summary: text });
    }
    catch (error) {
        console.error("Summary generation error:", error);
        return res.status(500).json({ error: `Failed to generate summary: ${error.message || error}` });
    }
});
// API Route: Generate Quiz
app.post("/api/quiz", async (req, res) => {
    try {
        if (!fs.existsSync(DOC_FILE_PATH)) {
            return res.status(400).json({ error: "Please upload a study document first." });
        }
        console.log("Generating quiz...");
        const sessionId = `quiz-${Date.now()}`;
        const responseStream = agent_1.runner.runAsync({
            userId: "user",
            sessionId,
            newMessage: {
                parts: [
                    {
                        text: "Generate a quiz from the document. The quiz should be a valid JSON list of 5 multiple-choice questions. Each question must have: 'question' (string), 'options' (array of strings, exactly 4), 'correctAnswer' (string, matching one of the options exactly), and 'explanation' (string). Return ONLY the raw JSON block without markdown formatting.",
                    },
                ],
            },
        });
        let text = "";
        for await (const event of responseStream) {
            text += (0, adk_1.stringifyContent)(event);
        }
        // Extract JSON block from output (in case model included ```json ... ``` wrapper)
        let jsonString = text.trim();
        if (jsonString.startsWith("```")) {
            // Strip starting ```json or ```
            jsonString = jsonString.replace(/^```[a-zA-Z]*\n?/, "");
            // Strip ending ```
            jsonString = jsonString.replace(/\n?```$/, "");
        }
        jsonString = jsonString.trim();
        try {
            const quizData = JSON.parse(jsonString);
            console.log("Quiz generated and parsed successfully.");
            return res.json({ quiz: quizData });
        }
        catch (parseError) {
            console.error("Failed to parse quiz JSON. Raw output was:", text);
            return res.status(500).json({
                error: "Failed to parse quiz response as JSON.",
                raw: text,
            });
        }
    }
    catch (error) {
        console.error("Quiz generation error:", error);
        return res.status(500).json({ error: `Failed to generate quiz: ${error.message || error}` });
    }
});
// API Route: Chat (Answer Doubts)
app.post("/api/chat", async (req, res) => {
    try {
        const { message, sessionId = `chat-${Date.now()}` } = req.body;
        if (!message) {
            return res.status(400).json({ error: "Message is required" });
        }
        console.log(`Processing chat message for session ${sessionId}: "${message}"`);
        const responseStream = agent_1.runner.runAsync({
            userId: "user",
            sessionId,
            newMessage: {
                parts: [{ text: message }],
            },
        });
        let text = "";
        let usedWebSearch = false;
        let usedDocument = false;
        for await (const event of responseStream) {
            text += (0, adk_1.stringifyContent)(event);
            const functionCalls = (0, adk_1.getFunctionCalls)(event);
            for (const call of functionCalls) {
                if (call.name === "search_internet") {
                    usedWebSearch = true;
                }
                if (call.name === "read_document") {
                    usedDocument = true;
                }
            }
        }
        console.log(`Chat response: "${text.substring(0, 50)}..." [web:${usedWebSearch}, doc:${usedDocument}]`);
        return res.json({
            response: text,
            usedWebSearch,
            usedDocument,
            sessionId,
        });
    }
    catch (error) {
        console.error("Chat error:", error);
        return res.status(500).json({ error: `Failed to answer doubt: ${error.message || error}` });
    }
});
// Start Express server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
    console.log(`Express server running on http://localhost:${PORT}`);
});
