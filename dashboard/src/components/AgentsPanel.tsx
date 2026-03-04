import { useState, useEffect } from 'react';
import './MemoryBrowser.css';

interface Agent {
    id: string;
    name: string;
    model: string;
    sessions: number;
    promptTokens: number;
    completionTokens: number;
    status: string;
    lastActive: string;
}

export default function AgentsPanel() {
    const [agents, setAgents] = useState<Agent[]>([]);

    useEffect(() => {
        // We fetch costs to get the real-time model and tokens for the primary agent
        const fetchAgents = async () => {
            try {
                const res = await fetch('http://localhost:4000/api/costs');
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.length > 0) {
                        const primary = data[0];
                        setAgents([
                            {
                                id: 'core-1',
                                name: 'EchoClaw Main',
                                model: primary.model,
                                sessions: Math.round(primary.promptTokens / 650), // Approx based on DB formula
                                promptTokens: primary.promptTokens,
                                completionTokens: primary.completionTokens,
                                status: 'Active',
                                lastActive: new Date().toLocaleTimeString()
                            }
                        ]);
                    }
                }
            } catch (e) {
                console.error("Error fetching agents", e);
            }
        };
        fetchAgents();
        const interval = setInterval(fetchAgents, 5000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="memory-container animate-fade-in">
            <div className="mem-header">
                <h2 className="title-orange" style={{ color: '#29b6f6' }}>Agent Dashboard</h2>
                <p className="subtitle">All agents, their sessions, token usage, model, and activity status</p>
            </div>

            <div className="mem-grid" style={{ gridTemplateColumns: '1fr' }}>
                <div className="mem-column">
                    <div className="mem-list">
                        {agents.length === 0 && <div className="empty" style={{ background: '#1a1a1a' }}>Loading agents...</div>}

                        {agents.map((agent) => (
                            <div key={agent.id} className="mem-card glass-panel" style={{ background: '#1a1a1a', borderLeft: '3px solid #29b6f6', display: 'flex', flexDirection: 'column' }}>
                                <div className="mem-meta" style={{ marginBottom: '15px' }}>
                                    <span style={{ fontWeight: 'bold', color: '#29b6f6', fontSize: '1.2rem' }}>{agent.name}</span>
                                    <span className="badge" style={{ background: 'rgba(41, 182, 246, 0.15)', color: '#29b6f6', padding: '4px 8px', borderRadius: '4px' }}>
                                        {agent.status}
                                    </span>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', padding: '15px', background: '#0a0a0a', borderRadius: '8px' }}>
                                    <div>
                                        <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '4px' }}>Model</div>
                                        <div style={{ color: '#fff', fontWeight: '500' }}>{agent.model}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '4px' }}>Total Sessions</div>
                                        <div style={{ color: '#fff', fontWeight: '500' }}>{agent.sessions.toLocaleString()}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '4px' }}>Token Usage</div>
                                        <div style={{ color: '#fff', fontWeight: '500' }}>
                                            <span style={{ color: '#bbb' }}>P:</span> {agent.promptTokens.toLocaleString()} <br />
                                            <span style={{ color: '#bbb' }}>C:</span> {agent.completionTokens.toLocaleString()}
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '4px' }}>Last Activity</div>
                                        <div style={{ color: '#fff', fontWeight: '500' }}>{agent.lastActive}</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
