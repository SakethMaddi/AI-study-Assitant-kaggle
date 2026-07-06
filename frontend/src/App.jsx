import React, { useState, useEffect, useRef } from 'react';
import './App.css';

const API_BASE_URL = 'http://localhost:8000';

function App() {
  // State variables
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
  const [activeTab, setActiveTab] = useState('summary');
  const [file, setFile] = useState(null);
  const [sessionId, setSessionId] = useState('');
  const [needsApiKey, setNeedsApiKey] = useState(false);
  
  // Loading states
  const [uploadLoading, setUploadLoading] = useState(false);
  const [quizLoading, setQuizLoading] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [tipsLoading, setTipsLoading] = useState(false);

  // Content states
  const [summary, setSummary] = useState('');
  const [quiz, setQuiz] = useState(null);
  const [tips, setTips] = useState('');
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');

  // Quiz interactive states
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null); // Index of option selected for current question
  const [answeredQuestions, setAnsweredQuestions] = useState({}); // { questionIndex: { selectedAnswer, isCorrect } }
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  // Refs
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Save API Key to localStorage when updated
  useEffect(() => {
    localStorage.setItem('gemini_api_key', apiKey);
  }, [apiKey]);

  // Scroll to bottom of chat whenever messages list updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatLoading]);

  // Handle Drag and Drop
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (selectedFile) => {
    const ext = selectedFile.name.split('.').pop().toLowerCase();
    if (!['pdf', 'txt', 'md'].includes(ext)) {
      alert('Unsupported file format. Please upload a PDF or text file.');
      return;
    }
    setFile({
      name: selectedFile.name,
      size: (selectedFile.size / 1024).toFixed(1) + ' KB',
      raw: selectedFile
    });
    // Upload the file immediately upon selection
    uploadFile(selectedFile);
  };

  // Helper to make API calls with correct headers (including the API Key)
  const getHeaders = () => {
    const headers = {};
    if (apiKey.trim()) {
      headers['X-Gemini-API-Key'] = apiKey.trim();
    }
    return headers;
  };

  // Upload PDF/TXT API
  const uploadFile = async (rawFile) => {
    setUploadLoading(true);
    setSummary('');
    setQuiz(null);
    setTips('');
    setMessages([]);
    setSessionId('');
    
    const formData = new FormData();
    formData.append('file', rawFile);

    try {
      const response = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        headers: getHeaders(),
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Upload failed');
      }

      const data = await response.json();
      setSessionId(data.sessionId);
      setNeedsApiKey(!!data.needsApiKey);
      setSummary(data.summary);
      
      // Seed initial chat message welcoming the student
      setMessages([
        {
          sender: 'assistant',
          text: `Welcome! I've processed your document: "${rawFile.name}". You can see the summary in the "Summary" tab, ask me questions or doubts here, or take a quiz under the "Quiz" tab. How can I help you today?`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
      setActiveTab('summary');
    } catch (error) {
      console.error(error);
      alert(`Error uploading file: ${error.message}`);
      setFile(null);
    } finally {
      setUploadLoading(false);
    }
  };

  // Fetch Quiz API
  const generateQuiz = async () => {
    if (!sessionId) return;
    setQuizLoading(true);
    setQuiz(null);
    setQuizSubmitted(false);
    setCurrentQuizIndex(0);
    setSelectedOption(null);
    setAnsweredQuestions({});

    try {
      const response = await fetch(`${API_BASE_URL}/api/quiz?sessionId=${sessionId}`, {
        method: 'GET',
        headers: getHeaders()
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Quiz generation failed');
      }

      const data = await response.json();
      setQuiz(data.quiz);
      setActiveTab('quiz');
    } catch (error) {
      console.error(error);
      alert(`Error generating quiz: ${error.message}`);
    } finally {
      setQuizLoading(false);
    }
  };

  // Fetch Study Tips API
  const generateTips = async () => {
    if (!sessionId) return;
    setTipsLoading(true);
    setTips('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/tips?sessionId=${sessionId}`, {
        method: 'GET',
        headers: getHeaders()
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Tips generation failed');
      }

      const data = await response.json();
      setTips(data.tips);
      setActiveTab('tips');
    } catch (error) {
      console.error(error);
      alert(`Error generating study tips: ${error.message}`);
    } finally {
      setTipsLoading(false);
    }
  };

  // Send Chat message API (doubt solving)
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !sessionId || chatLoading) return;

    const userMessage = chatInput;
    setChatInput('');
    
    // Add user message to state
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages(prev => [...prev, { sender: 'user', text: userMessage, timestamp }]);
    setChatLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getHeaders()
        },
        body: JSON.stringify({
          message: userMessage,
          sessionId: sessionId
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Chat failed');
      }

      const data = await response.json();
      
      // Check for source citation inside the answer text
      let source = null;
      let cleanedText = data.answer;
      
      if (data.answer.includes('Source: Document') && data.answer.includes('Source: Web')) {
        source = 'both';
      } else if (data.answer.includes('Source: Document')) {
        source = 'doc';
      } else if (data.answer.includes('Source: Web')) {
        source = 'web';
      }

      setMessages(prev => [...prev, {
        sender: 'assistant',
        text: cleanedText,
        source,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, {
        sender: 'assistant',
        text: `Error resolving doubt: ${error.message}. Please verify your API Key and try again.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    } finally {
      setChatLoading(false);
    }
  };

  // Interactive Quiz Logic
  const handleOptionSelect = (optionIndex) => {
    if (answeredQuestions[currentQuizIndex] !== undefined) return; // Already answered
    setSelectedOption(optionIndex);
  };

  const handleSubmitAnswer = () => {
    if (selectedOption === null) return;
    
    const currentQuestion = quiz[currentQuizIndex];
    const isCorrect = selectedOption === currentQuestion.correctAnswer;
    
    setAnsweredQuestions(prev => ({
      ...prev,
      [currentQuizIndex]: {
        selectedAnswer: selectedOption,
        isCorrect
      }
    }));
  };

  const handleNextQuestion = () => {
    setSelectedOption(null);
    if (currentQuizIndex < quiz.length - 1) {
      setCurrentQuizIndex(prev => prev + 1);
    } else {
      setQuizSubmitted(true);
    }
  };

  const getQuizScore = () => {
    return Object.values(answeredQuestions).filter(ans => ans.isCorrect).length;
  };

  // Helper to format Markdown-like text (headers and bullets) to simple HTML paragraphs
  const formatSummaryText = (text) => {
    if (!text) return '';
    return text.split('\n').map((line, idx) => {
      let trimmed = line.trim();
      if (trimmed.startsWith('# ')) {
        return <h1 key={idx}>{trimmed.substring(2)}</h1>;
      } else if (trimmed.startsWith('## ')) {
        return <h2 key={idx}>{trimmed.substring(3)}</h2>;
      } else if (trimmed.startsWith('### ')) {
        return <h3 key={idx}>{trimmed.substring(4)}</h3>;
      } else if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
        return <li key={idx} style={{ marginLeft: '1rem', listStyleType: 'disc' }}>{trimmed.substring(2)}</li>;
      } else if (trimmed) {
        // Basic bold replacement **text** -> <strong>text</strong>
        const parts = trimmed.split('**');
        const formattedLine = parts.map((part, i) => i % 2 === 1 ? <strong key={i}>{part}</strong> : part);
        return <p key={idx}>{formattedLine}</p>;
      }
      return <div key={idx} style={{ height: '0.5rem' }}></div>;
    });
  };

  return (
    <div className="app-container">
      {/* Top Navbar */}
      <header className="app-header">
        <div className="logo-section">
          <div className="logo-icon">S</div>
          <span className="logo-title">StudyAssist AI</span>
        </div>
        
        <div className="api-key-section">
          <span className="logo-text" style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Gemini API Key:</span>
          <input
            type="password"
            className="api-key-input"
            placeholder="enter key (sk-... or AIza...)"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          {apiKey ? (
            <span className="api-key-badge saved">Active</span>
          ) : (
            <span className="api-key-badge missing">Key Required</span>
          )}
        </div>
      </header>

      {/* Main Panel layout */}
      <div className="main-content">
        {/* Sidebar */}
        <aside className="sidebar">
          {/* Upload Zone */}
          <div className="upload-container">
            <span className="upload-title">Study Material</span>
            <div 
              className={`drop-zone ${isDragOver ? 'active' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                style={{ display: 'none' }}
                accept=".pdf,.txt,.md"
              />
              <span className="upload-icon">📂</span>
              <span className="upload-text">Drag & drop or Click to upload PDF / TXT</span>
            </div>
            
            {file && (
              <div className="file-info-box">
                <span className="file-name">📄 {file.name}</span>
                <span className="file-status">Size: {file.size}</span>
                {uploadLoading && <span className="file-status" style={{ color: 'var(--primary)' }}>Analyzing...</span>}
              </div>
            )}
          </div>

          {/* Navigation Menu */}
          {sessionId && (
            <div className="nav-menu">
              <button 
                className={`nav-item ${activeTab === 'summary' ? 'active' : ''}`}
                onClick={() => setActiveTab('summary')}
              >
                <span className="nav-icon">📝</span> Document Summary
              </button>
              <button 
                className={`nav-item ${activeTab === 'tips' ? 'active' : ''}`}
                onClick={tips ? () => setActiveTab('tips') : generateTips}
                disabled={tipsLoading}
              >
                <span className="nav-icon">📚</span> {tipsLoading ? 'Generating Tips...' : 'Study Tips & Prep'}
              </button>
              <button 
                className={`nav-item ${activeTab === 'doubt' ? 'active' : ''}`}
                onClick={() => setActiveTab('doubt')}
              >
                <span className="nav-icon">💬</span> Ask Doubts
              </button>
              <button 
                className={`nav-item ${activeTab === 'quiz' ? 'active' : ''}`}
                onClick={quiz ? () => setActiveTab('quiz') : generateQuiz}
                disabled={quizLoading}
              >
                <span className="nav-icon">💡</span> {quizLoading ? 'Generating Quiz...' : 'Practice Quiz'}
              </button>
            </div>
          )}
        </aside>

        {/* Workspace panel */}
        <main className="workspace">
          {uploadLoading ? (
            <div className="spinner-container">
              <div className="spinner"></div>
              <span className="spinner-text">AI is reading the document and extracting key concepts...</span>
            </div>
          ) : !sessionId ? (
            /* Welcome state / Upload prompt */
            <div className="empty-state">
              <div className="empty-icon">🎓</div>
              <span className="empty-text-title">Your AI Study Companion</span>
              <span className="empty-text-desc">
                Upload a lecture slide, textbook PDF, or note file. The agent will summarize it, answer your custom questions, and quiz you to reinforce your learning!
              </span>
              {needsApiKey && (
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: '0.5rem', border: '1px solid rgba(239, 68, 68, 0.2)', maxWidth: '400px' }}>
                  <span style={{ color: 'var(--error)', fontSize: '0.9rem', fontWeight: 600 }}>API Key Required:</span>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                    We uploaded the file successfully, but we need your Gemini API Key in the top right to start communicating with the AI.
                  </p>
                </div>
              )}
            </div>
          ) : (
            /* Dashboard Panels */
            <div className="panel-container">
              
              {/* Tab 1: Summary */}
              {activeTab === 'summary' && (
                <div className="glass-card">
                  <div className="panel-header">
                    <h2 className="panel-title">Document Summary</h2>
                    <span className="panel-subtitle">Synthesized core points from {file?.name}</span>
                  </div>
                  <div className="summary-content">
                    {formatSummaryText(summary)}
                  </div>
                </div>
              )}

              {/* Tab 4: Study Tips & Prep */}
              {activeTab === 'tips' && (
                <div className="glass-card">
                  <div className="panel-header">
                    <h2 className="panel-title">Study Tips & Exam Prep</h2>
                    <span className="panel-subtitle">Strategic study advice tailored to {file?.name}</span>
                  </div>
                  
                  {tipsLoading ? (
                    <div className="spinner-container">
                      <div className="spinner"></div>
                      <span className="spinner-text">Analyzing document and generating high-yield tips...</span>
                    </div>
                  ) : tips ? (
                    <div className="summary-content">
                      {formatSummaryText(tips)}
                    </div>
                  ) : (
                    <div className="empty-state" style={{ height: 'auto', padding: '2rem 0' }}>
                      <span className="empty-icon">📚</span>
                      <span className="empty-text-title">Generate Study Plan</span>
                      <span className="empty-text-desc">
                        Get tailored study tips, mnemonic recommendations, and key exam prep advice for this material.
                      </span>
                      <button className="action-btn" onClick={generateTips}>
                        Generate Study Tips
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Doubt Chat */}
              {activeTab === 'doubt' && (
                <div className="glass-card chat-wrapper">
                  <div className="panel-header">
                    <h2 className="panel-title">Doubt Solver</h2>
                    <span className="panel-subtitle">Ask anything from the document or internet</span>
                  </div>
                  
                  <div className="messages-list">
                    {messages.map((msg, idx) => (
                      <div key={idx} className={`chat-message ${msg.sender === 'user' ? 'user' : 'assistant'}`}>
                        <div className="avatar">{msg.sender === 'user' ? 'ME' : 'AI'}</div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <div className="message-bubble">{msg.text}</div>
                          {msg.source && (
                            <div className={`message-source ${msg.source}`}>
                              {msg.source === 'doc' && <span>📖 Answer found in Document</span>}
                              {msg.source === 'web' && <span>🌐 Answer found via Web Search</span>}
                              {msg.source === 'both' && <span>📖🌐 Compiled from Document & Web</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="chat-message assistant">
                        <div className="avatar">AI</div>
                        <div className="message-bubble" style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                          <span style={{ animation: 'pulse 1s infinite' }}>Thinking...</span>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                  
                  <form onSubmit={handleSendMessage} className="chat-input-area">
                    <input 
                      type="text" 
                      className="chat-input"
                      placeholder="Ask a doubt... (e.g. 'Explain topic X in detail' or 'Find external real-world applications')"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      disabled={chatLoading}
                    />
                    <button type="submit" className="send-btn" disabled={!chatInput.trim() || chatLoading}>
                      <span className="icon-send">⚡</span>
                    </button>
                  </form>
                </div>
              )}

              {/* Tab 3: Interactive Quiz */}
              {activeTab === 'quiz' && (
                <div className="glass-card">
                  <div className="panel-header">
                    <h2 className="panel-title">Practice Quiz</h2>
                    <span className="panel-subtitle">Reinforce your understanding of the materials</span>
                  </div>

                  {quizLoading ? (
                    <div className="spinner-container">
                      <div className="spinner"></div>
                      <span className="spinner-text">Creating 5 targeted multiple choice questions from the document...</span>
                    </div>
                  ) : quiz ? (
                    !quizSubmitted ? (
                      /* Quiz Wizard View */
                      <div className="quiz-card">
                        <div className="quiz-progress-bar">
                          <div 
                            className="quiz-progress-fill" 
                            style={{ width: `${((currentQuizIndex + 1) / quiz.length) * 100}%` }}
                          ></div>
                        </div>

                        <div className="quiz-header">
                          <span className="quiz-count">Question {currentQuizIndex + 1} of {quiz.length}</span>
                          <span className="quiz-score">Score: {getQuizScore()} / {Object.keys(answeredQuestions).length}</span>
                        </div>

                        <span className="question-text">{quiz[currentQuizIndex]?.question}</span>

                        <div className="options-container">
                          {quiz[currentQuizIndex]?.options.map((option, idx) => {
                            const hasBeenAnswered = answeredQuestions[currentQuizIndex] !== undefined;
                            const isSelected = selectedOption === idx;
                            
                            // Visual classes based on whether question is answered
                            let optionClass = '';
                            if (hasBeenAnswered) {
                              const selectedAnswer = answeredQuestions[currentQuizIndex].selectedAnswer;
                              const correctAnswer = quiz[currentQuizIndex].correctAnswer;
                              if (idx === correctAnswer) {
                                optionClass = 'correct';
                              } else if (idx === selectedAnswer) {
                                optionClass = 'incorrect';
                              }
                            } else if (isSelected) {
                              optionClass = 'selected';
                            }

                            return (
                              <button
                                key={idx}
                                className={`option-button ${optionClass}`}
                                onClick={() => handleOptionSelect(idx)}
                                disabled={hasBeenAnswered}
                              >
                                <span>
                                  <span className="option-letter">{['A', 'B', 'C', 'D'][idx]}</span>
                                  {option}
                                </span>
                                {hasBeenAnswered && idx === quiz[currentQuizIndex].correctAnswer && <span>✓</span>}
                                {hasBeenAnswered && isSelected && idx !== quiz[currentQuizIndex].correctAnswer && <span>✗</span>}
                              </button>
                            );
                          })}
                        </div>

                        {/* feedback details */}
                        {answeredQuestions[currentQuizIndex] !== undefined && (
                          <div className={`feedback-container ${answeredQuestions[currentQuizIndex].isCorrect ? 'correct' : 'incorrect'}`}>
                            <div className={`feedback-title ${answeredQuestions[currentQuizIndex].isCorrect ? 'correct' : 'incorrect'}`}>
                              {answeredQuestions[currentQuizIndex].isCorrect ? '✓ Correct Answer' : '✗ Incorrect'}
                            </div>
                            <p className="feedback-text">{quiz[currentQuizIndex]?.explanation}</p>
                          </div>
                        )}

                        <div className="quiz-footer">
                          {answeredQuestions[currentQuizIndex] === undefined ? (
                            <button 
                              className="action-btn"
                              onClick={handleSubmitAnswer}
                              disabled={selectedOption === null}
                            >
                              Submit Answer
                            </button>
                          ) : (
                            <button 
                              className="action-btn"
                              onClick={handleNextQuestion}
                            >
                              {currentQuizIndex < quiz.length - 1 ? 'Next Question' : 'View Results'}
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* Quiz Results View */
                      <div className="quiz-results-container">
                        <div className="results-graphic">
                          {getQuizScore()} / {quiz.length}
                        </div>
                        <h3 className="results-title">Quiz Completed!</h3>
                        <p className="results-score">
                          You scored <strong>{getQuizScore()} out of {quiz.length}</strong> ({((getQuizScore() / quiz.length) * 100).toFixed(0)}%)
                        </p>
                        <p className="results-desc">
                          {getQuizScore() === quiz.length 
                            ? 'Outstanding! You have mastered the contents of this document.' 
                            : getQuizScore() >= 3 
                              ? 'Good job! You understand most of the concepts. Review the summary or chat with the agent to clear any doubts.' 
                              : 'Keep studying! Read through the summary again and try asking questions in the Doubt Solver.'}
                        </p>
                        
                        <button className="action-btn" onClick={generateQuiz}>
                          Try Again
                        </button>
                      </div>
                    )
                  ) : (
                    /* Initial prompt to generate quiz */
                    <div className="empty-state" style={{ height: 'auto', padding: '2rem 0' }}>
                      <span className="empty-icon">💡</span>
                      <span className="empty-text-title">Ready to test yourself?</span>
                      <span className="empty-text-desc">
                        Generate 5 customized multiple choice questions matching the concepts from your document.
                      </span>
                      <button className="action-btn" onClick={generateQuiz}>
                        Generate Practice Quiz
                      </button>
                    </div>
                  )}
                </div>
              )}

            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
