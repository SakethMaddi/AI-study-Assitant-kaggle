import os
import time
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import study_agent

class DocumentHandler(FileSystemEventHandler):
    def __init__(self, document_path, output_path):
        self.document_path = os.path.abspath(document_path)
        self.output_path = os.path.abspath(output_path)
        self.last_processed = 0

    def on_modified(self, event):
        if os.path.abspath(event.src_path) == self.document_path:
            # Debounce rapid sequential triggers
            now = time.time()
            if now - self.last_processed < 5:
                return
            self.last_processed = now
            self.process_document()

    def on_created(self, event):
        if os.path.abspath(event.src_path) == self.document_path:
            self.process_document()

    def process_document(self):
        print(f"Ambient Agent: New document content detected at {self.document_path}!")
        print("Ambient Agent: Running ADK study agent to summarize...")
        
        # Verify API Key is configured before running the agent
        if not os.environ.get("GEMINI_API_KEY") and not os.environ.get("GOOGLE_GENAI_API_KEY"):
            print("Ambient Agent Warning: Gemini API Key is missing. Skipping summarization.")
            with open(self.output_path, "w", encoding="utf-8") as f:
                f.write("Error: Gemini API Key is missing in the environment. Please set GEMINI_API_KEY to run the ambient agent.")
            return

        try:
            # Generate a unique session ID for this ambient execution
            session_id = f"ambient_{int(time.time())}"
            summary = study_agent.summarize_document(session_id)
            
            with open(self.output_path, "w", encoding="utf-8") as f:
                f.write(summary)
            print(f"Ambient Agent: Summary successfully generated and saved to {self.output_path}!")
        except Exception as e:
            print(f"Ambient Agent Error: Failed to generate summary: {str(e)}")

def main():
    uploads_dir = os.path.join(os.path.dirname(__file__), "uploads")
    document_path = os.path.join(uploads_dir, "active_document.txt")
    output_path = os.path.join(uploads_dir, "ambient_summary.txt")

    os.makedirs(uploads_dir, exist_ok=True)
    
    print("==========================================================")
    print(" Starting Ambient AI Study Agent (File Watcher Mode) ")
    print("==========================================================")
    print(f"Watching directory: {uploads_dir}")
    print(f"Trigger file: {document_path}")
    print(f"Output summary file: {output_path}")
    print("==========================================================")

    # Initial run if document already exists
    if os.path.exists(document_path):
        print("Ambient Agent: Initial active_document.txt found on startup. Summarizing...")
        handler = DocumentHandler(document_path, output_path)
        handler.process_document()

    handler = DocumentHandler(document_path, output_path)
    observer = Observer()
    observer.schedule(handler, path=uploads_dir, recursive=False)
    observer.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()

if __name__ == "__main__":
    main()
