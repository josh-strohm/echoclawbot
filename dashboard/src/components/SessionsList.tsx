import { useEffect, useState } from 'react';
import './MemoryBrowser.css';

interface Message {
    id: number;
    role: string;
    content: string;
    created_at: string;
}

export default function SessionsList() {
    const [messages, setMessages] = useState<Message[]>([]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch('http://localhost:4000/api/db/messages');
                if (res.ok) setMessages(await res.json());
            } catch (e) {
                console.error("Error fetching messages", e);
            }
        };
        fetchData();
        const interval = setInterval(fetchData, 3000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="memory-container animate-fade-in">
            <div className="mem-header">
                <h2 className="title-orange" style={{ color: '#29b6f6' }}>Agent Sessions</h2>
                <p className="subtitle">Recent Chat History</p>
            </div>

            <div className="mem-grid" style={{ gridTemplateColumns: '1fr' }}>
                <div className="mem-column">
                    <div className="mem-list">
                        {messages.length === 0 && <div className="empty" style={{ background: '#1a1a1a' }}>No messages found in DB.</div>}
                        {messages.map(m => (
                            <div key={m.id} className="mem-card glass-panel" style={{
                                background: '#1a1a1a',
                                borderLeft: m.role === 'user' ? '3px solid #ab47bc' : '3px solid #29b6f6',
                                marginLeft: m.role === 'user' ? '0' : '50px',
                                marginRight: m.role === 'user' ? '50px' : '0'
                            }}>
                                <div className="mem-meta">
                                    <span style={{ fontWeight: 'bold', color: m.role === 'user' ? '#ab47bc' : '#29b6f6' }}>{m.role.toUpperCase()}</span>
                                    <span className="date">{new Date(m.created_at).toLocaleString()}</span>
                                </div>
                                <div className="mem-content" style={{ whiteSpace: 'pre-wrap', maxHeight: '200px', overflowY: 'auto' }}>{m.content}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
