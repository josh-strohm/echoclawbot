import { useEffect, useState } from 'react';
import './MemoryBrowser.css';

interface Memory {
    id: number;
    type: string;
    category?: string;
    content: string;
    importance: number;
    created_at: string;
}

export default function MemoryBrowser() {
    const [memories, setMemories] = useState<Memory[]>([]);
    const [coreMemories, setCoreMemories] = useState<Memory[]>([]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const memRes = await fetch('http://localhost:4000/api/db/memories');
                setMemories(await memRes.json());

                const coreRes = await fetch('http://localhost:4000/api/db/core_memory');
                setCoreMemories(await coreRes.json());
            } catch (e) {
                console.error("Error fetching memories", e);
            }
        };
        fetchData();
        const interval = setInterval(fetchData, 10000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="memory-container animate-fade-in">
            <div className="mem-header">
                <h2 className="title-orange">Neural Matrix Viewer</h2>
                <p className="subtitle">Agent's persistent knowledge graph</p>
            </div>

            <div className="mem-grid">
                <div className="mem-column">
                    <h3><span className="icon">💎</span> Core Directives</h3>
                    <div className="mem-list">
                        {coreMemories.length === 0 && <div className="empty">No core memories found.</div>}
                        {coreMemories.map(m => (
                            <div key={m.id} className="mem-card glass-panel core-card">
                                <div className="mem-meta">
                                    <span className="badge category-badge">{m.category}</span>
                                    <span className="date">{new Date(m.created_at).toLocaleDateString()}</span>
                                </div>
                                <div className="mem-content">{m.content}</div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="mem-column">
                    <h3><span className="icon">🧠</span> Episodic Memory</h3>
                    <div className="mem-list">
                        {memories.length === 0 && <div className="empty">No episodic memories found.</div>}
                        {memories.map(m => (
                            <div key={m.id} className="mem-card glass-panel">
                                <div className="mem-meta">
                                    <span className="badge type-badge">{m.type}</span>
                                    <div className="importance-bar">
                                        <div className="fill" style={{ width: `${m.importance * 100}%` }}></div>
                                    </div>
                                </div>
                                <div className="mem-content">{m.content}</div>
                                <div className="mem-footer date">{new Date(m.created_at).toLocaleString()}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
