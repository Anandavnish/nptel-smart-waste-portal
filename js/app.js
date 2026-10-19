/**
 * NPTEL Study Portal - Main Application Logic
 * Clean Minimalist Academic Experience
 */

// Global State
const state = {
  content: null,
  activeAudio: null,
  audioElement: new Audio(),
  isPlaying: false,
  playbackSpeed: 1.0,
  studyProgress: JSON.parse(localStorage.getItem('nptel_study_progress') || '{}')
};

// ================= Link Parsing & Utilities =================
function parseDriveLink(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  
  // Try matching Google Drive file ID
  // Formats: /file/d/FILE_ID, /d/FILE_ID, id=FILE_ID
  const idMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
                  trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/) ||
                  trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);

  if (idMatch && idMatch[1]) {
    const fileId = idMatch[1];
    return {
      isDrive: true,
      fileId: fileId,
      viewUrl: `https://drive.google.com/file/d/${fileId}/view`,
      downloadUrl: `https://drive.google.com/uc?export=download&id=${fileId}`,
      streamUrl: `https://docs.google.com/uc?export=open&id=${fileId}`
    };
  }

  // Generic direct URL
  return {
    isDrive: false,
    fileId: null,
    viewUrl: trimmed,
    downloadUrl: trimmed,
    streamUrl: trimmed
  };
}

function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// ================= Data Loading =================
async function loadContent() {
  try {
    // Add timestamp query parameter to bypass cache and get latest edits
    const res = await fetch(`data/content.json?t=${Date.now()}`);
    if (!res.ok) throw new Error('Failed to fetch data/content.json');
    state.content = await res.json();
  } catch (err) {
    console.warn('Could not fetch dynamic content, checking localStorage fallback...', err);
    const local = localStorage.getItem('nptel_content_cache');
    if (local) {
      state.content = JSON.parse(local);
    } else {
      // Default initial fallback
      state.content = {
        course: {
          title: "Integrated Waste Management for a Smart City",
          code: "NPTEL Online Certification",
          description: "Comprehensive short notes & high-yield audio summaries organized into 3-week revision modules.",
          lastUpdated: "2026-10-19"
        },
        modules: []
      };
    }
  }

  renderApp();
}

