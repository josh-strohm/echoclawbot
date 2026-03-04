import { useEffect, useState, useRef } from 'react';
import './ActivityFeed.css';

export default function ActivityFeed() {
    const [logs, setLogs] = useState<string[]>([]);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchLogs = async () => {
            try {
                const res = await fetch('http://localhost:4000/api/logs');
                const data = await res.json();
                if (data.logs) {
                    setLogs(data.logs);
                }
            } catch (e) {
                console.error("Error fetching logs", e);
            }
        };

        fetchLogs();
        const interval = setInterval(fetchLogs, 3000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, [logs]);

    return (
        <div className="activity-container animate-fade-in">
            <div className="header-row">
                <h2 className="title-cyan">Live Agent Telemetry</h2>
                <div className="pulse-indicator">
                    <div className="dot"></div> Live Activity
                </div>
            </div>

            <div className="log-panel glass-panel" ref={containerRef}>
                {logs.length === 0 ? (
                    <div className="no-logs">Listening for agent telemetry...</div>
                ) : (
                    logs.map((log, index) => {
                        const isError = log.toLowerCase().includes('error');
                        const isWarn = log.toLowerCase().includes('warn');
                        const isTool = log.toLowerCase().includes('tool');

                        let highlightClass = '';
                        if (isError) highlightClass = 'log-error';
                        if (isWarn) highlightClass = 'log-warn';
                        if (isTool) highlightClass = 'log-tool';

                        return (
                            <div key={index} className={`log-entry ${highlightClass} monospaced`}>
                                <span className="log-index">{(index + 1).toString().padStart(4, '0')}</span>
                                <span className="log-content">{log}</span>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
