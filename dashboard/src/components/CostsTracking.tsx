import { useState, useEffect } from 'react';
import './MemoryBrowser.css';

export default function CostsTracking() {
    const [costs, setCosts] = useState<any[]>([]);

    useEffect(() => {
        const fetchCosts = async () => {
            try {
                const res = await fetch('http://localhost:4000/api/costs');
                if (res.ok) setCosts(await res.json());
            } catch (e) {
                console.error("Error fetching costs", e);
            }
        };
        fetchCosts();
        const interval = setInterval(fetchCosts, 5000);
        return () => clearInterval(interval);
    }, []);

    const totalCost = costs.reduce((sum, c) => sum + c.cost, 0);

    return (
        <div className="memory-container animate-fade-in">
            <div className="mem-header">
                <h2 className="title-orange" style={{ color: '#fdd835' }}>Cost Tracking Analytics</h2>
                <p className="subtitle">Real cost analytics from AI model sessions</p>
            </div>

            <div className="metrics-row" style={{ marginBottom: '24px' }}>
                <div className="metric-card">
                    <div className="metric-header">
                        <span>Current Month</span>
                        <span className="metric-icon" style={{ color: '#fdd835' }}>💰</span>
                    </div>
                    <div className="metric-value" style={{ color: '#fdd835' }}>${totalCost.toFixed(2)}</div>
                </div>
            </div>

            <div className="mem-grid" style={{ gridTemplateColumns: '1fr' }}>
                <div className="mem-column">
                    <div className="mem-list">
                        {costs.map(c => (
                            <div key={c.id} className="mem-card glass-panel" style={{ background: '#1a1a1a', borderLeft: '3px solid #fdd835' }}>
                                <div className="mem-meta">
                                    <span style={{ fontWeight: 'bold', color: '#fdd835' }}>{c.provider ? c.provider.toUpperCase() : 'ANTHROPIC'} • {c.model}</span>
                                    <span className="date">{c.date}</span>
                                </div>
                                <div className="mem-content" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
                                    <span><strong>Agent:</strong> {c.agent}</span>
                                    <span><strong>Prompt Tokens:</strong> {c.promptTokens.toLocaleString()}</span>
                                    <span><strong>Comp Tokens:</strong> {c.completionTokens.toLocaleString()}</span>
                                    <span style={{ color: '#fdd835', fontWeight: 'bold' }}>${c.cost.toFixed(2)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