// ================= Render Application =================
function renderApp() {
  if (!state.content) return;
  const { course, modules } = state.content;

  // Render course metadata
  const titleEl = document.getElementById('course-title');
  const descEl = document.getElementById('course-description');
  const codeEl = document.getElementById('course-code');
  const updatedEl = document.getElementById('course-updated');

  if (titleEl) titleEl.textContent = course.title;
  if (descEl) descEl.textContent = course.description;
  if (codeEl) codeEl.textContent = `${course.code} • ${course.institution || 'IIT Kharagpur'}`;
  if (updatedEl) updatedEl.textContent = `Updated: ${course.lastUpdated || 'Recent'}`;

  // Render Module List
  const listEl = document.getElementById('modules-container');
  if (!listEl) return;
  listEl.innerHTML = '';

  modules.forEach((mod, index) => {
    const isCompleted = !!state.studyProgress[mod.id];
    const card = document.createElement('article');
    card.className = `module-card ${isCompleted ? 'completed' : ''}`;
    card.id = `card-${mod.id}`;

    // PDF Info
    const pdfDrive = parseDriveLink(mod.pdf?.url);
    const isPdfReady = mod.pdf?.status === 'ready' && !!mod.pdf?.url;

    // Audio Info
    const audioDrive = parseDriveLink(mod.audio?.url);
    const isAudioReady = mod.audio?.status === 'ready' && !!mod.audio?.url;

    card.innerHTML = `
      <div class="module-card-header">
        <div>
          <span class="module-week-badge">${mod.weekTitle}</span>
          <h2 class="module-title">${mod.title}</h2>
        </div>
        <label class="completion-toggle" title="Mark module as reviewed">
          <input type="checkbox" ${isCompleted ? 'checked' : ''} onchange="toggleModuleCompletion('${mod.id}')">
          <span>${isCompleted ? 'Reviewed' : 'Mark Reviewed'}</span>
        </label>
      </div>

      <!-- Source Weekly Syllabus Breakdown -->
      <div class="source-weeks-container">
        <div class="source-weeks-header">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
          </svg>
          <span>Covered Weekly Modules (${mod.weekTitle})</span>
        </div>
        <div class="source-weeks-list">
          ${(mod.sourceWeeks || []).map(sw => `
            <div class="source-week-row">
              <span class="source-pdf-pill">${sw.pdfName}</span>
              <div class="source-week-details">
                <span class="source-topic-title">${sw.topic}</span>
                <span class="source-subtopics">${sw.subtopics}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="deliverables-grid">
        <!-- PDF Deliverable Box -->
        <div class="deliverable-box">
          <div class="deliverable-header">
            <div class="deliverable-type">
              <svg class="type-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
              <span>Short Notes (${mod.weekTitle})</span>
            </div>
            <span class="status-badge ${isPdfReady ? 'ready' : 'in_progress'}">
              <span class="status-dot"></span>
              ${isPdfReady ? 'Ready' : 'Generating'}
            </span>
          </div>

          ${isPdfReady ? `
            <div class="deliverable-actions">
              <a href="${pdfDrive ? pdfDrive.downloadUrl : mod.pdf.url}" target="_blank" rel="noopener noreferrer" class="btn-deliverable btn-primary-action">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Download PDF
              </a>
              ${pdfDrive && pdfDrive.isDrive ? `
                <a href="${pdfDrive.viewUrl}" target="_blank" rel="noopener noreferrer" class="btn-deliverable btn-secondary-action" title="Preview in Google Drive">
                  Preview
                </a>
              ` : ''}
            </div>
          ` : `
            <div class="in-progress-display">
              <div class="generating-spinner"></div>
              <div class="in-progress-text-block">
                <div class="in-progress-label">Notes Generation in Progress</div>
                <div class="in-progress-hint">${mod.pdf?.note || 'Compiling high-yield revision points...'}</div>
              </div>
              <div class="shimmer-bar"></div>
            </div>
          `}
        </div>

        <!-- Audio Deliverable Box -->
        <div class="deliverable-box">
          <div class="deliverable-header">
            <div class="deliverable-type">
              <svg class="type-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 18V5l12-2v13"></path>
                <circle cx="6" cy="18" r="3"></circle>
                <circle cx="18" cy="16" r="3"></circle>
              </svg>
              <span>Audio Summary (${mod.weekTitle})</span>
            </div>
            <span class="status-badge ${isAudioReady ? 'ready' : 'in_progress'}">
              <span class="status-dot"></span>
              ${isAudioReady ? 'Ready' : 'Generating'}
            </span>
          </div>

          ${isAudioReady ? `
            <div class="deliverable-actions">
              <button onclick="playTrack('${mod.id}')" class="btn-deliverable btn-primary-action">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                Listen Now
              </button>
              <a href="${audioDrive ? audioDrive.downloadUrl : mod.audio.url}" target="_blank" rel="noopener noreferrer" class="btn-deliverable btn-secondary-action" title="Download Audio File">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Download
              </a>
            </div>
          ` : `
            <div class="in-progress-display">
              <div class="generating-spinner"></div>
              <div class="in-progress-text-block">
                <div class="in-progress-label">Audio Synthesis Scheduled</div>
                <div class="in-progress-hint">${mod.audio?.note || 'Synthesizing voice notes after PDF release...'}</div>
              </div>
              <div class="shimmer-bar"></div>
            </div>
          `}
        </div>
      </div>
    `;

    listEl.appendChild(card);
  });

  updateStudyTracker();
}

// ================= Study Tracker =================
window.toggleModuleCompletion = function(moduleId) {
  state.studyProgress[moduleId] = !state.studyProgress[moduleId];
  localStorage.setItem('nptel_study_progress', JSON.stringify(state.studyProgress));
  
  const card = document.getElementById(`card-${moduleId}`);
  if (card) {
    if (state.studyProgress[moduleId]) {
      card.classList.add('completed');
    } else {
      card.classList.remove('completed');
    }
  }

  updateStudyTracker();
};

function updateStudyTracker() {
  if (!state.content || !state.content.modules) return;
  const total = state.content.modules.length;
  if (total === 0) return;

  const completedCount = state.content.modules.filter(m => state.studyProgress[m.id]).length;
  const percent = Math.round((completedCount / total) * 100);

  const fillEl = document.getElementById('tracker-fill');
  const percentEl = document.getElementById('tracker-percent');
  const countEl = document.getElementById('tracker-count');

  if (fillEl) fillEl.style.width = `${percent}%`;
  if (percentEl) percentEl.textContent = `${percent}%`;
  if (countEl) countEl.textContent = `${completedCount} of ${total} modules completed`;
}

// ================= Audio Player Controls =================
window.playTrack = function(moduleId) {
  const mod = state.content.modules.find(m => m.id === moduleId);
  if (!mod || !mod.audio || !mod.audio.url) return;

  const audioDrive = parseDriveLink(mod.audio.url);
  const streamUrl = audioDrive.streamUrl;

  state.activeAudio = mod;

  const playerBar = document.getElementById('audio-player-bar');
  const trackTitle = document.getElementById('player-track-title');
  const trackWeek = document.getElementById('player-track-week');

  if (trackTitle) trackTitle.textContent = mod.title;
  if (trackWeek) trackWeek.textContent = mod.weekTitle;
  if (playerBar) playerBar.style.display = 'block';

  // Load into HTML5 audio element
  state.audioElement.src = streamUrl;
  state.audioElement.playbackRate = state.playbackSpeed;
  state.audioElement.play().then(() => {
    state.isPlaying = true;
    updatePlayPauseButton();
  }).catch(err => {
    console.warn('Playback error or direct streaming limitation, falling back to download link:', err);
    // If browser blocks direct stream due to Google Drive CORS or virus scan check,
    // open the view/download link directly
    if (confirm('Direct in-browser stream could not be loaded directly. Would you like to open/download the audio file from Google Drive?')) {
      window.open(audioDrive.downloadUrl || mod.audio.url, '_blank');
    }
  });
};

window.togglePlayPause = function() {
  if (!state.activeAudio) return;
  if (state.isPlaying) {
    state.audioElement.pause();
    state.isPlaying = false;
  } else {
    state.audioElement.play();
    state.isPlaying = true;
  }
  updatePlayPauseButton();
};

function updatePlayPauseButton() {
  const playIcon = document.getElementById('player-play-icon');
  const pauseIcon = document.getElementById('player-pause-icon');
  if (playIcon && pauseIcon) {
    playIcon.style.display = state.isPlaying ? 'none' : 'block';
    pauseIcon.style.display = state.isPlaying ? 'block' : 'none';
  }
}

window.setPlaybackSpeed = function(speed) {
  state.playbackSpeed = parseFloat(speed);
  state.audioElement.playbackRate = state.playbackSpeed;

  document.querySelectorAll('.speed-btn').forEach(btn => {
    if (parseFloat(btn.dataset.speed) === state.playbackSpeed) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
};

window.closeAudioPlayer = function() {
  state.audioElement.pause();
  state.isPlaying = false;
  state.activeAudio = null;
  const playerBar = document.getElementById('audio-player-bar');
  if (playerBar) playerBar.style.display = 'none';
};

// Wire Audio Element Events
state.audioElement.addEventListener('timeupdate', () => {
  const current = state.audioElement.currentTime;
  const duration = state.audioElement.duration || 0;

  const currentEl = document.getElementById('player-time-current');
  const totalEl = document.getElementById('player-time-total');
  const scrubEl = document.getElementById('player-scrub');

  if (currentEl) currentEl.textContent = formatTime(current);
  if (totalEl && duration) totalEl.textContent = formatTime(duration);
  if (scrubEl && duration) {
    scrubEl.value = (current / duration) * 100;
  }
});

state.audioElement.addEventListener('ended', () => {
  state.isPlaying = false;
  updatePlayPauseButton();
});

// Scrub Slider Interaction
document.addEventListener('DOMContentLoaded', () => {
  const scrubEl = document.getElementById('player-scrub');
  if (scrubEl) {
    scrubEl.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      const duration = state.audioElement.duration;
      if (duration) {
        state.audioElement.currentTime = (val / 100) * duration;
      }
    });
  }

  // Theme Toggle Setup
  initTheme();
  // Load data
  loadContent();
});

// ================= Theme Switcher =================
function initTheme() {
  const saved = localStorage.getItem('nptel_theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');

  applyTheme(theme);

  const toggleBtn = document.getElementById('theme-toggle-btn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      localStorage.setItem('nptel_theme', next);
    });
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const darkIcon = document.getElementById('theme-icon-dark');
  const lightIcon = document.getElementById('theme-icon-light');

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
