// Social Downloader Chrome Extension - Service Worker (Manifest V3)

const PRODUCTION_API_BASE = 'https://socialdownloader.app';

const getApiBase = async () => {
  const store = await chrome.storage.sync.get(['customApiBase', 'apiBaseUrl']);
  return store.customApiBase || store.apiBaseUrl || PRODUCTION_API_BASE;
};

// Installation & Defaults Setup
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Social Downloader] Extension Service Worker initialized.');

  chrome.storage.sync.set({ apiBaseUrl: PRODUCTION_API_BASE });

  chrome.storage.sync.get(['enableFloatingButtons', 'accentColor'], (res) => {
    if (res.enableFloatingButtons === undefined) chrome.storage.sync.set({ enableFloatingButtons: true });
    if (!res.accentColor) chrome.storage.sync.set({ accentColor: '#7c3aed' });
  });

  // Create Right-Click Context Menu
  chrome.contextMenus.create({
    id: 'socialdownloader_download_media',
    title: '⚡ Download with Social Downloader',
    contexts: ['link', 'video', 'audio', 'image', 'page']
  });
});

// Handle Context Menu Clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'socialdownloader_download_media' || info.menuItemId === 'getintodevice_download_media') {
    const targetUrl = info.linkUrl || info.srcUrl || info.pageUrl;
    if (!targetUrl) return;

    console.log('[Social Downloader] Context menu download for:', targetUrl);

    try {
      const apiBase = await getApiBase();
      const response = await fetch(`${apiBase}/api/video-info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl })
      });

      if (!response.ok) throw new Error('API server error');
      const data = await response.json();

      const primaryDownload = data.downloads?.[0];
      if (primaryDownload && (primaryDownload.download_url || primaryDownload.url)) {
        const rawUrl = primaryDownload.download_url || primaryDownload.url;
        const downloadUrl = rawUrl.startsWith('http') ? rawUrl : `${apiBase}${rawUrl}`;
        chrome.downloads.download({
          url: downloadUrl,
          saveAs: true
        });
      } else {
        chrome.downloads.download({
          url: targetUrl,
          saveAs: true
        });
      }
    } catch (err) {
      console.warn('[Social Downloader] Direct fetch fallback:', err);
      chrome.downloads.download({
        url: targetUrl,
        saveAs: true
      });
    }
  }
});

// Listen to Download Events for Admin Stats
chrome.downloads.onChanged.addListener(async (delta) => {
  if (delta.state && delta.state.current === 'complete') {
    const store = await chrome.storage.local.get(['analytics_stats']);
    const stats = store.analytics_stats || { total_downloads: 0 };
    stats.total_downloads = (stats.total_downloads || 0) + 1;
    await chrome.storage.local.set({ analytics_stats: stats });
  }
});

// Listen to Messages from Content Scripts & Popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'FETCH_VIDEO_INFO') {
    getApiBase().then((apiBase) => {
      fetch(`${apiBase}/api/video-info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: request.url })
      })
        .then((res) => res.json())
        .then((data) => {
          sendResponse({ success: true, data, apiBase });
        })
        .catch((err) => {
          sendResponse({ success: false, error: err.message });
        });
    });
    return true;
  }

  if (request.action === 'TRIGGER_DOWNLOAD') {
    chrome.downloads.download({
      url: request.url,
      filename: request.filename,
      saveAs: request.saveAs ?? true
    }, (downloadId) => {
      sendResponse({ success: true, downloadId });
    });
    return true;
  }
});
