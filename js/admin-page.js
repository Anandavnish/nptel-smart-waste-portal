/**
 * NPTEL Study Portal - Dedicated Admin Workspace Script
 * Clean, secure GitHub REST API integration with token gate
 */

(function() {
  const CONFIG = {
    owner: 'Anandavnish',
    repo: 'nptel-smart-waste-portal',
    branch: 'main',
    dataFile: 'data/content.json',
    storageKey: 'nptel_admin_token'
  };

  const adminState = {
    pat: '',
    workingContent: null,
    isAuthenticated: false
  };

  // Helper: Parse Google Drive URLs
  function parseDriveLink(url) {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim();
    const idMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
                    trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/) ||
                    trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);

    if (idMatch && idMatch[1]) {
      const fileId = idMatch[1];
      return {
        isDrive: true,
        fileId: fileId,
        viewUrl: `https://drive.google.com/file/d/${fileId}/view`,
        downloadUrl: `https://drive.google.com/uc?export=download&id=${fileId}`
      };
    }

    return {
      isDrive: false,
      fileId: null,
      viewUrl: trimmed,
      downloadUrl: trimmed
    };
  }

  // DOM Elements
  const lockScreen = document.getElementById('admin-lock-screen');
  const dashboardScreen = document.getElementById('admin-dashboard-screen');
  const authForm = document.getElementById('auth-form');
  const patInput = document.getElementById('input-pat');
  const rememberCheckbox = document.getElementById('auth-remember');
  const authStatusMsg = document.getElementById('auth-status-msg');
  const btnAuth = document.getElementById('btn-authenticate');
  const modulesContainer = document.getElementById('admin-modules-container');
  const publishStatusMsg = document.getElementById('publish-status-msg');
  const btnPublish = document.getElementById('btn-save-publish');

  // Stats elements
  const statModules = document.getElementById('stat-modules-count');
  const statPdf = document.getElementById('stat-pdf-ready');
  const statAudio = document.getElementById('stat-audio-ready');

  // On page load
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    checkSavedAuth();
  });

  // Check if token exists in session or local storage
  async function checkSavedAuth() {
    const savedToken = sessionStorage.getItem(CONFIG.storageKey) || localStorage.getItem(CONFIG.storageKey);
    if (savedToken && savedToken.trim().length > 10) {
      patInput.value = savedToken.trim();
      setAuthStatus('Verifying saved credentials with GitHub...', 'info');
      const valid = await verifyToken(savedToken.trim());
      if (valid) {
        unlockDashboard(savedToken.trim());
      } else {
        sessionStorage.removeItem(CONFIG.storageKey);
        localStorage.removeItem(CONFIG.storageKey);
        setAuthStatus('Saved token expired or unauthorized. Please re-enter your GitHub PAT.', 'error');
      }
    }
  }

  // Verify GitHub PAT has repository access
  async function verifyToken(token) {
    try {
      const res = await fetch(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}`, {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (res.status === 200) {
        const repoData = await res.json();
        // Check push permission if available
        if (repoData.permissions && repoData.permissions.push === false) {
          setAuthStatus('Token verified, but it lacks push (write) permissions to this repository.', 'error');
          return false;
        }
        return true;
      } else if (res.status === 401) {
        setAuthStatus('Invalid Personal Access Token. Check for typos or token expiration.', 'error');
        return false;
      } else if (res.status === 404) {
        setAuthStatus('Repository not found or token does not have access permissions.', 'error');
        return false;
      } else {
        const err = await res.json().catch(() => ({}));
        setAuthStatus(err.message || 'Verification failed. Please check token permissions.', 'error');
        return false;
      }
    } catch (err) {
      setAuthStatus(`Network error connecting to GitHub: ${err.message}`, 'error');
      return false;
    }
  }

  // Handle Authentication Form Submit
  window.handleAuthSubmit = async function(e) {
    if (e && e.preventDefault) e.preventDefault();

    const token = patInput.value.trim();
    if (!token) {
      setAuthStatus('Please enter a GitHub Personal Access Token', 'error');
      return;
    }

    btnAuth.disabled = true;
    btnAuth.classList.add('loading');
    setAuthStatus('Verifying token with GitHub API...', 'info');

    const isValid = await verifyToken(token);
    btnAuth.disabled = false;
    btnAuth.classList.remove('loading');

    if (isValid) {
      if (rememberCheckbox.checked) {
        localStorage.setItem(CONFIG.storageKey, token);
      } else {
        sessionStorage.setItem(CONFIG.storageKey, token);
        localStorage.removeItem(CONFIG.storageKey);
      }
      unlockDashboard(token);
    }
  };

  // Switch to Dashboard
  async function unlockDashboard(token) {
    adminState.pat = token;
    adminState.isAuthenticated = true;

    lockScreen.style.display = 'none';
    dashboardScreen.style.display = 'block';

    setPublishStatus('Loading latest course data from repository...', 'info');
    await loadRepositoryContent();
    renderEditorModules();
    updateStats();
    setPublishStatus('', '');
  }

  // Load content directly from GitHub repository API (with fallback to default)
  async function loadRepositoryContent() {
    try {
      const res = await fetch(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${CONFIG.dataFile}?ref=${CONFIG.branch}`, {
        headers: {
          'Authorization': `token ${adminState.pat}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (res.ok) {
        const fileData = await res.json();
        adminState.fileSha = fileData.sha;
        // Decode base64 content safely (UTF-8)
        const decodedContent = decodeURIComponent(escape(atob(fileData.content.replace(/\s/g, ''))));
        adminState.workingContent = JSON.parse(decodedContent);
        return;
      }
    } catch (err) {
      console.warn('Could not load directly from GitHub API, falling back to local file:', err);
    }

    // Fallback: load local content.json or default
    try {
      const localRes = await fetch(`data/content.json?t=${Date.now()}`);
      if (localRes.ok) {
        adminState.workingContent = await localRes.json();
        return;
      }
    } catch (e) {}

    if (window.DEFAULT_COURSE_DATA) {
      adminState.workingContent = JSON.parse(JSON.stringify(window.DEFAULT_COURSE_DATA));
    }
  }

  // Render the Module Cards in the Admin Workspace
  function renderEditorModules() {
    if (!modulesContainer || !adminState.workingContent) return;
    modulesContainer.innerHTML = '';

    const modules = adminState.workingContent.modules || [];

    modules.forEach((mod, idx) => {
      const isPdfReady = mod.pdf?.status === 'ready' && !!(mod.pdf?.url && mod.pdf.url.trim().length > 10);
      const isAudioReady = mod.audio?.status === 'ready' && !!(mod.audio?.url && mod.audio.url.trim().length > 10);

      const card = document.createElement('div');
      card.className = 'admin-editor-card';
      card.id = `admin-card-${idx}`;

      card.innerHTML = `
        <div class="admin-card-header">
          <div class="admin-card-header-left">
            <span class="module-week-badge">${mod.weekTitle}</span>
            <h3 class="admin-card-title">${mod.title}</h3>
          </div>
          <span class="pill-tag">${mod.id}</span>
        </div>

        <div class="admin-deliverables-panel">
          <!-- Short Notes PDF Row -->
          <div class="admin-item-row" id="row-pdf-${idx}">
            <div class="admin-item-label-group">
              <div class="admin-item-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                </svg>
                <span>Short Notes (PDF)</span>
              </div>
              <span id="badge-pdf-${idx}" class="status-badge ${isPdfReady ? 'ready' : 'in_progress'}">
                <span class="status-dot"></span>
                ${isPdfReady ? 'Ready' : 'In Progress'}
              </span>
            </div>

            <div class="admin-input-row">
              <input 
                type="url" 
                id="url-pdf-${idx}" 
                class="admin-url-input" 
                placeholder="Paste Google Drive share link (e.g. https://drive.google.com/file/d/.../view)"
                value="${mod.pdf?.url || ''}"
                oninput="handleUrlInput(${idx}, 'pdf')"
              >
              <div class="admin-btn-group">
                <button 
                  type="button" 
                  id="test-pdf-${idx}" 
                  class="btn-deliverable btn-secondary-action admin-action-btn"
                  onclick="testLink(${idx}, 'pdf')"
                  ${isPdfReady ? '' : 'disabled'}
                  title="Test & preview link in Google Drive"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <line x1="10" y1="14" x2="21" y2="3"></line>
                  </svg>
                  Preview
                </button>
                <button 
                  type="button" 
                  class="btn-deliverable btn-secondary-action admin-action-btn clear-btn"
                  onclick="clearLink(${idx}, 'pdf')"
                  title="Clear link"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>

          <!-- Audio Summary MP3 Row -->
          <div class="admin-item-row" id="row-audio-${idx}">
            <div class="admin-item-label-group">
              <div class="admin-item-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 18V5l12-2v13"></path>
                  <circle cx="6" cy="18" r="3"></circle>
                  <circle cx="18" cy="16" r="3"></circle>
                </svg>
                <span>Audio Summary (MP3)</span>
              </div>
              <span id="badge-audio-${idx}" class="status-badge ${isAudioReady ? 'ready' : 'in_progress'}">
                <span class="status-dot"></span>
                ${isAudioReady ? 'Ready' : 'In Progress'}
              </span>
            </div>

            <div class="admin-input-row">
              <input 
                type="url" 
                id="url-audio-${idx}" 
                class="admin-url-input" 
                placeholder="Paste Google Drive audio link (e.g. https://drive.google.com/file/d/.../view)"
                value="${mod.audio?.url || ''}"
                oninput="handleUrlInput(${idx}, 'audio')"
              >
              <div class="admin-btn-group">
                <button 
                  type="button" 
                  id="test-audio-${idx}" 
                  class="btn-deliverable btn-secondary-action admin-action-btn"
                  onclick="testLink(${idx}, 'audio')"
                  ${isAudioReady ? '' : 'disabled'}
                  title="Test audio stream in Google Drive"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                  </svg>
                  Listen
                </button>
                <button 
                  type="button" 
                  class="btn-deliverable btn-secondary-action admin-action-btn clear-btn"
                  onclick="clearLink(${idx}, 'audio')"
                  title="Clear link"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        </div>
      `;

      modulesContainer.appendChild(card);
    });
  }

  // Handle URL change live
  window.handleUrlInput = function(idx, type) {
    const input = document.getElementById(`url-${type}-${idx}`);
    const badge = document.getElementById(`badge-${type}-${idx}`);
    const testBtn = document.getElementById(`test-${type}-${idx}`);
    if (!input || !badge) return;

    const val = input.value.trim();
    const isReady = val.length > 10;

    if (isReady) {
      badge.className = 'status-badge ready';
      badge.innerHTML = '<span class="status-dot"></span>Ready';
      if (testBtn) testBtn.disabled = false;
    } else {
      badge.className = 'status-badge in_progress';
      badge.innerHTML = '<span class="status-dot"></span>In Progress';
      if (testBtn) testBtn.disabled = true;
    }

    updateStats();
  };

  // Test Link button action
  window.testLink = function(idx, type) {
    const input = document.getElementById(`url-${type}-${idx}`);
    if (!input || !input.value.trim()) return;

    const parsed = parseDriveLink(input.value.trim());
    if (parsed && parsed.viewUrl) {
      window.open(parsed.viewUrl, '_blank');
    }
  };

  // Clear link button action
  window.clearLink = function(idx, type) {
    const input = document.getElementById(`url-${type}-${idx}`);
    if (input) {
      input.value = '';
      window.handleUrlInput(idx, type);
    }
  };

  // Read current form values into adminState.workingContent
  function collectFormData() {
    if (!adminState.workingContent || !adminState.workingContent.modules) return;

    adminState.workingContent.modules.forEach((mod, idx) => {
      const pdfInput = document.getElementById(`url-pdf-${idx}`);
      const audioInput = document.getElementById(`url-audio-${idx}`);

      if (pdfInput) {
        const val = pdfInput.value.trim();
        mod.pdf = mod.pdf || {};
        mod.pdf.url = val;
        mod.pdf.status = val.length > 10 ? 'ready' : 'in_progress';
      }

      if (audioInput) {
        const val = audioInput.value.trim();
        mod.audio = mod.audio || {};
        mod.audio.url = val;
        mod.audio.status = val.length > 10 ? 'ready' : 'in_progress';
      }
    });

    if (adminState.workingContent.course) {
      adminState.workingContent.course.lastUpdated = new Date().toISOString().split('T')[0];
    }
  }

  // Update Summary Stats Header
  function updateStats() {
    const modules = adminState.workingContent?.modules || [];
    let pdfReady = 0;
    let audioReady = 0;

    modules.forEach((_, idx) => {
      const pdfInput = document.getElementById(`url-pdf-${idx}`);
      const audioInput = document.getElementById(`url-audio-${idx}`);

      if (pdfInput && pdfInput.value.trim().length > 10) pdfReady++;
      if (audioInput && audioInput.value.trim().length > 10) audioReady++;
    });

    if (statModules) statModules.textContent = `${modules.length} Modules`;
    if (statPdf) statPdf.textContent = `${pdfReady} / ${modules.length} Ready`;
    if (statAudio) statAudio.textContent = `${audioReady} / ${modules.length} Ready`;
  }

  // Save & Commit Directly to GitHub via REST API
  window.saveAndPublishToGitHub = async function() {
    collectFormData();

    if (!adminState.pat) {
      setPublishStatus('Authentication required. Please log in again.', 'error');
      return;
    }

    btnPublish.disabled = true;
    setPublishStatus('Committing changes to GitHub repository...', 'info');

    try {
      // 1. Get latest file SHA if not cached
      let sha = adminState.fileSha;
      if (!sha) {
        const shaRes = await fetch(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${CONFIG.dataFile}?ref=${CONFIG.branch}`, {
          headers: {
            'Authorization': `token ${adminState.pat}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        });
        if (shaRes.ok) {
          const shaData = await shaRes.json();
          sha = shaData.sha;
        }
      }

      // 2. Prepare JSON content encoded in UTF-8 Base64
      const jsonString = JSON.stringify(adminState.workingContent, null, 2);
      const encodedContent = btoa(unescape(encodeURIComponent(jsonString)));

      const commitBody = {
        message: `Update course deliverables via Admin Workspace [${new Date().toISOString()}]`,
        content: encodedContent,
        branch: CONFIG.branch
      };
      if (sha) commitBody.sha = sha;

      // 3. Send PUT request to GitHub API
      const putRes = await fetch(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${CONFIG.dataFile}`, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${adminState.pat}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(commitBody)
      });

      if (putRes.ok) {
        const putData = await putRes.json();
        adminState.fileSha = putData.content?.sha;

        // Cache locally for instant preview
        localStorage.setItem('nptel_content_cache_v2', jsonString);

        setPublishStatus(`✓ Changes published successfully! Commit: ${putData.commit.sha.slice(0, 7)}`, 'success');
      } else {
        const errData = await putRes.json().catch(() => ({}));
        setPublishStatus(`Failed to publish: ${errData.message || putRes.statusText}`, 'error');
      }
    } catch (err) {
      setPublishStatus(`Network error saving to GitHub: ${err.message}`, 'error');
    } finally {
      btnPublish.disabled = false;
    }
  };

  // Export local JSON file backup
  window.exportBackupJson = function() {
    collectFormData();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(adminState.workingContent, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `nptel-content-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // Log Out
  window.handleLogout = function() {
    sessionStorage.removeItem(CONFIG.storageKey);
    localStorage.removeItem(CONFIG.storageKey);
    adminState.pat = '';
    adminState.isAuthenticated = false;
    patInput.value = '';

    dashboardScreen.style.display = 'none';
    lockScreen.style.display = 'flex';
    setAuthStatus('Logged out successfully.', 'info');
  };

  // Status message helpers
  function setAuthStatus(text, type) {
    if (!authStatusMsg) return;
    authStatusMsg.textContent = text;
    authStatusMsg.className = `auth-status-msg ${type}`;
  }

  function setPublishStatus(text, type) {
    if (!publishStatusMsg) return;
    publishStatusMsg.textContent = text;
    publishStatusMsg.className = `publish-status-msg ${type}`;
  }

  // Theme handling
  function initTheme() {
    const saved = localStorage.getItem('nptel_theme') || 'light';
    applyTheme(saved);
  }

  window.toggleAdminTheme = function() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('nptel_theme', next);
  };

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const darkIcon = document.getElementById('admin-theme-icon-dark');
    const lightIcon = document.getElementById('admin-theme-icon-light');

    if (darkIcon && lightIcon) {
      if (theme === 'dark') {
        darkIcon.style.display = 'none';
        lightIcon.style.display = 'block';
      } else {
        darkIcon.style.display = 'block';
        lightIcon.style.display = 'none';
      }
    }
  }

})();
