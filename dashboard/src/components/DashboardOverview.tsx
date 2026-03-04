import { useEffect, useState } from 'react';
import './DashboardOverview.css';

interface SystemHealth {
    cpu: string;
    uptime: number;
}

export default function DashboardOverview() {
    const [health, setHealth] = useState<SystemHealth | null>(null);
    const [agentData, setAgentData] = useState<any>(null);

    useEffect(() => {
        const fetchAll = async () => {
            try {
                const [healthRes, costRes] = await Promise.all([
                    fetch('http://localhost:4000/api/system/health'),
                    fetch('http://localhost:4000/api/costs')
                ]);

                if (healthRes.ok) setHealth(await healthRes.json());
                if (costRes.ok) {
                    const data = await costRes.json();
                    if (data && data.length > 0) setAgentData(data[0]);
                }
            } catch (e) {
                // fail silently for visual
            }
        };
        fetchAll();
        const interval = setInterval(fetchAll, 5000);
        return () => clearInterval(interval);
    }, []);

    const agents = [
        { name: 'EchoClaw Core', sub: agentData ? agentData.model : 'Awaiting sync...', color: '#ff4d4d', icon: '🤖' }
    ];

    return (
        <div className="dashboard-container animate-fade-in">
            <header className="dash-header">
                <h1 className="dash-title"><span className="lobster-icon">🦞</span> System Overview</h1>
                <p className="dash-subtitle">Overview of EchoClaw core activity</p>
            </header>

            <div className="metrics-row">
                <div className="metric-card">
                    <div className="metric-header">
                        <span>Total Queries</span>
                        <span className="metric-icon blue-line">N</span>
                    </div>
                    <div className="metric-value">{agentData ? Math.round(agentData.promptTokens / 650) : '--'}</div>
                </div>

                <div className="metric-card">
                    <div className="metric-header">
                        <span>Process</span>
                        <span className="metric-icon green-check">✓</span>
                    </div>
                    <div className="metric-value">Online</div>
                </div>

                <div className="metric-card weather-card">
                    <div className="weather-top">
                        <span className="location">📍 SERVER</span>
                    </div>
                    <div className="weather-mid">
                        <div className="time">{health ? (health.uptime / 3600).toFixed(1) : '--'}<span className="date">Hours Uptime</span></div>
                    </div>
                    <div className="weather-bot">
                        <span>CPU: {health?.cpu || 'Syncing Telemetry...'}</span>
                    </div>
                </div>
            </div>

            <div className="agents-section">
                <div className="agents-header">
                    <h2 className="agents-title">👥 Multi-Agent System</h2>
                    <div className="agents-actions">
                        <button className="btn btn-link">View all →</button>
                    </div>
                </div>

                <div className="agents-grid">
                    {agents.map((agent, i) => (
                        <div key={i} className="agent-card" style={{ borderColor: agent.color }}>
                            <div className="agent-top">
                                <span className="agent-icon">{agent.icon}</span>
                                <div className="agent-dot" style={{ background: agent.color }}></div>
                            </div>
                            <div className="agent-mid">
                                <div className="agent-name">{agent.name}</div>
                                <div className="agent-sub">🤖 {agent.sub}</div>
                            </div>
                            <div className="agent-bot" style={{ color: agent.color }}>
                                💬 Connected
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
