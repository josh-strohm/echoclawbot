registerTab('settings', async (root) => {
    const keys = await fetchApi('/api/settings/keys');

    root.innerHTML = `
        <div class="module-section" style="max-width: 600px;">
            <h3>Provider API Keys</h3>
            <p style="color:var(--text-secondary); margin-top:10px; margin-bottom: 20px;">
                Update your underlying provider API keys. These will be saved directly to your server's .env file.
            </p>
            
            <div style="margin-bottom: 15px;">
                <label style="display:block; margin-bottom:5px; font-weight:600;">OpenAI API Key</label>
                <input type="password" id="key-openai" style="width:100%; padding:10px; border-radius:6px; background:var(--bg-color); color:var(--text-primary); border:1px solid var(--accent-color);" value="${keys.OPEN_AI_KEY}">
            </div>

            <div style="margin-bottom: 15px;">
                <label style="display:block; margin-bottom:5px; font-weight:600;">OpenRouter API Key</label>
                <input type="password" id="key-openrouter" style="width:100%; padding:10px; border-radius:6px; background:var(--bg-color); color:var(--text-primary); border:1px solid var(--accent-color);" value="${keys.OPENROUTER_API_KEY}">
            </div>

            <div style="margin-bottom: 15px;">
                <label style="display:block; margin-bottom:5px; font-weight:600;">Google API Key</label>
                <input type="password" id="key-google" style="width:100%; padding:10px; border-radius:6px; background:var(--bg-color); color:var(--text-primary); border:1px solid var(--accent-color);" value="${keys.GOOGLE_API_KEY}">
            </div>

            <div style="margin-bottom: 20px;">
                <label style="display:block; margin-bottom:5px; font-weight:600;">Anthropic API Key</label>
                <input type="password" id="key-anthropic" style="width:100%; padding:10px; border-radius:6px; background:var(--bg-color); color:var(--text-primary); border:1px solid var(--accent-color);" value="${keys.ANTHROPIC_API_KEY}">
            </div>

            <button onclick="saveKeys()" style="padding:10px 20px; background:var(--accent-color); color:white; border:none; border-radius:6px; cursor:pointer; font-weight:600;">Save API Keys</button>
            <span id="saveResult" style="margin-left:15px; color:#4cd137;"></span>
        </div>
    `;

    window.saveKeys = async () => {
        const payload = {
            openai: document.getElementById('key-openai').value,
            openrouter: document.getElementById('key-openrouter').value,
            google: document.getElementById('key-google').value,
            anthropic: document.getElementById('key-anthropic').value
        };

        const res = await fetchApi('/api/settings/keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const span = document.getElementById('saveResult');
        if (res.success) {
            span.textContent = 'Keys saved successfully!';
            span.style.color = '#4cd137';
        } else {
            span.textContent = 'Failed to save keys.';
            span.style.color = '#e84118';
        }

        setTimeout(() => { span.textContent = ''; }, 3000);
    };
});
