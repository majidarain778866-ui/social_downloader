const PRODUCTION_API_BASE = 'https://socialdownloader.app';
let currentApiBase = PRODUCTION_API_BASE;
let activeTabUrl = '';

document.addEventListener('DOMContentLoaded', async () => {
  // Load saved settings & accent theme
  const settings = await chrome.storage.sync.get(['enableFloatingButtons', 'accentColor', 'customApiBase', 'apiBaseUrl']);
  currentApiBase = settings.customApiBase || settings.apiBaseUrl || PRODUCTION_API_BASE;
  
  if (settings.accentColor) {
    applyThemeAccent(settings.accentColor, false);
  }

  const chkFloatingButtons = document.getElementById('chkFloatingButtons');
  if (chkFloatingButtons && settings.enableFloatingButtons !== undefined) {
    chkFloatingButtons.checked = settings.enableFloatingButtons;
  }

  // Initialize UI event handlers
  setupTabNavigation();
  setupInputHandlers();
  setupAutoDetect();
  setupThemePresets();
  loadDownloadHistory();

  if (chkFloatingButtons) {
    chkFloatingButtons.addEventListener('change', (e) => {
      chrome.storage.sync.set({ enableFloatingButtons: e.target.checked });
    });
  }

  // Admin Launchers
  document.getElementById('btnOpenAdmin').addEventListener('click', openAdminPage);
  document.getElementById('cardLaunchAdmin').addEventListener('click', openAdminPage);
});

// Apply Theme Accent Dynamically
function applyThemeAccent(color, showNotification = true, name = '') {
  const glowMap = {
    '#7c3aed': 'rgba(124, 58, 237, 0.4)',
    '#06b6d4': 'rgba(6, 182, 212, 0.4)',
    '#ec4899': 'rgba(236, 72, 153, 0.4)',
    '#10b981': 'rgba(16, 185, 129, 0.4)',
    '#f59e0b': 'rgba(245, 158, 11, 0.4)',
    '#3b82f6': 'rgba(59, 130, 246, 0.4)'
  };
  
  const glow = glowMap[color] || `${color}66`;

  document.documentElement.style.setProperty('--accent-purple', color);
  document.documentElement.style.setProperty('--accent-glow', glow);
  document.documentElement.style.setProperty('--accent-btn', `linear-gradient(135deg, ${color} 0%, #4338ca 100%)`);
  document.documentElement.style.setProperty('--accent-gradient', `linear-gradient(135deg, ${color} 0%, #4f46e5 50%, #06b6d4 100%)`);
  document.documentElement.style.setProperty('--border-focus', color);

  // Highlight active dot
  document.querySelectorAll('#popupThemePresets .theme-dot').forEach((btn) => {
    if (btn.getAttribute('data-color') === color) {
      btn.classList.add('active');
      btn.style.borderColor = '#ffffff';
    } else {
      btn.classList.remove('active');
      btn.style.borderColor = 'transparent';
    }
  });

  if (showNotification && name) {
    showThemeToast(`✨ Theme changed to ${name}!`);
  }
}

function showThemeToast(msg) {
  const existing = document.querySelector('.theme-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'theme-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

function setupThemePresets() {
  document.querySelectorAll('#popupThemePresets .theme-dot').forEach((btn) => {
    btn.addEventListener('click', () => {
      const color = btn.getAttribute('data-color');
      const name = btn.getAttribute('data-name') || 'New Theme';
      applyThemeAccent(color, true, name);
      chrome.storage.sync.set({ accentColor: color });
    });
  });
}

// Navigation Tabs Setup
function setupTabNavigation() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));

      tab.classList.add('active');
      const targetId = tab.getAttribute('data-tab');
      document.getElementById(targetId).classList.add('active');

      if (targetId === 'tabHistory') {
        loadDownloadHistory();
      }
    });
  });
}

