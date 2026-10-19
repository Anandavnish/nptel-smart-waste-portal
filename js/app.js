/**
 * NPTEL Study Portal - Main Application Logic
 * Clean Minimalist Academic Experience
 */

// Global State - Initialized with embedded default course data for instant rendering
const state = {
  content: window.DEFAULT_COURSE_DATA ? JSON.parse(JSON.stringify(window.DEFAULT_COURSE_DATA)) : null,
  activeAudio: null,
  audioElement: new Audio(),
  isPlaying: false,
  playbackSpeed: 1.0,
  studyProgress: JSON.parse(localStorage.getItem('nptel_study_progress') || '{}')
};

// ================= Link Parsing & Utilities =================
function getDevicePlatform() {
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '';
  if (/android/i.test(ua)) return 'android';
  if (/iPad|iPhone|iPod/.test(ua) && !(typeof window !== 'undefined' && window.MSStream)) return 'ios';
  return 'desktop';
}

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
    const webViewUrl = `https://drive.google.com/file/d/${fileId}/view?usp=drivesdk`;
    const encodedWebUrl = encodeURIComponent(webViewUrl);

    // Android: Chrome Intent URL to directly open in Google Drive app (package: com.google.android.apps.docs)
    const androidIntentUrl = `intent://drive.google.com/file/d/${fileId}/view?usp=drivesdk#Intent;package=com.google.android.apps.docs;scheme=https;S.browser_fallback_url=${encodedWebUrl};end;`;

    // iOS: Google Drive app custom scheme
    const iosAppUrl = `googledrive://open?id=${fileId}`;

    const platform = getDevicePlatform();
    let appUrl = webViewUrl;
    if (platform === 'android') {
      appUrl = androidIntentUrl;
    } else if (platform === 'ios') {
      appUrl = iosAppUrl;
    }

    return {
      isDrive: true,
      fileId: fileId,
      viewUrl: webViewUrl,
      appUrl: appUrl,
      androidIntentUrl: androidIntentUrl,
      iosAppUrl: iosAppUrl,
      downloadUrl: `https://drive.google.com/uc?export=download&id=${fileId}`,
      streamUrl: `https://drive.usercontent.google.com/download?id=${fileId}&export=download`,
      previewUrl: `https://drive.google.com/file/d/${fileId}/preview`,
      directDownloadUrl: `https://drive.usercontent.google.com/download?id=${fileId}&export=download`
    };
  }

  // Generic direct URL
  return {
    isDrive: false,
    fileId: null,
    viewUrl: trimmed,
    appUrl: trimmed,
    androidIntentUrl: trimmed,
    iosAppUrl: trimmed,
    downloadUrl: trimmed,
    streamUrl: trimmed,
    previewUrl: trimmed,
    directDownloadUrl: trimmed
  };
}

