import { useState, useEffect } from 'react';
import './MemoryBrowser.css';

export default function SkillsPanel() {
    const [skills, setSkills] = useState<any[]>([]);

    useEffect(() => {
        const fetchSkills = async () => {
            try {
                const res = await fetch('http://localhost:4000/api/skills');
                if (res.ok) setSkills(await res.json());
            } catch (e) {
                console.error("Error fetching skills", e);
            }
        };
        fetchSkills();
        const interval = setInterval(fetchSkills, 30000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="memory-container animate-fade-in">
            <div className="mem-header">
                <h2 className="title-orange" style={{ color: '#ab47bc' }}>Agent Skills Explorer</h2>
                <p className="subtitle">Registered capabilities dynamically available to EchoClaw</p>
            </div>

            <div className="mem-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                {skills.length === 0 && <div className="empty" style={{ background: '#1a1a1a' }}>No skills currently registered.</div>}

                {skills.map((skill, index) => (
                    <div key={index} className="mem-card glass-panel" style={{ background: '#1a1a1a', borderLeft: '3px solid #ab47bc', display: 'flex', flexDirection: 'column' }}>
                        <div className="mem-meta" style={{ marginBottom: '10px' }}>
                            <span style={{ fontWeight: 'bold', color: '#ab47bc', fontSize: '1.1rem' }}>{skill.name}</span>
                        </div>
                        <div className="mem-content" style={{ color: '#ccc', flex: 1 }}>
                            {skill.description}
                        </div>
                        <div style={{ marginTop: '15px', paddingTop: '10px', borderTop: '1px solid #333' }}>
                            <span style={{ fontSize: '0.8rem', color: '#666' }}>Requires {Object.keys(skill.input_schema?.properties || {}).length} input parameters</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
