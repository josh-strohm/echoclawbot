registerTab('conversations', async (root) => {
    const list = await fetchApi('/api/conversations/list');

    let chatSelectHtml = '';
    if (list.length) {
        chatSelectHtml = `
            <select id="chatSessionSelect" style="background:var(--surface-color); color:var(--text-primary); border:1px solid var(--accent-border); padding:10px 16px; border-radius:8px; font-family:var(--font-sans); outline:none; cursor:pointer; box-shadow:0 4px 10px rgba(0,0,0,0.2);">
                ${list.map(c => `<option value="${c.chat_id}">${c.chat_id} (${c.msg_count} msgs)</option>`).join('')}
            </select>
        `;
    }

    root.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 32px;">
            <div>
                <h2 style="font-size: 26px; font-weight: 700; margin-bottom: 6px; letter-spacing: -0.5px;">Agent Sessions</h2>
                <div style="color: var(--text-secondary); font-size: 14px; letter-spacing: 0.5px;">Recent Chat History</div>
            </div>
            <div>
                ${chatSelectHtml}
            </div>
        </div>

        <div id="chatFullViewer" style="display:flex; flex-direction:column; gap:24px; padding-bottom: 60px;">
            <p style="color:var(--text-secondary);">Loading messages...</p>
        </div>
    `;

    window.loadFullChat = async (chatId) => {
        const viewer = document.getElementById('chatFullViewer');
        viewer.innerHTML = '<p style="color:var(--text-secondary);">Loading...</p>';
        const history = await fetchApi(`/api/conversations/history/${chatId}?limit=50`);

        if (history.length === 0) {
            viewer.innerHTML = '<p style="color:var(--text-secondary);">No messages in this session.</p>';
            return;
        }

        // Render from newest to oldest since we want it scrolling down natively
        viewer.innerHTML = history.reverse().map(msg => {
            const isUser = msg.role === 'user';

            // Cyberpunk color palettes matching UI
            const accent = isUser ? '#d53f8c' : 'var(--highlight-color)'; // Pink vs Cyan
            const title = isUser ? 'USER' : 'ASSISTANT';
            const date = new Date(msg.timestamp).toLocaleString();

            // Format basic markdown if needed or just replace newlines.
            const content = msg.content.replace(/\n/g, '<br>');

            return `
            <div style="
                background: rgba(10, 10, 10, 0.6);
                backdrop-filter: blur(10px);
                border: 1px solid var(--accent-border);
                border-left: 3px solid ${accent};
                border-radius: 12px;
                padding: 24px 28px;
                box-shadow: 0 6px 15px rgba(0,0,0,0.3);
                position: relative;
                transition: transform 0.2s ease, box-shadow 0.2s ease;
            " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 25px rgba(0,0,0,0.4), inset 5px 0 15px -10px ${accent}'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 6px 15px rgba(0,0,0,0.3)'">
                
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
                    <strong style="color: ${accent}; font-weight: 700; letter-spacing: 1px; text-shadow: 0 0 10px ${accent}40;">${title}</strong>
                    <span style="color: var(--text-secondary); font-size: 12px; font-weight: 600;">${date}</span>
                </div>
                
                <div style="color: var(--text-primary); line-height: 1.7; font-size: 15px; word-wrap: break-word;">
                    ${content}
                </div>
            </div>
            `;
        }).join('');
    };

    if (list.length > 0) {
        loadFullChat(list[0].chat_id);
    } else {
        document.getElementById('chatFullViewer').innerHTML = '<p style="color:var(--text-secondary);">No sessions active yet.</p>';
    }

    if (document.getElementById('chatSessionSelect')) {
        document.getElementById('chatSessionSelect').addEventListener('change', (e) => {
            loadFullChat(e.target.value);
        });
    }
});
