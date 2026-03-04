import { useState, useEffect } from 'react';
import './MemoryBrowser.css';

interface AgentFile {
    name: string;
    path: string;
    type: 'file' | 'directory';
    size: number;
    modified: string;
}

export default function FileBrowser() {
    const [elements, setElements] = useState<AgentFile[]>([]);
    const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});

    useEffect(() => {
        const fetchFiles = async () => {
            try {
                const res = await fetch('http://localhost:4000/api/files');
                if (res.ok) setElements(await res.json());
            } catch (e) {
                console.error("Error fetching files", e);
            }
        };
        fetchFiles();
        const interval = setInterval(fetchFiles, 5000);
        return () => clearInterval(interval);
    }, []);

    const toggleFolder = (path: string) => {
        setOpenFolders(prev => ({
            ...prev,
            [path]: !prev[path]
        }));
    };

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    // Helper to get files strictly contained inside a specific directory path wrapper
    const getChildren = (parentPath: string) => {
        return elements.filter(e => {
            if (e.path === parentPath) return false;
            if (!e.path.startsWith(parentPath + '/')) return false;
            // Ensure it's a direct child, not nested deeper.
            const remaining = e.path.substring(parentPath.length + 1);
            return !remaining.includes('/');
        });
    };

    // Level-0 Root files
    const getRootElements = () => {
        return elements.filter(e => {
            // Count slashes to ensure it's at root level '/filename'
            return (e.path.match(/\//g) || []).length === 1;
        });
    };

    const FileNode = ({ file, isChild }: { file: AgentFile; isChild?: boolean }) => {
        if (file.type === 'directory') {
            const children = getChildren(file.path);
            const isOpen = openFolders[file.path] || false;

            return (
                <div style={{ marginLeft: isChild ? '20px' : '0', marginBottom: '10px' }}>
                    <div
                        className="mem-card glass-panel"
                        onClick={() => toggleFolder(file.path)}
                        style={{ background: '#111', borderLeft: '3px solid #ff9800', cursor: 'pointer', padding: '12px 15px' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 'bold', color: '#ff9800', fontSize: '1.1rem' }}>
                                {isOpen ? '📂' : '📁'} {file.name}
                            </span>
                            <span style={{ color: '#888', fontSize: '0.8rem' }}>{children.length} items</span>
                        </div>
                    </div>

                    {isOpen && (
                        <div style={{ marginTop: '10px', borderLeft: '1px solid #333', paddingLeft: '10px' }}>
                            {children.length === 0 ? (
                                <div style={{ padding: '10px', color: '#666', fontStyle: 'italic', marginLeft: '20px' }}>Empty folder</div>
                            ) : (
                                children.map((child, idx) => (
                                    <FileNode key={idx} file={child} isChild={true} />
                                ))
                            )}
                        </div>
                    )}
                </div>
            );
        }

        // Standard File
        return (
            <div className="mem-card glass-panel" style={{ background: '#1a1a1a', borderLeft: '3px solid #ffca28', marginLeft: isChild ? '20px' : '0', marginBottom: '10px' }}>
                <div className="mem-meta" style={{ marginBottom: '5px' }}>
                    <span style={{ fontWeight: 'bold', color: '#ffca28', fontSize: '1.2rem' }}>📄 {file.name}</span>
                    <span style={{ color: '#888', fontSize: '0.9rem' }}>{new Date(file.modified).toLocaleString()}</span>
                </div>
                <div className="mem-content" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
                    <span style={{ fontFamily: 'monospace', color: '#ccc', maxWidth: '70%', wordBreak: 'break-all' }}>{file.path}</span>
                    <span style={{ color: '#00e676', fontWeight: 'bold' }}>{formatBytes(file.size)}</span>
                </div>
            </div>
        );
    };

    const rootElements = getRootElements();

    return (
        <div className="memory-container animate-fade-in">
            <div className="mem-header">
                <h2 className="title-orange" style={{ color: '#ffca28' }}>Workspace File Browser</h2>
                <p className="subtitle">Navigate EchoClaw's locally generated files and outputs</p>
            </div>

            <div className="mem-grid" style={{ gridTemplateColumns: '1fr' }}>
                <div className="mem-column">
                    <div className="mem-list">
                        {elements.length === 0 && <div className="empty" style={{ background: '#1a1a1a' }}>No local files discovered in the agent's base directory.</div>}

                        {rootElements.map((el, i) => (
                            <FileNode key={i} file={el} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