window.handleDriveLinkClick = function(url, event) {
  if (!url) return;
  const parsed = parseDriveLink(url);
  if (!parsed || !parsed.isDrive) return;

  const platform = getDevicePlatform();

  if (platform === 'android') {
    // If the element has the intent href, native tap will trigger the Google Drive app directly.
    // If called via custom trigger or if href wasn't intent:
    if (event) {
      const href = event.currentTarget?.getAttribute('href') || '';
      if (!href.startsWith('intent://')) {
        event.preventDefault();
        window.location.href = parsed.androidIntentUrl;
      }
    } else {
      window.location.href = parsed.androidIntentUrl;
    }
    return;
  }

  if (platform === 'ios') {
    if (event) event.preventDefault();
    let appOpened = false;

    const onVisibilityChange = () => {
      if (document.hidden || document.webkitHidden) {
        appOpened = true;
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange, { once: true });
    document.addEventListener('webkitvisibilitychange', onVisibilityChange, { once: true });

    window.location.href = parsed.iosAppUrl;

    setTimeout(() => {
      if (!appOpened && !document.hidden) {
        window.open(parsed.viewUrl, '_blank', 'noopener,noreferrer');
      }
    }, 1500);
    return;
  }

  // Desktop: open the web viewer in a new tab
  if (event) {
    const href = event.currentTarget?.getAttribute('href') || '';
    if (href.startsWith('intent://') || href.startsWith('googledrive://')) {
      event.preventDefault();
      window.open(parsed.viewUrl, '_blank', 'noopener,noreferrer');
    }
  } else {
    window.open(parsed.viewUrl, '_blank', 'noopener,noreferrer');
  }
};

function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// ================= Data Loading =================
async function loadContent() {
  // 1. Initial render from embedded data immediately
  if (!state.content || !state.content.modules || state.content.modules.length === 0) {
    if (window.DEFAULT_COURSE_DATA) {
      state.content = JSON.parse(JSON.stringify(window.DEFAULT_COURSE_DATA));
    }
  }
  renderApp();

  // 2. Fetch live data/content.json (with cache-busting timestamp)
  try {
    const res = await fetch(`data/content.json?t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.modules) && data.modules.length > 0) {
        state.content = data;
        localStorage.setItem('nptel_content_cache_v2', JSON.stringify(data));
        renderApp();
        return;
      }
    }
  } catch (err) {
    console.warn('Network fetch for latest content unavailable (offline or file://), checking cache...', err);
  }

  // 3. Fallback to localStorage cache if valid
  const local = localStorage.getItem('nptel_content_cache_v2');
  if (local) {
    try {
      const parsed = JSON.parse(local);
      if (parsed && Array.isArray(parsed.modules) && parsed.modules.length > 0) {
        state.content = parsed;
        renderApp();
        return;
      } else {
        localStorage.removeItem('nptel_content_cache_v2');
      }
    } catch (e) {
      localStorage.removeItem('nptel_content_cache_v2');
    }
  }

  // 4. Guarantee state.content always has all 4 modules
  if (!state.content || !state.content.modules || state.content.modules.length === 0) {
    if (window.DEFAULT_COURSE_DATA) {
      state.content = JSON.parse(JSON.stringify(window.DEFAULT_COURSE_DATA));
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
  if (descEl) descEl.textContent = course.description || 'High-yield short notes and audio summaries for fast exam revision.';
  if (codeEl) codeEl.textContent = 'NPTEL • IIT Kharagpur';
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

    // PDF Info - Ready if explicitly marked ready OR if a valid URL has been provided
    const pdfDrive = parseDriveLink(mod.pdf?.url);
    const hasPdfUrl = !!(mod.pdf?.url && mod.pdf.url.trim().length > 10);
    const isPdfReady = (mod.pdf?.status === 'ready' || hasPdfUrl) && hasPdfUrl;

    // Audio Info - Ready if explicitly marked ready OR if a valid URL has been provided
    const audioDrive = parseDriveLink(mod.audio?.url);
    const hasAudioUrl = !!(mod.audio?.url && mod.audio.url.trim().length > 10);
    const isAudioReady = (mod.audio?.status === 'ready' || hasAudioUrl) && hasAudioUrl;

    // Topic Pills: Clean, robust, safe from undefined
    const topicPillsHtml = (mod.sourceWeeks || []).map(sw => {
      const weekLabel = (sw.pdfName || '').replace(/\.pdf$/i, '').replace('Week ', 'W').trim();
      const topicName = sw.topic || '';
      return `
        <span class="topic-pill">
          <span class="pill-week">${weekLabel}</span>
          <span class="pill-topic">${topicName}</span>
        </span>
      `;
    }).join('');

    card.innerHTML = `
      <div class="module-card-header">
        <div class="module-header-left">
          <span class="module-week-badge">${mod.weekTitle}</span>
          <h2 class="module-title">${mod.title}</h2>
        </div>
        <label class="completion-toggle" title="Mark module as reviewed">
          <input type="checkbox" ${isCompleted ? 'checked' : ''} onchange="toggleModuleCompletion('${mod.id}')">
          <span>${isCompleted ? 'Reviewed' : 'Mark Reviewed'}</span>
        </label>
      </div>

      <!-- Covered Topics Tag Strip -->
      ${topicPillsHtml ? `<div class="module-topics-row">${topicPillsHtml}</div>` : ''}

      <div class="deliverables-grid">
        <!-- PDF Deliverable Box -->
        <div class="deliverable-box ${isPdfReady ? 'ready' : 'pending'}">
          <div class="deliverable-header">
            <div class="deliverable-type">
              <svg class="type-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
              <span>Short Notes</span>
              <span class="deliverable-format-badge">PDF</span>
            </div>
            ${!isPdfReady ? `
              <span class="status-badge in_progress">
                <span class="status-dot"></span>
                In Progress
              </span>
            ` : ''}
          </div>

          <div class="deliverable-desc">
            ${isPdfReady ? 'Consolidated exam revision notes' : 'Notes in preparation'}
          </div>

          ${isPdfReady ? `
            <div class="deliverable-actions">
              <a 
                href="${pdfDrive?.isDrive ? pdfDrive.appUrl : mod.pdf.url}" 
                onclick="handleDriveLinkClick('${mod.pdf.url}', event)" 
                target="${getDevicePlatform() === 'android' ? '_self' : '_blank'}" 
                rel="noopener noreferrer" 
                class="btn-deliverable btn-primary-action"
                title="Open in Google Drive App / Download"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Download PDF
              </a>
              ${pdfDrive && pdfDrive.isDrive ? `
                <a 
                  href="${pdfDrive.appUrl}" 
                  onclick="handleDriveLinkClick('${mod.pdf.url}', event)" 
                  target="${getDevicePlatform() === 'android' ? '_self' : '_blank'}" 
                  rel="noopener noreferrer" 
                  class="btn-deliverable btn-secondary-action" 
                  title="Open in Google Drive App"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <line x1="10" y1="14" x2="21" y2="3"></line>
                  </svg>
                  Preview
                </a>
              ` : ''}
            </div>
          ` : `
            <div class="in-progress-display">
              <div class="generating-spinner" aria-hidden="true"></div>
              <div class="in-progress-text-block">
                <div class="in-progress-label">Notes in preparation<span class="animated-dots"><span>.</span><span>.</span><span>.</span></span></div>
                <div class="in-progress-hint">${mod.pdf?.note || 'Drafting revision notes'}</div>
              </div>
              <div class="shimmer-bar"></div>
            </div>
          `}
        </div>

        <!-- Audio Deliverable Box -->
        <div class="deliverable-box ${isAudioReady ? 'ready' : 'pending'}">
          <div class="deliverable-header">
            <div class="deliverable-type">
              <svg class="type-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 18V5l12-2v13"></path>
                <circle cx="6" cy="18" r="3"></circle>
                <circle cx="18" cy="16" r="3"></circle>
              </svg>
              <span>Audio Summary</span>
              <span class="deliverable-format-badge">MP3</span>
            </div>
            ${!isAudioReady ? `
              <span class="status-badge in_progress">
                <span class="status-dot"></span>
                In Progress
              </span>
            ` : ''}
          </div>

          <div class="deliverable-desc">
            ${isAudioReady ? 'High-yield audio revision summary' : 'Voice synthesis in preparation'}
          </div>

          ${isAudioReady ? `
            <div class="deliverable-actions">
              <button onclick="playTrack('${mod.id}')" class="btn-deliverable btn-primary-action">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                Listen Now
              </button>
              <a 
                href="${audioDrive?.isDrive ? audioDrive.appUrl : mod.audio.url}" 
                onclick="handleDriveLinkClick('${mod.audio.url}', event)" 
                target="${getDevicePlatform() === 'android' ? '_self' : '_blank'}" 
                rel="noopener noreferrer" 
                class="btn-deliverable btn-secondary-action" 
                title="Open in Google Drive App / Download"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Download
              </a>
            </div>
          ` : `
            <div class="in-progress-display audio-in-progress">
              <div class="audio-wave-visualizer" aria-hidden="true">
                <span class="wave-bar"></span>
                <span class="wave-bar"></span>
                <span class="wave-bar"></span>
                <span class="wave-bar"></span>
              </div>
              <div class="in-progress-text-block">
                <div class="in-progress-label">Audio in preparation<span class="animated-dots"><span>.</span><span>.</span><span>.</span></span></div>
                <div class="in-progress-hint">${mod.audio?.note || 'Synthesizing voice summary'}</div>
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
  updateExamCountdown();
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
  if (countEl) countEl.textContent = `${completedCount} of ${total} completed`;
}

// ================= Exam Countdown (Smart Formatting from ProgressShelf) =================

/**
 * Format deadline with humanized adaptive tiers (imported from ProgressShelf)
 * Tier 1 (< 60s): seconds only
 * Tier 2 (< 60m): minutes + seconds
 * Tier 3 (< 48h): hours + minutes
 * Tier 4 (< 14d): days + hours
 * Tier 5 (< 60d): weeks + days
 * Tier 6 (>=60d): months + days
 * 
 * @param {number} deadlineMs Target timestamp in milliseconds
 * @returns {{ label: string, durationText: string, isOverdue: boolean, totalHours: number }}
 */
function formatTimeLeft(deadlineMs) {
  const now = Date.now();
  const rawDiff = deadlineMs - now;
  const isOverdue = rawDiff <= 0;
  const diff = Math.abs(rawDiff);

  const totalSecs = Math.floor(diff / 1000);
  const totalMins = Math.floor(totalSecs / 60);
  const totalHours = Math.floor(totalMins / 60);
  const totalDays = Math.floor(totalHours / 24);

  if (totalSecs === 0 && !isOverdue) {
    return { label: "Due now", durationText: "0 secs", isOverdue: false, totalHours: 0 };
  }
  if (totalSecs === 0 && isOverdue) {
    return { label: "Due now", durationText: "0 secs", isOverdue: true, totalHours: 0 };
  }

  // Helper to format values with optional singular/plural formatting
  const fmt = (val, singular, plural) => {
    return val === 1 ? `1 ${singular}` : `${val} ${plural}`;
  };

  let tierOutput = "";

  if (totalSecs < 60) {
    // Tier 1: seconds only
    tierOutput = fmt(totalSecs, "sec", "secs");
  } else if (totalMins < 60) {
    // Tier 2: minutes + seconds
    const mins = totalMins;
    const secs = totalSecs % 60;
    if (secs === 0) {
      tierOutput = fmt(mins, "min", "mins");
    } else {
      tierOutput = `${fmt(mins, "min", "mins")} ${fmt(secs, "sec", "secs")}`;
    }
  } else if (totalHours < 48) {
    // Tier 3: hours + minutes
    const hrs = totalHours;
    const mins = totalMins % 60;
    if (mins === 0) {
      tierOutput = fmt(hrs, "hr", "hrs");
    } else {
      tierOutput = `${fmt(hrs, "hr", "hrs")} ${fmt(mins, "min", "mins")}`;
    }
  } else if (totalDays < 14) {
    // Tier 4: days + hours
    const days = totalDays;
    const hrs = totalHours % 24;
    if (hrs === 0) {
      tierOutput = fmt(days, "day", "days");
    } else {
      tierOutput = `${fmt(days, "day", "days")} ${fmt(hrs, "hr", "hrs")}`;
    }
  } else if (totalDays < 60) {
    // Tier 5: weeks + days
    const weeks = Math.floor(totalDays / 7);
    const days = totalDays % 7;
    if (days === 0) {
      tierOutput = fmt(weeks, "week", "weeks");
    } else {
      tierOutput = `${fmt(weeks, "week", "weeks")} ${fmt(days, "day", "days")}`;
    }
  } else {
    // Tier 6: months + days
    const months = Math.floor(totalDays / 30);
    const days = totalDays % 30;
    if (days === 0) {
      tierOutput = fmt(months, "month", "months");
    } else {
      tierOutput = `${fmt(months, "month", "months")} ${fmt(days, "day", "days")}`;
    }
  }

  const label = isOverdue ? `Overdue by ${tierOutput}` : `${tierOutput} left`;
  return { label, durationText: tierOutput, isOverdue, totalHours };
}

function getExamDeadlineMs() {
  const configured = state.content?.course?.examDate;
  if (configured) {
    const parsed = Date.parse(configured);
    if (!isNaN(parsed)) return parsed;
  }
  // Default: 24 Oct 2026, 09:00:00 local time
  return new Date(2026, 9, 24, 9, 0, 0).getTime();
}

let countdownInterval = null;

function updateExamCountdown() {
  const textEl = document.getElementById('exam-time-left');
  const badgeEl = document.getElementById('exam-countdown-badge');
  const labelEl = document.getElementById('exam-date-label');
  if (!textEl || !badgeEl) return;

  const deadlineMs = getExamDeadlineMs();
  const result = formatTimeLeft(deadlineMs);

  textEl.textContent = result.label;

  // Visual status classes matching ProgressShelf behavior
  badgeEl.classList.remove('urgent', 'overdue');
  if (result.isOverdue) {
    badgeEl.classList.add('overdue');
    badgeEl.setAttribute('title', `Exam deadline has passed (${result.label})`);
  } else if (result.totalHours < 48) {
    badgeEl.classList.add('urgent');
    badgeEl.setAttribute('title', `Exam is approaching soon: ${result.label}`);
  } else {
    badgeEl.setAttribute('title', `Target Exam Date: 24 Oct 2026 • ${result.label}`);
  }

  if (labelEl && state.content?.course?.examDateLabel) {
    labelEl.textContent = state.content.course.examDateLabel;
  }
}

function initExamCountdown() {
  updateExamCountdown();
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(updateExamCountdown, 1000);
}

// ================= Audio Player Controls =================
const audioBlobCache = {};
let activeAudioAbortCtrl = null;

function setAudioLoading(isLoading) {
  const playIcon = document.getElementById('player-play-icon');
  const pauseIcon = document.getElementById('player-pause-icon');
  const spinner = document.getElementById('player-loading-spinner');
  const playBtn = document.getElementById('player-play-btn');
  const timeCurrent = document.getElementById('player-time-current');

  if (isLoading) {
    if (playIcon) playIcon.style.display = 'none';
    if (pauseIcon) pauseIcon.style.display = 'none';
    if (spinner) spinner.style.display = 'block';
    if (playBtn) playBtn.disabled = true;
    if (timeCurrent) timeCurrent.textContent = 'Buffering...';
  } else {
    if (spinner) spinner.style.display = 'none';
    if (playBtn) playBtn.disabled = false;
    updatePlayPauseButton();
  }
}

window.playTrack = async function(moduleId) {
  const mod = state.content.modules.find(m => m.id === moduleId);
  if (!mod || !mod.audio || !mod.audio.url) return;

  const audioDrive = parseDriveLink(mod.audio.url);
  state.activeAudio = mod;

  const playerBar = document.getElementById('audio-player-bar');
  const trackTitle = document.getElementById('player-track-title');
  const trackWeek = document.getElementById('player-track-week');
  const html5Controls = document.getElementById('player-html5-controls');
  const embedContainer = document.getElementById('player-embed-container');
  const embedFrame = document.getElementById('player-embed-frame');
  const speedGroup = document.getElementById('player-speed-group');
  const playerDriveLink = document.getElementById('player-drive-link');

  if (trackTitle) trackTitle.textContent = mod.title;
  if (trackWeek) trackWeek.textContent = mod.weekTitle;

  if (playerDriveLink) {
    if (audioDrive && audioDrive.isDrive) {
      playerDriveLink.href = audioDrive.appUrl;
      playerDriveLink.target = getDevicePlatform() === 'android' ? '_self' : '_blank';
      playerDriveLink.onclick = (e) => handleDriveLinkClick(mod.audio.url, e);
      playerDriveLink.style.display = 'inline-flex';
    } else {
      playerDriveLink.href = mod.audio.url;
      playerDriveLink.target = '_blank';
      playerDriveLink.onclick = null;
      playerDriveLink.style.display = 'inline-flex';
    }
  }

  // Show player bar immediately
  if (playerBar) playerBar.style.display = 'block';

  function switchToEmbedMode() {
    state.audioElement.pause();
    state.isPlaying = false;
    updatePlayPauseButton();

    if (html5Controls) html5Controls.style.display = 'none';
    if (speedGroup) speedGroup.style.display = 'none';
    if (embedContainer && embedFrame && audioDrive && audioDrive.isDrive) {
      embedContainer.style.display = 'block';
      embedFrame.src = audioDrive.previewUrl;
    }
  }

  function switchToHtml5Mode() {
    if (embedContainer) embedContainer.style.display = 'none';
    if (embedFrame) embedFrame.src = '';
    if (html5Controls) html5Controls.style.display = 'flex';
    if (speedGroup) speedGroup.style.display = 'flex';
  }

  // Cancel any prior in-flight fetch
  if (activeAudioAbortCtrl) {
    activeAudioAbortCtrl.abort();
    activeAudioAbortCtrl = null;
  }

  // 1. Play from cached Blob URL if available
  if (audioBlobCache[moduleId]) {
    switchToHtml5Mode();
    state.audioElement.src = audioBlobCache[moduleId];
    state.audioElement.playbackRate = state.playbackSpeed;
    try {
      await state.audioElement.play();
      state.isPlaying = true;
      updatePlayPauseButton();
      setAudioLoading(false);
      return;
    } catch (err) {
      console.warn('Playback of cached audio blob failed, re-fetching...', err);
      delete audioBlobCache[moduleId];
    }
  }

  // 2. Google Drive stream loading via Blob URL
  if (audioDrive && audioDrive.isDrive) {
    switchToHtml5Mode();
    setAudioLoading(true);

    activeAudioAbortCtrl = new AbortController();

    try {
      const fetchUrl = audioDrive.directDownloadUrl || audioDrive.downloadUrl;
      const res = await fetch(fetchUrl, { signal: activeAudioAbortCtrl.signal });

      if (!res.ok) throw new Error(`HTTP error ${res.status}`);

      const buffer = await res.arrayBuffer();

      // Check if response is HTML (Google Drive interstitial / warning page)
      const headerSnippet = new Uint8Array(buffer.slice(0, 10));
      const textSnippet = String.fromCharCode(...headerSnippet).toLowerCase();
      if (textSnippet.includes('<html') || textSnippet.includes('<!doc')) {
        throw new Error('Google Drive returned HTML instead of audio stream');
      }

      const blob = new Blob([buffer], { type: 'audio/mpeg' });
      const blobUrl = URL.createObjectURL(blob);
      audioBlobCache[moduleId] = blobUrl;

      state.audioElement.src = blobUrl;
      state.audioElement.playbackRate = state.playbackSpeed;
      await state.audioElement.play();
      state.isPlaying = true;
      updatePlayPauseButton();
      setAudioLoading(false);
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.warn('Direct stream fetch unavailable or blocked, switching to in-browser Drive player:', err);
      setAudioLoading(false);
      switchToEmbedMode();
    }
    return;
  }

  // 3. Direct Audio URL (non-Drive)
  switchToHtml5Mode();
  setAudioLoading(true);
  state.audioElement.src = mod.audio.url;
  state.audioElement.playbackRate = state.playbackSpeed;
  try {
    await state.audioElement.play();
    state.isPlaying = true;
    updatePlayPauseButton();
    setAudioLoading(false);
  } catch (err) {
    console.warn('Direct audio stream failed:', err);
    setAudioLoading(false);
    const timeCurrent = document.getElementById('player-time-current');
    if (timeCurrent) timeCurrent.textContent = 'Audio Error';
  }
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
  if (activeAudioAbortCtrl) {
    activeAudioAbortCtrl.abort();
    activeAudioAbortCtrl = null;
  }
  state.audioElement.pause();
  state.audioElement.src = '';
  state.isPlaying = false;
  state.activeAudio = null;

  const embedFrame = document.getElementById('player-embed-frame');
  if (embedFrame) embedFrame.src = '';
  const embedContainer = document.getElementById('player-embed-container');
  if (embedContainer) embedContainer.style.display = 'none';

  const html5Controls = document.getElementById('player-html5-controls');
  if (html5Controls) html5Controls.style.display = 'flex';
  const speedGroup = document.getElementById('player-speed-group');
  if (speedGroup) speedGroup.style.display = 'flex';

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
  // Initialize Exam Countdown
  initExamCountdown();
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