// Auto Detect Active Browser Tab URL
async function setupAutoDetect() {
  const detectBadge = document.getElementById('detectBadge');
  const detectTitle = document.getElementById('detectTitle');
  const inputUrl = document.getElementById('inputUrl');
  const btnGrabCurrent = document.getElementById('btnGrabCurrent');
  const btnRefreshTab = document.getElementById('btnRefreshTab');

  const checkTab = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url) return;

      activeTabUrl = tab.url;
      const platform = matchSocialPlatform(activeTabUrl);

      detectBadge.className = `platform-pill ${platform.key}`;
      detectBadge.textContent = platform.name.toUpperCase();
      detectTitle.textContent = tab.title || activeTabUrl;

      if (platform.key !== 'general' && !inputUrl.value) {
        inputUrl.value = activeTabUrl;
      }
    } catch (err) {
      console.warn('Auto-detect tab error:', err);
    }
  };

  await checkTab();

  btnGrabCurrent.addEventListener('click', () => {
    if (activeTabUrl) {
      inputUrl.value = activeTabUrl;
      triggerFetchMedia(activeTabUrl);
    }
  });

  btnRefreshTab.addEventListener('click', checkTab);
}

// Match Social Platform from URL
function matchSocialPlatform(url) {
  if (/tiktok\.com/i.test(url)) return { key: 'tiktok', name: 'TikTok' };
  if (/instagram\.com/i.test(url)) return { key: 'instagram', name: 'Instagram' };
  if (/youtube\.com|youtu\.be/i.test(url)) return { key: 'youtube', name: 'YouTube' };
  if (/facebook\.com|fb\.watch/i.test(url)) return { key: 'facebook', name: 'Facebook' };
  if (/twitter\.com|x\.com/i.test(url)) return { key: 'twitter', name: 'X / Twitter' };
  if (/pinterest\.com/i.test(url)) return { key: 'pinterest', name: 'Pinterest' };
  return { key: 'general', name: 'Web Link' };
}

// Input Handlers
function setupInputHandlers() {
  const inputUrl = document.getElementById('inputUrl');
  const btnClearInput = document.getElementById('btnClearInput');
  const btnFetch = document.getElementById('btnFetch');

  btnClearInput.addEventListener('click', () => {
    inputUrl.value = '';
    document.getElementById('resultCard').classList.remove('active');
  });

  btnFetch.addEventListener('click', () => {
    const url = inputUrl.value.trim();
    if (!url) {
      alert('Please enter or paste a media URL.');
      return;
    }
    triggerFetchMedia(url);
  });

  inputUrl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      btnFetch.click();
    }
  });

  // Batch Media Scan
  const btnScanPage = document.getElementById('btnScanPage');
  if (btnScanPage) {
    btnScanPage.addEventListener('click', scanActivePageMedia);
  }

  // Clear History
  const btnClearHistory = document.getElementById('btnClearHistory');
  if (btnClearHistory) {
    btnClearHistory.addEventListener('click', async () => {
      await chrome.storage.local.set({ download_history: [] });
      loadDownloadHistory();
    });
  }
}

// Fetch Video & Photo Details from Production API Server
async function triggerFetchMedia(url) {
  const loadingState = document.getElementById('loadingState');
  const resultCard = document.getElementById('resultCard');
  const btnFetch = document.getElementById('btnFetch');

  loadingState.classList.add('active');
  resultCard.classList.remove('active');
  btnFetch.disabled = true;

  try {
    const stored = await chrome.storage.sync.get(['customApiBase', 'apiBaseUrl']);
    const apiBase = stored.customApiBase || stored.apiBaseUrl || currentApiBase || PRODUCTION_API_BASE;
    currentApiBase = apiBase;
    const response = await fetch(`${apiBase}/api/video-info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Server responded with status ${response.status}`);
    }

    const data = await response.json();
    renderMediaResultCard(data, url, apiBase);

    trackAnalyticsEvent('video_fetch_success', { platform: data.platform || 'general' });
  } catch (error) {
    alert(`Fetch failed: ${error.message}`);
    trackAnalyticsEvent('video_fetch_error', { error: error.message });
  } finally {
    loadingState.classList.remove('active');
    btnFetch.disabled = false;
  }
}

