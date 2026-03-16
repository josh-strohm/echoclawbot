window.liveChatHistory = window.liveChatHistory || [
    { role: 'assistant', content: "Mission Control link established. I'm ready for commands." }
];

registerTab('chat', async (root) => {
    root.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 32px;">
            <div>
                <h2 style="font-size: 26px; font-weight: 700; margin-bottom: 6px; letter-spacing: -0.5px;">Live Control Room</h2>
                <div style="color: var(--text-secondary); font-size: 14px; letter-spacing: 0.5px;">Direct interface with EchoClaw</div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                <div style="width:10px; height:10px; border-radius:50%; background:#4cd137; box-shadow:0 0 10px #4cd137;"></div>
                <span style="font-size:14px; font-weight:bold; color:var(--text-primary);">Agent Online</span>
            </div>
        </div>
        
        <div style="display:flex; flex-direction:column; background:var(--surface-color); backdrop-filter:blur(10px); border:1px solid var(--accent-border); border-radius:12px; height:65vh; box-shadow:0 8px 30px rgba(0,0,0,0.5);">
            <div id="chatMessages" style="flex:1; padding:24px; overflow-y:auto; display:flex; flex-direction:column; gap:16px;">
            </div>
            <div style="padding:16px; border-top:1px solid var(--accent-border); display:flex; gap:12px; background:rgba(0,0,0,0.4); border-bottom-left-radius:12px; border-bottom-right-radius:12px;">
                <input type="text" id="chatInput" placeholder="Send a command directly to the active agent..." style="flex:1; background:rgba(255,255,255,0.05); color:white; border:1px solid var(--accent-border); padding:14px 18px; border-radius:8px; outline:none; font-family:var(--font-sans); transition: all 0.3s ease;">
                <input type="file" id="imageInput" accept="image/*" style="display:none;">
                <button id="imageBtn" style="padding:14px 18px; background:rgba(255,255,255,0.05); border:1px solid var(--accent-border); border-radius:8px; color:white; cursor:pointer; font-size:18px;">🖼️</button>
                <button id="sendBtn" style="padding:14px 28px; background:var(--highlight-color); border:none; border-radius:8px; color:#000; font-weight:700; cursor:pointer; font-family:var(--font-sans); box-shadow:0 0 15px rgba(58,234,253,0.3); transition:all 0.3s ease;">SEND</button>
            </div>
            <div id="imagePreview" style="display:none; padding:8px 16px; border-top:1px solid var(--accent-border); background:rgba(0,0,0,0.2); align-items:center; gap:12px;">
                <div style="position:relative;">
                    <img id="previewImg" style="height:50px; border-radius:4px; border:1px solid var(--accent-border);">
                    <button id="clearImage" style="position:absolute; top:-5px; right:-5px; width:20px; height:20px; border-radius:50%; background:var(--danger-color); color:white; border:none; padding:0; line-height:1; font-size:12px;">×</button>
                </div>
                <span style="font-size:12px; color:var(--text-secondary);">Image attached</span>
            </div>
        </div>
    `;

    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const imageInput = document.getElementById('imageInput');
    const imageBtn = document.getElementById('imageBtn');
    const sendBtn = document.getElementById('sendBtn');
    const imagePreview = document.getElementById('imagePreview');
    const previewImg = document.getElementById('previewImg');
    const clearImage = document.getElementById('clearImage');

    let selectedImage = null;

    // Add focus effects
    chatInput.addEventListener('focus', () => {
        chatInput.style.borderColor = 'var(--highlight-color)';
        chatInput.style.boxShadow = '0 0 10px rgba(58,234,253,0.2)';
    });
    chatInput.addEventListener('blur', () => {
        chatInput.style.borderColor = 'var(--accent-border)';
        chatInput.style.boxShadow = 'none';
    });

    imageBtn.addEventListener('click', () => imageInput.click());

    imageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (re) => {
                selectedImage = re.target.result;
                previewImg.src = selectedImage;
                imagePreview.style.display = 'flex';
                imageBtn.style.borderColor = 'var(--highlight-color)';
                imageBtn.style.color = 'var(--highlight-color)';
            };
            reader.readAsDataURL(file);
        }
    });

    clearImage.addEventListener('click', () => {
        selectedImage = null;
        imagePreview.style.display = 'none';
        imageInput.value = '';
        imageBtn.style.borderColor = 'var(--accent-border)';
        imageBtn.style.color = 'white';
    });

    function renderMessage(role, content) {
        const isUser = role === 'user';
        const isSystem = role === 'system';

        let accent = 'var(--highlight-color)';
        let title = 'ECHOCLAW';

        if (isUser) {
            accent = '#d53f8c'; // Pink for user
            title = 'ADMIN';
        } else if (isSystem) {
            accent = '#ff3d00'; // Red for errors
            title = 'SYSTEM';
        }

        // Extremely basic markdown formatting
        let formatted = String(content)
            .replace(/\\n/g, '<br>')
            .replace(/\n/g, '<br>')
            .replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>');

        return `
            <div style="
                background: rgba(10, 10, 10, 0.6);
                border: 1px solid var(--accent-border);
                border-left: 3px solid ${accent};
                border-radius: 12px;
                padding: 16px 20px;
                max-width: 85%;
                align-self: ${isUser ? 'flex-end' : 'flex-start'};
                box-shadow: 0 4px 10px rgba(0,0,0,0.2);
                animation: fadeIn 0.3s ease;
            ">
                <div style="color: ${accent}; font-weight: 700; font-size: 12px; margin-bottom: 8px; letter-spacing: 1px;">${title}</div>
                <div style="color: white; font-size: 14px; line-height: 1.6; word-wrap: break-word;">${formatted}</div>
            </div>
        `;
    }

    function appendMessage(role, content, image = null) {
        window.liveChatHistory.push({ role, content, image });
        let html = renderMessage(role, content);
        if (image) {
            // Prepend image to the same message bubble (hacky but visually ok)
            html = html.replace('line-height: 1.6; word-wrap: break-word;">', 'line-height: 1.6; word-wrap: break-word;"><img src="' + image + '" style="max-width:100%; border-radius:8px; margin-bottom:12px; display:block; border:1px solid rgba(255,255,255,0.1);">');
        }
        chatMessages.innerHTML += html;
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function renderFullHistory() {
        chatMessages.innerHTML = window.liveChatHistory.map(m => {
            let html = renderMessage(m.role, m.content);
            if (m.image) {
                html = html.replace('line-height: 1.6; word-wrap: break-word;">', 'line-height: 1.6; word-wrap: break-word;"><img src="' + m.image + '" style="max-width:100%; border-radius:8px; margin-bottom:12px; display:block; border:1px solid rgba(255,255,255,0.1);">');
            }
            return html;
        }).join('');
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Initial render
    renderFullHistory();

    async function sendMessage() {
        const msg = chatInput.value.trim();
        if (!msg) return;

        chatInput.value = '';
        const currentImage = selectedImage;
        selectedImage = null;
        imagePreview.style.display = 'none';
        imageInput.value = '';
        imageBtn.style.borderColor = 'var(--accent-border)';
        imageBtn.style.color = 'white';

        appendMessage('user', msg, currentImage);

        // Disable inputs while agent processes
        chatInput.disabled = true;
        sendBtn.disabled = true;
        imageBtn.disabled = true;
        sendBtn.textContent = '...';
        sendBtn.style.background = 'var(--text-secondary)';
        sendBtn.style.boxShadow = 'none';

        try {
            const res = await fetchApi('/api/chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: msg,
                    image: currentImage // Send base64 to server
                })
            });

            if (res.error) {
                appendMessage('system', 'Error: ' + res.error);
            } else {
                appendMessage('assistant', res.response);
            }
        } catch (e) {
            appendMessage('system', 'Connection to agent failed.');
        } finally {
            chatInput.disabled = false;
            sendBtn.disabled = false;
            imageBtn.disabled = false;
            sendBtn.textContent = 'SEND';
            sendBtn.style.background = 'var(--highlight-color)';
            sendBtn.style.boxShadow = '0 0 15px rgba(58,234,253,0.3)';
            chatInput.focus();
        }
    }

    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
});
