/**
 * NPTEL Study Portal - Secure GitHub API Admin Portal
 * Enables direct in-browser commits to data/content.json via GitHub API
 */

(function() {
  const adminState = {
    isOpen: false,
    creds: JSON.parse(localStorage.getItem('nptel_admin_creds') || '{}'),
    workingContent: null
  };

  // DOM Elements
  const modal = document.getElementById('admin-modal');
  const openBtn = document.getElementById('btn-open-admin');
  const closeBtn = document.getElementById('btn-close-admin');
  const cancelBtn = document.getElementById('btn-cancel-admin');
  const saveBtn = document.getElementById('btn-save-admin');
  const testBtn = document.getElementById('btn-test-conn');
  const exportBtn = document.getElementById('btn-export-json');
  const statusMsg = document.getElementById('admin-status-message');
  const modulesContainer = document.getElementById('admin-modules-list');

  // Input elements
  const tokenInput = document.getElementById('admin-token');
  const ownerInput = document.getElementById('admin-owner');
  const repoInput = document.getElementById('admin-repo');
  const branchInput = document.getElementById('admin-branch');
  const rememberCheckbox = document.getElementById('admin-remember');

  // Initialize
  function initAdmin() {
    if (openBtn) openBtn.addEventListener('click', openModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    if (saveBtn) saveBtn.addEventListener('click', saveAndPublish);
    if (testBtn) testBtn.addEventListener('click', testConnection);
    if (exportBtn) exportBtn.addEventListener('click', exportContentJson);

    // Pre-populate saved credentials if exist
    if (adminState.creds.token) tokenInput.value = adminState.creds.token;
    ownerInput.value = adminState.creds.owner || 'Anandavnish';
    repoInput.value = adminState.creds.repo || 'nptel-smart-waste-portal';
    branchInput.value = adminState.creds.branch || 'main';
    if (tokenInput.value) rememberCheckbox.checked = true;

    // Close on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && adminState.isOpen) closeModal();
    });
  }

  function openModal() {
    adminState.isOpen = true;
    modal.classList.add('active');
    setStatus('', '');

    // Clone current working content from global state or embedded default data
    if (window.state && window.state.content && window.state.content.modules && window.state.content.modules.length > 0) {
      adminState.workingContent = JSON.parse(JSON.stringify(window.state.content));
    } else if (window.DEFAULT_COURSE_DATA) {
      adminState.workingContent = JSON.parse(JSON.stringify(window.DEFAULT_COURSE_DATA));
    } else {
      adminState.workingContent = { modules: [] };
    }

    renderAdminModules();
  }

  function closeModal() {
    adminState.isOpen = false;
    modal.classList.remove('active');
  }

  function setStatus(text, type) {
    if (!statusMsg) return;
    statusMsg.textContent = text;
    statusMsg.className = `status-message ${type}`;
  }

  // Render the editable modules in the Admin dialog
  function renderAdminModules() {
    if (!modulesContainer || !adminState.workingContent) return;
    modulesContainer.innerHTML = '';

    const modules = adminState.workingContent.modules || [];
    modules.forEach((mod, idx) => {
      const box = document.createElement('div');
      box.className = 'admin-module-box';

      box.innerHTML = `
        <div class="admin-module-header">
          <div>
            <span class="admin-module-title">${mod.weekTitle}: ${mod.title}</span>
            <div style="font-size: 0.72rem; color: var(--text-muted); font-family: var(--font-mono); margin-top: 2px;">
              Sources: ${(mod.sourceWeeks || []).map(sw => sw.pdfName).join(' • ')}
            </div>
          </div>
          <span class="pill-tag">${mod.id}</span>
        </div>

        <div class="admin-grid-2">
          <!-- PDF Settings -->
          <div class="admin-field-group">
            <label class="admin-label">📄 PDF Status</label>
            <select class="admin-select" id="pdf-status-${idx}">
              <option value="in_progress" ${mod.pdf?.status === 'in_progress' ? 'selected' : ''}>⏳ In Progress (Generating)</option>
              <option value="ready" ${mod.pdf?.status === 'ready' ? 'selected' : ''}>✅ Ready (Downloadable)</option>
            </select>
          </div>

          <div class="admin-field-group">
            <label class="admin-label">PDF Google Drive Link</label>
            <input type="url" class="admin-input" id="pdf-url-${idx}" 
              placeholder="https://drive.google.com/file/d/.../view" 
              value="${mod.pdf?.url || ''}">
          </div>
        </div>

        <div class="admin-grid-2">
          <!-- Audio Settings -->
          <div class="admin-field-group">
            <label class="admin-label">🎧 Audio Status</label>
            <select class="admin-select" id="audio-status-${idx}">
              <option value="in_progress" ${mod.audio?.status === 'in_progress' ? 'selected' : ''}>⏳ In Progress (Generating)</option>
              <option value="ready" ${mod.audio?.status === 'ready' ? 'selected' : ''}>✅ Ready (Streaming/Download)</option>
            </select>
          </div>

          <div class="admin-field-group">
            <label class="admin-label">Audio Google Drive Link</label>
            <input type="url" class="admin-input" id="audio-url-${idx}" 
              placeholder="https://drive.google.com/file/d/.../view" 
              value="${mod.audio?.url || ''}">
          </div>
        </div>
      `;

      modulesContainer.appendChild(box);
    });
  }

  // Read current inputs back into working content
  function collectFormData() {
    const modules = adminState.workingContent.modules || [];
    modules.forEach((mod, idx) => {
      const pdfStatusEl = document.getElementById(`pdf-status-${idx}`);
      const pdfUrlEl = document.getElementById(`pdf-url-${idx}`);
      const audioStatusEl = document.getElementById(`audio-status-${idx}`);
      const audioUrlEl = document.getElementById(`audio-url-${idx}`);

      if (pdfStatusEl) mod.pdf.status = pdfStatusEl.value;
      if (pdfUrlEl) mod.pdf.url = pdfUrlEl.value.trim();
      if (audioStatusEl) mod.audio.status = audioStatusEl.value;
      if (audioUrlEl) mod.audio.url = audioUrlEl.value.trim();
    });

    if (adminState.workingContent.course) {
      adminState.workingContent.course.lastUpdated = new Date().toISOString().split('T')[0];
    }
  }

  // Test GitHub Connection
  async function testConnection() {
    const token = tokenInput.value.trim();
    const owner = ownerInput.value.trim();
    const repo = repoInput.value.trim();

    if (!token || !owner || !repo) {
      setStatus('Please enter GitHub Token, Owner, and Repo name', 'error');
      return;
    }

    setStatus('Verifying GitHub repository connection...', '');

    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/data/content.json`, {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (res.status === 200) {
        const data = await res.json();
        setStatus(`✓ Connected successfully! SHA: ${data.sha.slice(0, 7)}`, 'success');
      } else if (res.status === 404) {
        setStatus(`Repo found, but data/content.json does not exist yet. It will be created on save.`, 'success');
      } else {
        const err = await res.json();
        setStatus(`Error: ${err.message || res.statusText}`, 'error');
      }
    } catch (err) {
      setStatus(`Network error connecting to GitHub: ${err.message}`, 'error');
    }
  }

  // Save changes & commit to GitHub
  async function saveAndPublish() {
    collectFormData();

    const token = tokenInput.value.trim();
    const owner = ownerInput.value.trim();
    const repo = repoInput.value.trim();
    const branch = branchInput.value.trim() || 'main';

    // Store in browser cache immediately so current user sees updates right away
    localStorage.setItem('nptel_content_cache', JSON.stringify(adminState.workingContent));
    if (window.state) {
      window.state.content = JSON.parse(JSON.stringify(adminState.workingContent));
      if (typeof window.renderApp === 'function') window.renderApp();
    }

    // Save credentials if user checked remember
    if (rememberCheckbox.checked) {
      localStorage.setItem('nptel_admin_creds', JSON.stringify({ token, owner, repo, branch }));
    } else {
      localStorage.removeItem('nptel_admin_creds');
    }

    // If no GitHub token provided, save locally only
    if (!token || !owner || !repo) {
      setStatus('Saved to local session! Provide GitHub token & repo to commit to cloud.', 'success');
      setTimeout(closeModal, 1200);
      return;
    }

    setStatus('Committing changes to GitHub repository...', '');
    saveBtn.disabled = true;

    try {
      // 1. Fetch current file SHA if exists
      let currentSha = null;
      const getRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/data/content.json?ref=${branch}`, {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (getRes.status === 200) {
        const getData = await getRes.json();
        currentSha = getData.sha;
      }

      // 2. Prepare UTF-8 Base64 content
      const jsonString = JSON.stringify(adminState.workingContent, null, 2);
      const utf8Bytes = new TextEncoder().encode(jsonString);
      let binary = '';
      for (let i = 0; i < utf8Bytes.byteLength; i++) {
        binary += String.fromCharCode(utf8Bytes[i]);
      }
      const base64Content = btoa(binary);

      // 3. Put commit to GitHub
      const putBody = {
        message: `Update course materials via Admin Portal [${new Date().toISOString()}]`,
        content: base64Content,
        branch: branch
      };
      if (currentSha) {
        putBody.sha = currentSha;
      }

      const putRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/data/content.json`, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(putBody)
      });

      if (putRes.ok) {
        setStatus('✓ Successfully published & committed to GitHub!', 'success');
        setTimeout(() => {
          closeModal();
          saveBtn.disabled = false;
        }, 1200);
      } else {
        const err = await putRes.json();
        setStatus(`Commit failed: ${err.message || putRes.statusText}`, 'error');
        saveBtn.disabled = false;
      }
    } catch (err) {
      setStatus(`Error pushing to GitHub: ${err.message}`, 'error');
      saveBtn.disabled = false;
    }
  }

  // Fallback: Export JSON directly
  function exportContentJson() {
    collectFormData();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(adminState.workingContent, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "content.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    setStatus('Exported content.json to your computer!', 'success');
  }

  document.addEventListener('DOMContentLoaded', initAdmin);
})();
