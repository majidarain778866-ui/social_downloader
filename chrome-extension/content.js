// Social Downloader Site Overlay Floating Download Button Content Script

(function () {
  'use strict';

  let enabled = true;

  // Check storage setting
  if (chrome.storage && chrome.storage.sync) {
    chrome.storage.sync.get(['enableFloatingButtons'], (res) => {
      if (res.enableFloatingButtons === false) {
        enabled = false;
      }
      if (enabled) {
        initFloatingButtons();
      }
    });
  } else {
    initFloatingButtons();
  }

  function initFloatingButtons() {
    // Periodically inspect DOM for video elements
    setInterval(injectButtons, 2000);
    injectButtons();
  }

  function injectButtons() {
    if (!enabled) return;

    // Detect YouTube Video Player
    if (window.location.host.includes('youtube.com')) {
      const player = document.querySelector('#movie_player, .html5-video-player');
      if (player && !player.querySelector('.getintodevice-floating-btn')) {
        const btn = createFloatingButton(() => {
          triggerDownloadForUrl(window.location.href);
        });
        player.style.position = 'relative';
        player.appendChild(btn);
      }
    }

    // Detect TikTok Feed / Player
    if (window.location.host.includes('tiktok.com')) {
      document.querySelectorAll('[class*="-DivVideoPlayerContainer"], video').forEach((container) => {
        const parent = container.parentElement || container;
        if (parent && !parent.querySelector('.getintodevice-floating-btn')) {
          parent.style.position = 'relative';
          const btn = createFloatingButton(() => {
            triggerDownloadForUrl(window.location.href);
          });
          parent.appendChild(btn);
        }
      });
    }

    // Detect Instagram Reels / Posts
    if (window.location.host.includes('instagram.com')) {
      document.querySelectorAll('article, [role="presentation"]').forEach((article) => {
        const video = article.querySelector('video');
        if (video && !article.querySelector('.getintodevice-floating-btn')) {
          article.style.position = 'relative';
          const btn = createFloatingButton(() => {
            const link = article.querySelector('a[href*="/p/"], a[href*="/reel/"]');
            const targetUrl = link ? link.href : window.location.href;
            triggerDownloadForUrl(targetUrl);
          });
          article.appendChild(btn);
        }
      });
    }
  }

  function createFloatingButton(onClickHandler) {
    const btn = document.createElement('button');
    btn.className = 'getintodevice-floating-btn';
    btn.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
      <span>Download HD</span>
    `;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClickHandler();
    });
    return btn;
  }

  function triggerDownloadForUrl(url) {
    showToast('Fetching media details...');

    chrome.runtime.sendMessage(
      { action: 'FETCH_VIDEO_INFO', url: url },
      (response) => {
        if (!response || !response.success) {
          showToast('Failed to parse media details. Opening extension popup...');
          return;
        }

        const data = response.data;
        const apiBase = response.apiBase || 'http://localhost:3000';
        const primary = data.downloads?.[0];
        const rawUrl = primary?.download_url || primary?.url;

        if (primary && rawUrl) {
          const downloadUrl = rawUrl.startsWith('http') ? rawUrl : `${apiBase}${rawUrl}`;
          const ext = primary.extension || primary.ext || 'mp4';
          const filename = `${safeFileName(data.title || 'media')}.${ext}`;

          chrome.runtime.sendMessage({
            action: 'TRIGGER_DOWNLOAD',
            url: downloadUrl,
            filename: filename
          });

          showToast('⚡ Download started successfully!');
        } else {
          showToast('No direct download stream found.');
        }
      }
    );
  }

  function showToast(message) {
    const existing = document.querySelector('.getintodevice-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'getintodevice-toast';
    toast.innerHTML = `
      <div class="getintodevice-toast-icon">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="#fff"><path d="M12 16l4-5h-3V4h-2v7H8l4 5zm-7 2h14v2H5v-2z"/></svg>
      </div>
      <div>
        <div style="font-weight: 700; font-size: 13px;">Social Downloader</div>
        <div style="font-size: 12px; opacity: 0.85;">${message}</div>
      </div>
    `;

    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  function safeFileName(name) {
    return String(name || 'media').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim().slice(0, 60);
  }
})();
