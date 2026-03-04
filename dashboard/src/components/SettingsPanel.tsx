import { useState, useEffect } from 'react';
import './MemoryBrowser.css';

export default function SettingsPanel() {
    const [anthropicApiKey, setAnthropicApiKey] = useState('********************************');
    const [openAIApiKey, setOpenAIApiKey] = useState('********************************');
    const [openRouterApiKey, setOpenRouterApiKey] = useState('********************************');
    const [googleApiKey, setGoogleApiKey] = useState('********************************');

    const [model, setModel] = useState('Loading...');
    const [provider, setProvider] = useState('Loading...');
    const [maxIterations, setMaxIterations] = useState('Loading...');

    useEffect(() => {
        fetch('http://localhost:4000/api/settings')
            .then(res => res.json())
            .then(data => {
                if (data.anthropicApiKey !== undefined) setAnthropicApiKey(data.anthropicApiKey);
                if (data.openAIApiKey !== undefined) setOpenAIApiKey(data.openAIApiKey);
                if (data.openRouterApiKey !== undefined) setOpenRouterApiKey(data.openRouterApiKey);
                if (data.googleApiKey !== undefined) setGoogleApiKey(data.googleApiKey);

                setModel(data.model);
                setProvider(data.provider);
                setMaxIterations(data.maxIterations);
            })
            .catch(err => console.error("Error loading settings", err));
    }, []);

    return (
        <div className="memory-container animate-fade-in">
            <div className="mem-header">
                <h2 className="title-orange" style={{ color: '#aaaaaa' }}>System Configuration</h2>
                <p className="subtitle">Manage EchoClaw agent environment variables</p>
            </div>

            <div className="mem-grid" style={{ gridTemplateColumns: '1fr' }}>
                <div className="mem-column">
                    <div className="glass-panel" style={{ padding: '24px', background: '#1a1a1a', borderLeft: '3px solid #666' }}>
                        <h3 style={{ marginBottom: '20px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>Core Settings</h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', color: '#888', fontSize: '0.85rem' }}>ANTHROPIC_API_KEY</label>
                                <input type="password" value={anthropicApiKey} onChange={e => setAnthropicApiKey(e.target.value)} style={{ width: '100%', padding: '10px', background: '#0a0a0a', border: '1px solid #333', color: '#fff', borderRadius: '4px', fontFamily: 'monospace' }} />
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', color: '#888', fontSize: '0.85rem' }}>OPENAI_API_KEY</label>
                                <input type="password" value={openAIApiKey} onChange={e => setOpenAIApiKey(e.target.value)} style={{ width: '100%', padding: '10px', background: '#0a0a0a', border: '1px solid #333', color: '#fff', borderRadius: '4px', fontFamily: 'monospace' }} />
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', color: '#888', fontSize: '0.85rem' }}>OPENROUTER_API_KEY</label>
                                <input type="password" value={openRouterApiKey} onChange={e => setOpenRouterApiKey(e.target.value)} style={{ width: '100%', padding: '10px', background: '#0a0a0a', border: '1px solid #333', color: '#fff', borderRadius: '4px', fontFamily: 'monospace' }} />
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', color: '#888', fontSize: '0.85rem' }}>GOOGLE_API_KEY</label>
                                <input type="password" value={googleApiKey} onChange={e => setGoogleApiKey(e.target.value)} style={{ width: '100%', padding: '10px', background: '#0a0a0a', border: '1px solid #333', color: '#fff', borderRadius: '4px', fontFamily: 'monospace' }} />
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', color: '#888', fontSize: '0.85rem' }}>PROVIDER</label>
                                <select value={provider} onChange={e => setProvider(e.target.value)} style={{ width: '100%', padding: '10px', background: '#0a0a0a', border: '1px solid #333', color: '#fff', borderRadius: '4px' }}>
                                    <option value="openrouter">OpenRouter</option>
                                    <option value="anthropic">Anthropic</option>
                                    <option value="openai">OpenAI</option>
                                    <option value="google">Google</option>
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', color: '#888', fontSize: '0.85rem' }}>CLAUDE_MODEL</label>
                                <input type="text" value={model} onChange={e => setModel(e.target.value)} style={{ width: '100%', padding: '10px', background: '#0a0a0a', border: '1px solid #333', color: '#fff', borderRadius: '4px' }} />
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', color: '#888', fontSize: '0.85rem' }}>MAX_AGENT_ITERATIONS</label>
                                <input type="number" value={maxIterations} onChange={e => setMaxIterations(e.target.value)} style={{ width: '100%', padding: '10px', background: '#0a0a0a', border: '1px solid #333', color: '#fff', borderRadius: '4px' }} />
                            </div>

                            <button className="btn btn-red" style={{ alignSelf: 'flex-start', background: '#00e676', marginTop: '10px', padding: '10px 20px' }}>Save Configuration</button>
                        </div>
                    </div>

                    <div className="glass-panel" style={{ padding: '24px', background: '#1a1a1a', borderLeft: '3px solid #ff4d4d', marginTop: '20px' }}>
                        <h3 style={{ marginBottom: '20px', borderBottom: '1px solid #333', paddingBottom: '10px', color: '#ff4d4d' }}>Danger Zone</h3>
                        <p style={{ color: '#888', marginBottom: '15px', fontSize: '0.9rem' }}>Destructive actions that cannot be undone.</p>

                        <div style={{ display: 'flex', gap: '15px' }}>
                            <button className="btn btn-red" style={{ border: '1px solid #ff4d4d', background: 'transparent' }}>Wipe Memory DB</button>
                            <button className="btn btn-red" style={{ border: '1px solid #ff4d4d', background: 'var(--primary-red)' }}>Restart Agent Core</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
