registerTab('agents', async (root) => {
    const agents = await fetchApi('/api/agents');

    let html = '';
    if (agents && agents.length > 0) {
        html = `<div class="grid-cards">
            ${agents.map(a => `
                <div class="card" style="border-top: 4px solid ${a.status === 'online' ? '#4cd137' : '#e84118'}">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <h3 style="font-size:18px; color:var(--text-primary); text-transform:none; margin:0;">${a.name}</h3>
                        <div style="width:12px; height:12px; border-radius:50%; background:${a.status === 'online' ? '#4cd137' : '#e84118'}; box-shadow: 0 0 8px ${a.status === 'online' ? '#4cd137' : '#e84118'};"></div>
                    </div>
                    <div style="color:var(--highlight-color); font-size:12px; margin-top:5px; font-weight:bold; letter-spacing:1px; text-transform:uppercase;">${a.role}</div>
                    
                    <div style="margin-top:15px; font-size:14px;">
                        <span style="color:var(--text-secondary);">Model:</span> <span class="mono">${a.model}</span>
                    </div>
                    <div style="margin-top:5px; font-size:14px;">
                        <span style="color:var(--text-secondary);">Tokens:</span> <span class="mono">${a.total_tokens.toLocaleString()}</span>
                    </div>
                    <div style="margin-top:5px; font-size:14px;">
                        <span style="color:var(--text-secondary);">Last Active:</span> <span class="mono">${a.last_active ? new Date(a.last_active).toLocaleString() : 'Never'}</span>
                    </div>
                    
                    <div style="margin-top:20px; display:flex; gap:10px;">
                        <button onclick="toggleAgent('${a.id}', '${a.status === 'online' ? 'offline' : 'online'}')" style="flex:1; padding:8px; border-radius:6px; cursor:pointer; background:var(--bg-color); color:var(--text-primary); border:1px solid var(--accent-color);">
                            Set ${a.status === 'online' ? 'Offline' : 'Online'}
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>`;
    } else {
        html = '<p>No agents deployed.</p>';
    }

    root.innerHTML = `
        <div class="module-section" style="background:transparent; border:none; padding:0;">
            ${html}
        </div>
    `;

    window.toggleAgent = async (id, status) => {
        await fetchApi(`/api/agents/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        loadCurrentTab();
    };
});
