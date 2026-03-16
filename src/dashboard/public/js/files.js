let currentPath = '';

registerTab('files', async (root) => {
    root.innerHTML = `
        <div style="display:flex; gap:20px; height: 70vh;">
            <div class="module-section" style="flex:1; display:flex; flex-direction:column; padding:0; overflow:hidden;">
                <div style="padding:15px; background:var(--bg-color); border-bottom:1px solid var(--accent-color);">
                    <strong>Browser</strong> <span id="currentPathLabel" class="mono" style="margin-left:10px; font-size:12px; color:var(--text-secondary);">/</span>
                </div>
                <div id="fileList" style="flex:1; overflow-y:auto; padding:15px;">
                    Loading...
                </div>
            </div>
            
            <div class="module-section" style="flex:2; display:flex; flex-direction:column; padding:0; overflow:hidden;">
                <div style="padding:15px; background:var(--bg-color); border-bottom:1px solid var(--accent-color); display:flex; justify-content:space-between; align-items:center;">
                    <strong id="editorTitle">Editor</strong>
                    <button id="saveBtn" style="padding:5px 15px; background:var(--highlight-color); color:white; border:none; border-radius:4px; cursor:pointer; display:none;">Save File</button>
                </div>
                <textarea id="fileEditor" style="flex:1; resize:none; background:transparent; color:var(--text-primary); border:none; padding:15px; font-family:var(--font-mono); outline:none;" disabled></textarea>
            </div>
        </div>
    `;

    const loadDir = async (pathStr) => {
        currentPath = pathStr;
        document.getElementById('currentPathLabel').textContent = pathStr || '/';
        const files = await fetchApi(`/api/files/list?path=${encodeURIComponent(pathStr)}`);

        const fileList = document.getElementById('fileList');
        if (files.error) {
            fileList.innerHTML = `<p style="color:var(--highlight-color)">${files.error}</p>`;
            return;
        }

        let html = '';
        if (pathStr) {
            const parent = pathStr.split('/').slice(0, -1).join('/');
            html += `<div style="padding:8px; cursor:pointer;" onclick="filesLoadDir('${parent}')">📂 ..</div>`;
        }

        files.forEach(f => {
            if (f.isDirectory) {
                html += `<div style="padding:8px; cursor:pointer; color:var(--text-secondary);" onclick="filesLoadDir('${f.path.replace(/\\/g, '/')}')">📂 ${f.name}</div>`;
            } else {
                html += `<div style="padding:8px; cursor:pointer;" onclick="filesLoadFile('${f.path.replace(/\\/g, '/')}')">📄 ${f.name}</div>`;
            }
        });

        fileList.innerHTML = html || '<p>Empty directory.</p>';
    };

    window.filesLoadDir = loadDir;

    let currentOpenFilePath = '';

    window.filesLoadFile = async (pathStr) => {
        const content = await fetchApi(`/api/files/read?path=${encodeURIComponent(pathStr)}`);
        const editor = document.getElementById('fileEditor');
        const title = document.getElementById('editorTitle');
        const btn = document.getElementById('saveBtn');

        if (content && content.error) {
            editor.value = content.error;
            editor.disabled = true;
            btn.style.display = 'none';
        } else {
            editor.value = content;
            editor.disabled = false;
            title.textContent = pathStr.split('/').pop();
            btn.style.display = 'block';
            currentOpenFilePath = pathStr;
        }
    };

    document.getElementById('saveBtn').addEventListener('click', async () => {
        if (!currentOpenFilePath) return;
        const val = document.getElementById('fileEditor').value;
        const res = await fetchApi('/api/files/write', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: currentOpenFilePath, content: val })
        });
        if (res.error) alert(res.error);
        else alert('Saved successfully.');
    });

    loadDir('');
});
