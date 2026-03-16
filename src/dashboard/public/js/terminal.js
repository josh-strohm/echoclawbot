window.terminalHistory = window.terminalHistory || [
    { type: 'system', text: "EchoClaw Terminal Interface Initialized.\\nOS: Native Terminal mapped to Agent Sandbox Workspace. Full root access granted." }
];

registerTab('terminal', async (root) => {
    root.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 24px;">
            <div>
                <h2 style="font-size: 26px; font-weight: 700; margin-bottom: 6px; letter-spacing: -0.5px;">System Console</h2>
                <div style="color: var(--text-secondary); font-size: 14px; letter-spacing: 0.5px;">Root execution natively mapped to system.</div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                <div style="width:10px; height:10px; border-radius:50%; background:#ff3d00; box-shadow:0 0 10px #ff3d00;"></div>
                <span style="font-size:14px; font-weight:bold; color:#ff3d00;">Unrestricted Execution</span>
            </div>
        </div>

        <div style="display:flex; flex-direction:column; background:#000000; border:1px solid var(--accent-border); border-radius:12px; height:65vh; box-shadow:0 8px 30px rgba(0,0,0,0.5); font-family:var(--font-mono); overflow:hidden;">
            <div id="termOutput" style="flex:1; padding:20px; overflow-y:auto; font-size:14px; white-space:pre-wrap; color:var(--text-secondary); line-height:1.6; scrollbar-width: thin; scrollbar-color: var(--accent-border) transparent;"></div>
            
            <div style="display:flex; padding:16px 20px; background:rgba(20,20,20,0.8); border-top:1px solid var(--accent-border); align-items:center; gap:12px;">
                <span style="color:#ff3d00; font-weight:bold; font-size:15px;">PS&gt;</span>
                <input type="text" id="termInput" style="flex:1; background:transparent; color:#fff; border:none; outline:none; font-family:var(--font-mono); font-size:15px;" autocomplete="off" spellcheck="false" autofocus>
            </div>
        </div>
    `;

    const termOutput = document.getElementById('termOutput');
    const termInput = document.getElementById('termInput');

    function renderTerminal() {
        termOutput.innerHTML = window.terminalHistory.map(entry => {
            if (entry.type === 'system') {
                return `<span style="color:#d53f8c; font-weight:bold;">${entry.text}</span>`;
            } else if (entry.type === 'cmd') {
                return `\n<span style="color:#ff3d00; font-weight:bold;">PS&gt;</span> <span style="color:#fff; font-weight:bold;">${entry.text}</span>`;
            } else if (entry.type === 'out') {
                const safeText = String(entry.text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                return `\n<span style="color:var(--highlight-color); opacity:0.9;">${safeText}</span>`;
            } else if (entry.type === 'err') {
                const safeText = String(entry.text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                return `\n<span style="color:#ff3d00;">${safeText}</span>`;
            }
        }).join('');
        termOutput.scrollTop = termOutput.scrollHeight;
    }

    renderTerminal();

    setTimeout(() => termInput.focus(), 50);

    termInput.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') {
            const cmd = termInput.value;
            if (!cmd.trim()) return;

            window.terminalHistory.push({ type: 'cmd', text: cmd });
            renderTerminal();

            termInput.value = '';
            termInput.disabled = true;

            try {
                const res = await fetchApi('/api/terminal/run', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ command: cmd })
                });

                if (res.error && res.output) {
                    window.terminalHistory.push({ type: 'err', text: res.output.trim() });
                } else if (!res.error && res.output) {
                    window.terminalHistory.push({ type: 'out', text: res.output.trim() });
                } else {
                    window.terminalHistory.push({ type: 'system', text: 'Command completed with no output.' });
                }

            } catch (err) {
                window.terminalHistory.push({ type: 'err', text: 'Failed to execute: ' + err.message });
            } finally {
                renderTerminal();
                termInput.disabled = false;
                termInput.focus();
            }
        }
    });
});