// Render Result Card Formats (Supports Video, Audio, and Multi-Photo Carousels)
function renderMediaResultCard(data, sourceUrl, activeApiBase) {
  const apiBase = activeApiBase || currentApiBase || PRODUCTION_API_BASE;
  const resultCard = document.getElementById('resultCard');
  const resThumbnail = document.getElementById('resThumbnail');
  const resDuration = document.getElementById('resDuration');
  const resTitle = document.getElementById('resTitle');
  const resAuthor = document.getElementById('resAuthor');
  const formatList = document.getElementById('formatList');

  resThumbnail.src = data.thumbnail || 'icons/icon128.png';
  resDuration.textContent = data.duration || 'HD Media';
  resTitle.textContent = data.title || 'Social Media Asset';
  resAuthor.textContent = data.creator?.name ? `@${data.creator.name}` : (data.author ? `@${data.author}` : 'Social Downloader Verified Link');

  formatList.innerHTML = '';
  const downloads = data.downloads || [];

  if (downloads.length === 0) {
    formatList.innerHTML = `<div class="empty-state">No direct download formats parsed. Try fetching again.</div>`;
  } else {
    downloads.forEach((fmt) => {
      const item = document.createElement('div');
      item.className = 'format-item';

      const isAudio = fmt.type === 'audio' || /mp3|audio/i.test(fmt.quality || fmt.label || '');
      const isImage = fmt.type === 'image' || /jpg|jpeg|png|webp|image|photo/i.test(fmt.extension || fmt.label || fmt.badge || '');
      
      const badgeClass = isAudio ? 'format-badge audio' : (isImage ? 'format-badge image' : 'format-badge');
      const badgeTag = isAudio ? 'AUDIO' : (isImage ? 'PHOTO' : 'VIDEO');
      const labelText = fmt.label || fmt.quality || (isAudio ? 'MP3 Audio' : isImage ? 'HD Image' : 'HD MP4 Video');

      item.innerHTML = `
        <div class="format-info">
          <span class="${badgeClass}">${badgeTag}</span>
          <span class="format-quality">${labelText}</span>
          <span class="format-size">${fmt.extension ? fmt.extension.toUpperCase() : (fmt.ext ? fmt.ext.toUpperCase() : '')}</span>
        </div>
        <button class="btn-download-format">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 9 L15 9 L15 3 L9 3 L9 9 L5 9 L12 16 Z M5 18 L19 18 L19 20 L5 20 Z"/></svg>
          Download
        </button>
      `;

      const dlBtn = item.querySelector('.btn-download-format');
      dlBtn.addEventListener('click', () => {
        const rawTarget = fmt.download_url || fmt.url || '';
        if (!rawTarget) {
          alert('Download target URL is missing.');
          return;
        }
        const downloadUrl = rawTarget.startsWith('http') ? rawTarget : `${apiBase}${rawTarget}`;
        
        const ext = fmt.extension || fmt.ext || (isAudio ? 'mp3' : isImage ? 'jpg' : 'mp4');
        const filename = `${safeFileName(data.title || 'media')}.${ext}`;

        chrome.downloads.download({
          url: downloadUrl,
          filename: filename,
          saveAs: true
        });

        saveHistoryItem({
          title: data.title || 'Social Asset',
          thumbnail: data.thumbnail,
          url: downloadUrl,
          filename: filename,
          format: labelText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
      });
        
        const ext = fmt.extension || fmt.ext || (isAudio ? 'mp3' : isImage ? 'jpg' : 'mp4');
        const filename = `${safeFileName(data.title || 'media')}.${ext}`;

        chrome.downloads.download({
          url: downloadUrl,
          filename: filename,
          saveAs: true
        });

        saveHistoryItem({
          title: data.title || 'Social Asset',
          thumbnail: data.thumbnail,
          url: downloadUrl,
          filename: filename,
          format: labelText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
      });

      formatList.appendChild(item);
    });
  }

  resultCard.classList.add('active');
}

// Batch Media Scan on Active Page
async function scanActivePageMedia() {
  const container = document.getElementById('batchMediaList');
  container.innerHTML = `<div class="spinner"></div>`;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const media = [];
        document.querySelectorAll('video, img').forEach((el) => {
          const src = el.src || el.currentSrc;
          if (src && /^https?:\/\//i.test(src) && !src.includes('data:image')) {
            media.push({
              type: el.tagName.toLowerCase(),
              src: src,
              title: el.alt || el.title || 'Page Asset'
            });
          }
        });
        return media;
      }
    });

    const items = results[0]?.result || [];
    container.innerHTML = '';

    if (items.length === 0) {
      container.innerHTML = `<div class="empty-state">No downloadable media assets found on this page.</div>`;
      return;
    }

    items.slice(0, 30).forEach((m) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'history-item';
      itemEl.innerHTML = `
        <img src="${m.src}" class="history-thumb" onerror="this.src='icons/icon48.png'">
        <div class="history-details">
          <div class="history-title">${m.title}</div>
          <div class="history-meta">${m.type.toUpperCase()} • ${m.src.substring(0, 35)}...</div>
        </div>
        <button class="btn-download-format" style="padding: 4px 8px;">Grab</button>
      `;

      itemEl.querySelector('button').addEventListener('click', () => {
        chrome.downloads.download({
          url: m.src,
          saveAs: true
        });
      });

      container.appendChild(itemEl);
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state" style="color: #ec4899;">Error scanning page: ${err.message}</div>`;
  }
}

