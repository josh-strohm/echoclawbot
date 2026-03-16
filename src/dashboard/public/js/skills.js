registerTab('skills', async (root) => {
    const schemas = await fetchApi('/api/skills');

    let html = '';
    if (schemas && schemas.length) {
        html = `<div class="grid-cards" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap:20px;">
            ${schemas.map(s => {
            const params = s.function.parameters ? JSON.stringify(s.function.parameters.properties || s.function.parameters, null, 2) : 'None';
            return `
                <div class="card" style="border-top: 4px solid var(--highlight-color); display:flex; flex-direction:column;">
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
                        <span style="font-size:24px;">⚙️</span>
                        <h3 style="margin:0; font-size:18px; color:var(--text-primary); font-family:var(--font-mono);">${s.function.name}</h3>
                    </div>
                    <p style="font-size:14px; color:var(--text-secondary); line-height:1.5; flex:1;">${s.function.description}</p>
                    <div style="margin-top:15px; font-size:12px; background:var(--bg-color); border:1px solid rgba(255,255,255,0.05); padding:10px; border-radius:6px; color:#4cd137; max-height:150px; overflow-y:auto;">
                        <pre style="margin:0; white-space:pre-wrap; word-break:break-word; font-family:var(--font-mono);"><strong>Parameters:</strong>\n${params}</pre>
                    </div>
                </div>
            `}).join('')}
        </div>`;
    } else {
        html = '<p>No connected skills found within the system.</p>';
    }

    root.innerHTML = `
        <div class="module-section">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h2 style="margin:0;">Connected Skills & Tools</h2>
                <span style="background:var(--highlight-color); color:white; padding:4px 12px; border-radius:12px; font-size:14px; font-weight:bold;">${schemas.length || 0} Registered</span>
            </div>
            <p style="color:var(--text-secondary); margin-top:10px;">These are the live programmatic tools your agent uses to natively interact with systems, networks, and APIs.</p>
            <br>
            ${html}
        </div>
    `;
});
