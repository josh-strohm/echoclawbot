import { useState, useEffect, useRef } from 'react';
import './ChatInterface.css';

interface Message {
    id: number;
    role: 'user' | 'assistant';
    content: string;
    created_at: string;
}

export default function ChatInterface() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isSending, setIsSending] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const chatId = "dashboard_user";

    const fetchHistory = async () => {
        try {
            const res = await fetch(`http://localhost:4000/api/db/messages?chatId=${chatId}`);
            if (res.ok) {
                const data = await res.json();
                // Only update if we have data
                if (data && data.length > 0) {
                    setMessages(data);
                }
            }
        } catch (e) {
            console.error("Error fetching chat history", e);
        }
    };

    useEffect(() => {
        // Initial fetch only - don't poll continuously
        fetchHistory();
    }, []);

    // Keep cursor in input field after agent responds
    useEffect(() => {
        if (!isSending && inputRef.current) {
            inputRef.current.focus();
        }
    }, [messages, isSending]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isSending]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isSending) return;

        const userMsg = input.trim();
        setInput('');
        setIsSending(true);

        // Optimistically add user message
        const userMsgId = Date.now();
        const assistantMsgId = userMsgId + 1;
        
        const optimisticUserMsg: Message = {
            id: userMsgId,
            role: 'user',
            content: userMsg,
            created_at: new Date().toISOString()
        };
        
        // Show user message immediately
        setMessages(prev => [...prev, optimisticUserMsg]);

        try {
            console.log("Sending message to API:", userMsg);
            
            // Add timeout - 60 seconds
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000);
            
            const res = await fetch('http://localhost:4000/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: userMsg, chatId }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            console.log("API response status:", res.status);
            
            if (res.ok) {
                const data = await res.json();
                console.log("API response data:", data);
                
                // Add the assistant's response directly to messages!
                if (data.response) {
                    const assistantMsg: Message = {
                        id: assistantMsgId,
                        role: 'assistant',
                        content: data.response,
                        created_at: new Date().toISOString()
                    };
                    setMessages(prev => [...prev, assistantMsg]);
                }
                
                // DON'T call fetchHistory - it will overwrite our messages!
                // The messages are saved to DB in the background
            } else {
                const error = await res.json();
                console.error("API error:", error);
                alert("Error: " + (error.error || error.message || "Unknown error"));
            }
        } catch (e: any) {
            console.error("Error sending message", e);
            if (e.name === 'AbortError') {
                alert("Request timed out after 60 seconds");
            } else {
                alert("Error: " + e.message);
            }
        } finally {
            setIsSending(false);
            // Focus the input field so user can type again immediately
            inputRef.current?.focus();
        }
    };

    return (
        <div className="chat-container animate-fade-in">
            <div className="chat-header">
                <div>
                    <h2 className="title-cyan">Agent Chat</h2>
                    <p className="subtitle">Direct interface with EchoClaw Core</p>
                </div>
                <div className="pulse-indicator">
                    <div className="dot" style={{ backgroundColor: '#00d2ff' }}></div> Connected
                </div>
            </div>

            <div className="chat-messages glass-panel">
                {messages.length === 0 && !isSending && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666' }}>
                        No messages yet. Say hello!
                    </div>
                )}
                {messages.map((msg) => (
                    <div key={msg.id} className={`message ${msg.role}`}>
                        <div className="message-content">{msg.content}</div>
                        <span className="message-time">
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    </div>
                ))}
                {isSending && (
                    <div className="typing-indicator">
                        <div className="typing-dots">
                            <span></span><span></span><span></span>
                        </div>
                        Agent is thinking...
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <form className="chat-input-area" onSubmit={handleSend}>
                <input
                    ref={inputRef}
                    className="chat-input"
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Type a message to the agent..."
                    disabled={isSending}
                />
                <button className="chat-send-btn" type="submit" disabled={!input.trim() || isSending}>
                    {isSending ? '...' : '➤'}
                </button>
            </form>
        </div>
    );
}