// History Manager
async function saveHistoryItem(item) {
  const store = await chrome.storage.local.get(['download_history']);
  const list = store.download_history || [];
  list.unshift(item);
  if (list.length > 50) list.pop();
  await chrome.storage.local.set({ download_history: list });
}

async function loadDownloadHistory() {
  const container = document.getElementById('historyContainer');
  if (!container) return;

  const store = await chrome.storage.local.get(['download_history']);
  const list = store.download_history || [];

  if (list.length === 0) {
    container.innerHTML = `<div class="empty-state">No recent downloads logged yet.</div>`;
    return;
  }

  container.innerHTML = '';
  list.forEach((item) => {
    const el = document.createElement('div');
    el.className = 'history-item';
    el.innerHTML = `
      <img src="${item.thumbnail || 'icons/icon48.png'}" class="history-thumb" onerror="this.src='icons/icon48.png'">
      <div class="history-details">
        <div class="history-title">${item.title}</div>
        <div class="history-meta">${item.format || 'HD Video'} • ${item.timestamp}</div>
      </div>
      <button class="btn-download-format" style="padding: 4px 8px;">Re-Download</button>
    `;

    el.querySelector('button').addEventListener('click', () => {
      chrome.downloads.download({
        url: item.url,
        filename: item.filename,
        saveAs: true
      });
    });

    container.appendChild(el);
  });
}

// Launch Full Admin Options Page
function openAdminPage() {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL('admin/admin.html'));
  }
}

// Track Analytics Events locally
async function trackAnalyticsEvent(eventType, payload = {}) {
  const store = await chrome.storage.local.get(['analytics_stats']);
  const stats = store.analytics_stats || { total_fetches: 0, total_downloads: 0, errors: 0, platforms: {} };

  if (eventType === 'video_fetch_success') {
    stats.total_fetches = (stats.total_fetches || 0) + 1;
    const p = payload.platform || 'general';
    stats.platforms[p] = (stats.platforms[p] || 0) + 1;
  } else if (eventType === 'video_fetch_error') {
    stats.errors = (stats.errors || 0) + 1;
  }

  await chrome.storage.local.set({ analytics_stats: stats });
}

function safeFileName(name) {
  return String(name || 'media').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim().slice(0, 60);
}
