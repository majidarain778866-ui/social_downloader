const form = document.querySelector("#download-form");
const input = document.querySelector("#url-input");
const button = document.querySelector("#fetch-button");
const brandMark = document.querySelector(".brand-mark");
const statusEl = document.querySelector("#status");
const loader = document.querySelector("#loader");
const loaderTitle = document.querySelector("#loader-title");
const loaderDetail = document.querySelector("#loader-detail");
const loaderPercent = document.querySelector("#loader-percent");
const progressBar = document.querySelector("#progress-bar");
const processSteps = document.querySelectorAll("#process-steps span");
const result = document.querySelector("#result");
const smartPreview = document.querySelector("#smart-preview");
const thumbnail = document.querySelector("#thumbnail");
const title = document.querySelector("#title");
const count = document.querySelector("#count");
const options = document.querySelector("#options");
const resultBadges = document.querySelector("#result-badges");
const highDownload = document.querySelector("#high-download");
const normalDownload = document.querySelector("#normal-download");
const audioDownload = document.querySelector("#audio-download");
const thumbnailDownload = document.querySelector("#thumbnail-download");
const highMeta = document.querySelector("#high-meta");
const normalMeta = document.querySelector("#normal-meta");
const audioMeta = document.querySelector("#audio-meta");
const thumbMeta = document.querySelector("#thumb-meta");
const sourceLink = document.querySelector("#source-link");
const platformIcon = document.querySelector("#platform-icon");
const creatorCard = document.querySelector("#creator-card");
const creatorAvatar = document.querySelector("#creator-avatar");
const creatorName = document.querySelector("#creator-name");
const creatorHandle = document.querySelector("#creator-handle");
const creatorStats = document.querySelector("#creator-stats");
const creatorLink = document.querySelector("#creator-link");
const outputSummary = document.querySelector("#output-summary");
const filterButtons = document.querySelectorAll(".filter-chip");
const bottomNavLinks = document.querySelectorAll(".bottom-app-nav a");
const themeToggleBtn = document.querySelector("#theme-toggle-btn");
const themeIcon = document.querySelector("#theme-icon");
const btnClearUrl = document.querySelector("#btn-clear-url");
const btnPasteUrl = document.querySelector("#btn-paste-url");
const platformChips = document.querySelectorAll(".platform-chip");

const pageKey = document.documentElement.dataset.pageKey?.includes("__") ? "home" : document.documentElement.dataset.pageKey || "home";

// Universal API Base Resolver:
// Works on localhost, Netlify, and when uploaded to WordPress public_html/dist/
const DEFAULT_REMOTE_API = "https://social-downloader-pro.netlify.app";
const getApiBase = () => {
  if (window.SOCIAL_DOWNLOADER_API_BASE) {
    return String(window.SOCIAL_DOWNLOADER_API_BASE).replace(/\/+$/, "");
  }
  const host = window.location.hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1";
  const isServerless = host.endsWith("netlify.app") || host.endsWith("vercel.app");
  if (isLocal || isServerless) {
    return "";
  }
  // When hosted inside WordPress or other external host, use the live backend
  return DEFAULT_REMOTE_API;
};

const configuredApiBase = getApiBase();
let loaderTimer = null;
let activeFilter = "all";
let currentDownloads = [];
const brandSuffix = "Social Downloader";

// Theme Manager (Light & Dark Mode)
const getPreferredTheme = () => {
  const saved = localStorage.getItem("sd_theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
};

const applyTheme = (theme) => {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("sd_theme", theme);
  if (themeIcon) {
    themeIcon.textContent = theme === "light" ? "dark_mode" : "light_mode";
  }
  if (themeToggleBtn) {
    themeToggleBtn.setAttribute(
      "aria-label",
      theme === "light" ? "Switch to dark mode" : "Switch to light mode"
    );
    themeToggleBtn.setAttribute(
      "title",
      theme === "light" ? "Switch to dark mode" : "Switch to light mode"
    );
  }
};

const initTheme = () => {
  const current = getPreferredTheme();
  applyTheme(current);

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      const active = document.documentElement.getAttribute("data-theme") || "dark";
      const next = active === "light" ? "dark" : "light";
      applyTheme(next);
    });
  }

  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", (e) => {
    if (!localStorage.getItem("sd_theme")) {
      applyTheme(e.matches ? "light" : "dark");
    }
  });
};

const initInputEnhancements = () => {
  if (input && btnClearUrl) {
    const updateClearBtn = () => {
      btnClearUrl.style.display = input.value.trim().length > 0 ? "inline-flex" : "none";
    };

    input.addEventListener("input", updateClearBtn);
    input.addEventListener("change", updateClearBtn);
    updateClearBtn();

    btnClearUrl.addEventListener("click", () => {
      input.value = "";
      updateClearBtn();
      input.focus();
      setStatus("");
    });
  }

  if (btnPasteUrl && input) {
    btnPasteUrl.addEventListener("click", async () => {
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          const text = await navigator.clipboard.readText();
          if (text && text.trim().startsWith("http")) {
            input.value = text.trim();
            if (btnClearUrl) btnClearUrl.style.display = "inline-flex";
            setStatus("📋 Link pasted! Click Download to analyze.");
            input.focus();
          } else {
            setStatus("Please copy a valid video URL first.", true);
          }
        } else {
          input.focus();
          setStatus("Press Ctrl+V to paste your link.");
        }
      } catch (err) {
        input.focus();
        setStatus("Paste permission not granted. Use Ctrl+V or Cmd+V to paste.");
      }
    });
  }

  if (platformChips && platformChips.length) {
    platformChips.forEach((chip) => {
      chip.addEventListener("click", () => {
        input.focus();
        input.placeholder = `Paste ${chip.textContent.trim()} link here...`;
      });
    });
  }
};

initTheme();
initInputEnhancements();

const apiUrl = (path) => `${configuredApiBase}${path}`;

const assetUrl = (url) => {
  if (!url || String(url).startsWith("http")) return url || "#";
  return apiUrl(url);
};

const applyPageContent = () => {
  // Update header navigation active styles
  document.querySelectorAll(".nav-links a").forEach((link) => {
    const active = link.getAttribute("href") === window.location.pathname;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
  });
};

const setStatus = (message, isError = false) => {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
};

const loaderStages = [
  { percent: 18, title: "Checking link...", detail: "Validating public URL and platform hints" },
  { percent: 42, title: "Detecting platform...", detail: "Matching the source to the best extractor" },
  { percent: 68, title: "Reading metadata...", detail: "Collecting title, thumbnail, creator, and formats" },
  { percent: 88, title: "Preparing assets...", detail: "Building secure preview and download links" }
];

const updateLoaderProgress = (percent, heading, detail) => {
  loaderPercent.textContent = `${percent}%`;
  progressBar.style.width = `${percent}%`;
  loaderTitle.textContent = heading;
  loaderDetail.textContent = detail;
  processSteps.forEach((step, index) => {
    const threshold = loaderStages[index]?.percent || 100;
    step.classList.toggle("done", percent >= threshold);
    step.classList.toggle("active", percent < threshold && index === processSteps.length - 1 ? false : percent >= (loaderStages[index - 1]?.percent || 0) && percent < threshold);
  });
};

const startProcessLoader = () => {
  let index = 0;
  clearInterval(loaderTimer);
  updateLoaderProgress(loaderStages[0].percent, loaderStages[0].title, loaderStages[0].detail);
  loaderTimer = setInterval(() => {
    index = Math.min(index + 1, loaderStages.length - 1);
    const stage = loaderStages[index];
    updateLoaderProgress(stage.percent, stage.title, stage.detail);
    if (index === loaderStages.length - 1) clearInterval(loaderTimer);
  }, 900);
};

const finishProcessLoader = () => {
  clearInterval(loaderTimer);
  updateLoaderProgress(100, "Assets ready.", "Download cards are prepared for this public link");
};

const setLoading = (isLoading, heading = "Analyzing link...", detail = "Preparing download options") => {
  if (button) {
    button.disabled = isLoading;
    if (isLoading) {
      button.classList.add("loading");
      if (!button.dataset.originalHtml) {
        button.dataset.originalHtml = button.innerHTML;
      }
      button.innerHTML = `<span class="material-symbols-outlined btn-icon spinner-icon">progress_activity</span><span>Fetching...</span>`;
    } else {
      button.classList.remove("loading");
      if (button.dataset.originalHtml) {
        button.innerHTML = button.dataset.originalHtml;
      }
    }
  }

  if (input) {
    input.disabled = isLoading;
  }

  if (loader) {
    loader.hidden = !isLoading;
    if (isLoading) {
      loader.removeAttribute("hidden");
    } else {
      loader.setAttribute("hidden", "");
    }
  }

  if (isLoading) {
    if (loaderTitle) loaderTitle.textContent = heading;
    if (loaderDetail) loaderDetail.textContent = detail;
  } else {
    clearInterval(loaderTimer);
  }
};

const safeFileName = (name) => {
  const str = String(name || "social-download")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const dotIndex = str.lastIndexOf(".");
  if (dotIndex > 0 && dotIndex > str.length - 8) {
    const ext = str.slice(dotIndex);
    const base = str.slice(0, dotIndex).slice(0, 80).trim();
    return `${base}${ext}`;
  }
  return str.slice(0, 80) || "social-download";
};

const brandedDownloadName = (name, extension = "") => {
  const cleanExtension = String(extension || "").replace(/^\./, "").toLowerCase();
  const baseName = String(name || "social-download")
    .replace(new RegExp(`\\s*-\\s*${brandSuffix.replace(".", "\\.")}\\s*$`, "i"), "")
    .replace(/\.[a-z0-9]{2,5}$/i, "");
  const suffix = cleanExtension ? `.${cleanExtension}` : "";
  return safeFileName(`${baseName} - ${brandSuffix}${suffix}`);
};

const makeBadge = (value) => {
  const badge = document.createElement("span");
  badge.className = "result-badge";
  badge.textContent = value;
  return badge;
};

const platformMeta = {
  youtube: { className: "platform-youtube", icon: "YT", label: "YouTube" },
  tiktok: { className: "platform-tiktok", icon: "TT", label: "TikTok" },
  instagram: { className: "platform-instagram", icon: "IG", label: "Instagram" },
  facebook: { className: "platform-facebook", icon: "FB", label: "Facebook" },
  twitter: { className: "platform-twitter", icon: "X", label: "X / Twitter" },
  pinterest: { className: "platform-pinterest", icon: "PI", label: "Pinterest" },
  vimeo: { className: "platform-vimeo", icon: "VI", label: "Vimeo" },
  reddit: { className: "platform-reddit", icon: "RD", label: "Reddit" },
  soundcloud: { className: "platform-soundcloud", icon: "SC", label: "SoundCloud" },
  linkedin: { className: "platform-linkedin", icon: "LN", label: "LinkedIn" },
  threads: { className: "platform-threads", icon: "TH", label: "Threads" },
  snapchat: { className: "platform-snapchat", icon: "SC", label: "Snapchat" },
  rumble: { className: "platform-rumble", icon: "RM", label: "Rumble" },
  tumblr: { className: "platform-tumblr", icon: "TM", label: "Tumblr" },
  streamable: { className: "platform-streamable", icon: "ST", label: "Streamable" },
  bitchute: { className: "platform-bitchute", icon: "BC", label: "BitChute" },
  bandcamp: { className: "platform-bandcamp", icon: "BCM", label: "Bandcamp" },
  ifunny: { className: "platform-ifunny", icon: "IF", label: "iFunny" },
  douyin: { className: "platform-douyin", icon: "DY", label: "Douyin" },
  bluesky: { className: "platform-bluesky", icon: "BS", label: "Bluesky" },
  kwai: { className: "platform-kwai", icon: "KW", label: "Kwai" },
  telegram: { className: "platform-telegram", icon: "TG", label: "Telegram" },
  canva: { className: "platform-canva", icon: "CV", label: "Canva" },
  likee: { className: "platform-likee", icon: "LK", label: "Likee" },
  terabox: { className: "platform-terabox", icon: "TB", label: "TeraBox" },
  mixcloud: { className: "platform-mixcloud", icon: "MC", label: "MixCloud" },
  lemon8: { className: "platform-lemon8", icon: "L8", label: "Lemon8" },
  vk: { className: "platform-vk", icon: "VK", label: "VK" },
  dailymotion: { className: "platform-dailymotion", icon: "DM", label: "Dailymotion" },
  "mx-takatak": { className: "platform-mx-takatak", icon: "MX", label: "MX TakaTak" },
  whatsapp: { className: "platform-whatsapp", icon: "WA", label: "WhatsApp" },
  rednote: { className: "platform-rednote", icon: "RN", label: "RedNote" },
  metaai: { className: "platform-metaai", icon: "AI", label: "Meta AI" },
  kick: { className: "platform-kick", icon: "KK", label: "Kick" },
  "9gag": { className: "platform-9gag", icon: "9G", label: "9GAG" },
  twitch: { className: "platform-twitch", icon: "TW", label: "Twitch" },
  loom: { className: "platform-loom", icon: "LM", label: "Loom" },
  sharechat: { className: "platform-sharechat", icon: "SC", label: "ShareChat" },
  generic: { className: "platform-generic", icon: "SD", label: "Social Downloader" }
};

const setPlatformIcon = (key, label, icon) => {
  const meta = platformMeta[key] || platformMeta.generic;
  platformIcon.className = `platform-icon ${meta.className}`;
  platformIcon.textContent = icon || meta.icon;
  platformIcon.setAttribute("aria-label", label || meta.label);
};

const setPrimaryAction = (link, meta, item, fallbackLabel) => {
  link.hidden = !item;
  if (!item) {
    link.href = "#";
    meta.textContent = fallbackLabel;
    return;
  }
  // Always point to our /api/download proxy so download works correctly
  link.href = assetUrl(item.download_url);
  link.removeAttribute("download"); // Let server handle Content-Disposition
  link.setAttribute("data-download-id", item.id || "");
  link.setAttribute("data-filename", brandedDownloadName(
    `${title.textContent || "social-download"}-${item.label || fallbackLabel}`,
    item.extension
  ));
  meta.textContent = [item.resolution, item.extension?.toUpperCase(), item.size].filter(Boolean).join(" - ") || fallbackLabel;
};

const selectPreviewItem = (data, downloads) => {
  const primary = data.primary_actions || {};
  return (
    primary.high_quality ||
    downloads.find((item) => item.type === "video") ||
    downloads.find((item) => item.type === "image") ||
    null
  );
};

let activePreviewItem = null;
const previewSpinner = document.querySelector("#preview-loading-spinner");
const showPreviewSpinner = (show) => {
  if (previewSpinner) previewSpinner.style.display = show ? "flex" : "none";
};

// Preview Modal Elements
const previewModal = document.querySelector("#preview-modal");
const previewModalBackdrop = document.querySelector("#preview-modal-backdrop");
const previewModalClose = document.querySelector("#preview-modal-close");
const previewModalTitle = document.querySelector("#preview-modal-title");
const previewModalBadge = document.querySelector("#preview-modal-badge");
const previewModalVideo = document.querySelector("#preview-modal-video");
const previewModalAudio = document.querySelector("#preview-modal-audio");
const previewModalImg = document.querySelector("#preview-modal-img");
const previewModalLoader = document.querySelector("#preview-modal-loader");
const previewModalDownloadBtn = document.querySelector("#preview-modal-download-btn");

const closePreviewModal = () => {
  if (!previewModal) return;
  previewModal.hidden = true;
  previewModal.setAttribute("aria-hidden", "true");
  if (previewModalVideo) {
    previewModalVideo.pause();
    previewModalVideo.removeAttribute("src");
    previewModalVideo.hidden = true;
  }
  if (previewModalAudio) {
    previewModalAudio.pause();
    previewModalAudio.removeAttribute("src");
    previewModalAudio.hidden = true;
  }
  if (previewModalImg) {
    previewModalImg.removeAttribute("src");
    previewModalImg.hidden = true;
  }
  if (previewModalLoader) previewModalLoader.style.display = "none";
  document.body.style.overflow = "";
};

const openPreviewModal = (item) => {
  if (!previewModal || !item) return;
  closePreviewModal();

  const isVideo = (item.type || "video") === "video";
  const isAudio = item.type === "audio";
  const isImage = item.type === "image";

  if (previewModalTitle) {
    previewModalTitle.textContent = item.label || item.resolution || "Media Preview";
  }
  if (previewModalBadge) {
    previewModalBadge.textContent = item.badge || item.resolution || "Asset";
    previewModalBadge.className = `asset-badge asset-${item.type || "video"}`;
  }
  if (previewModalDownloadBtn) {
    previewModalDownloadBtn.href = assetUrl(item.download_url || `/api/download?id=${encodeURIComponent(item.id)}`);
    previewModalDownloadBtn.setAttribute("data-download-id", item.id || "");
    previewModalDownloadBtn.setAttribute("data-filename", brandedDownloadName(
      `${title?.textContent || "social-download"}-${item.resolution || "asset"}`,
      item.extension
    ));
  }

  const mediaSrc = assetUrl(item.preview_url || item.download_url);
  if (previewModalLoader) previewModalLoader.style.display = "flex";

  if (isVideo && previewModalVideo) {
    previewModalVideo.hidden = false;
    previewModalVideo.src = mediaSrc;
    previewModalVideo.load();
    previewModalVideo.oncanplay = () => {
      if (previewModalLoader) previewModalLoader.style.display = "none";
    };
    previewModalVideo.onerror = () => {
      if (previewModalLoader) previewModalLoader.style.display = "none";
    };
    previewModalVideo.play().catch(() => {});
  } else if (isAudio && previewModalAudio) {
    previewModalAudio.hidden = false;
    previewModalAudio.src = mediaSrc;
    previewModalAudio.load();
    previewModalAudio.oncanplay = () => {
      if (previewModalLoader) previewModalLoader.style.display = "none";
    };
    previewModalAudio.onerror = () => {
      if (previewModalLoader) previewModalLoader.style.display = "none";
    };
    previewModalAudio.play().catch(() => {});
  } else if (isImage && previewModalImg) {
    previewModalImg.hidden = false;
    previewModalImg.src = mediaSrc;
    previewModalImg.onload = () => {
      if (previewModalLoader) previewModalLoader.style.display = "none";
    };
    previewModalImg.onerror = () => {
      if (previewModalLoader) previewModalLoader.style.display = "none";
    };
  }

  previewModal.hidden = false;
  previewModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
};

if (previewModalClose) {
  previewModalClose.addEventListener("click", closePreviewModal);
}
if (previewModalBackdrop) {
  previewModalBackdrop.addEventListener("click", closePreviewModal);
}
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && previewModal && !previewModal.hidden) {
    closePreviewModal();
  }
});

const renderSmartPreview = (data, downloads) => {
  const previewItem = selectPreviewItem(data, downloads);
  activePreviewItem = previewItem;
  const previewContainer = document.querySelector("#preview-media-container") || document.querySelector(".preview-media");
  if (previewContainer) previewContainer.classList.remove("is-playing");
  showPreviewSpinner(false);

  // ALWAYS show thumbnail immediately — loads fast from CDN
  smartPreview.hidden = true;
  smartPreview.removeAttribute("src");
  smartPreview.pause();
  thumbnail.src = "";
  thumbnail.hidden = true;

  if (data.thumbnail) {
    thumbnail.src = data.thumbnail;
    thumbnail.hidden = false;
    thumbnail.onerror = () => { thumbnail.hidden = true; };
  }

  const playBtn = document.querySelector("#preview-play-btn");
  if (playBtn) {
    const isVideo = previewItem?.type === "video";
    playBtn.style.display = isVideo ? "flex" : (data.thumbnail ? "none" : "flex");
  }

  // Pre-assign video source for instant click play
  if (previewItem?.type === "video" && previewItem.preview_url) {
    const videoSrc = assetUrl(previewItem.preview_url);
    smartPreview.src = videoSrc;
    smartPreview.load();
  }
};

// Wire up interactive click on preview media box
const previewContainer = document.querySelector("#preview-media-container") || document.querySelector(".preview-media");
if (previewContainer) {
  previewContainer.addEventListener("click", (e) => {
    // If click was on video control element itself when already playing, let native controls handle it
    if (e.target === smartPreview && !smartPreview.paused) return;

    if (!smartPreview) return;
    const currentSrc = smartPreview.getAttribute("src") || smartPreview.src;
    if (!currentSrc && activePreviewItem?.preview_url) {
      smartPreview.src = assetUrl(activePreviewItem.preview_url);
      smartPreview.load();
    }

    if (smartPreview.src) {
      if (smartPreview.paused) {
        showPreviewSpinner(true);
        smartPreview.hidden = false;
        smartPreview.play().then(() => {
          showPreviewSpinner(false);
          previewContainer.classList.add("is-playing");
        }).catch((err) => {
          console.warn("Inline play error:", err);
          showPreviewSpinner(false);
          // If inline playback fails, open sleek interactive modal preview
          if (activePreviewItem) {
            openPreviewModal(activePreviewItem);
          }
        });
      } else {
        smartPreview.pause();
        previewContainer.classList.remove("is-playing");
      }
    } else if (thumbnail && thumbnail.src && !thumbnail.hidden) {
      if (activePreviewItem) {
        openPreviewModal(activePreviewItem);
      } else {
        window.open(thumbnail.src, "_blank", "noopener,noreferrer");
      }
    }
  });

  previewContainer.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      previewContainer.click();
    }
  });

  smartPreview.addEventListener("waiting", () => {
    showPreviewSpinner(true);
  });
  smartPreview.addEventListener("canplay", () => {
    showPreviewSpinner(false);
  });
  smartPreview.addEventListener("playing", () => {
    showPreviewSpinner(false);
    previewContainer.classList.add("is-playing");
  });
  smartPreview.addEventListener("play", () => {
    previewContainer.classList.add("is-playing");
  });
  smartPreview.addEventListener("pause", () => {
    showPreviewSpinner(false);
    previewContainer.classList.remove("is-playing");
  });
  smartPreview.addEventListener("ended", () => {
    showPreviewSpinner(false);
    previewContainer.classList.remove("is-playing");
  });
  smartPreview.addEventListener("error", () => {
    showPreviewSpinner(false);
    smartPreview.hidden = true;
    thumbnail.hidden = !thumbnail.src;
  });
}

const renderCreator = (data) => {
  const creator = data.creator || {};
  const hasCreator = Boolean(creator.name || creator.handle || creator.avatar || creator.profile_url);
  creatorCard.hidden = !hasCreator;
  if (!hasCreator) return;

  creatorName.textContent = creator.name || "Public creator";
  creatorHandle.textContent = [creator.handle, creator.verified ? "Verified" : ""].filter(Boolean).join(" - ");
  creatorStats.replaceChildren(
    ...[
      creator.followers ? ["Followers", creator.followers] : null,
      creator.video_count ? ["Videos", creator.video_count] : null,
      data.media?.view_count ? ["Views", data.media.view_count] : null,
      data.media?.like_count ? ["Likes", data.media.like_count] : null
    ]
      .filter(Boolean)
      .map(([label, value]) => {
        const stat = document.createElement("span");
        stat.className = "creator-stat";
        stat.innerHTML = `<strong>${value}</strong><small>${label}</small>`;
        return stat;
      })
  );

  creatorAvatar.textContent = (creator.name || data.platform_icon || "SD").slice(0, 2).toUpperCase();
  creatorAvatar.style.backgroundImage = creator.avatar ? `url("${creator.avatar}")` : data.thumbnail ? `url("${data.thumbnail}")` : "";
  creatorAvatar.classList.toggle("has-image", Boolean(creator.avatar));
  creatorAvatar.classList.toggle("fallback-image", !creator.avatar && Boolean(data.thumbnail));

  creatorLink.href = creator.profile_url || "#";
  creatorLink.hidden = !creator.profile_url;
};

const renderResults = (data) => {
  const downloads = Array.isArray(data.downloads) ? data.downloads : Array.isArray(data.videos) ? data.videos : [];
  const platformKey = data.platform_key || "generic";
  const primaryActions = data.primary_actions || {};
  currentDownloads = downloads;

  // Truncate title and show description if long or multiline
  const descriptionEl = document.querySelector("#description");
  if (descriptionEl) {
    if (data.title && (data.title.includes("\n") || data.title.length > 90)) {
      const parts = data.title.split("\n");
      title.textContent = parts[0].slice(0, 90) + (parts[0].length > 90 ? "..." : "");
      descriptionEl.textContent = data.title;
      descriptionEl.style.display = "block";
    } else {
      title.textContent = data.title || "Download ready";
      descriptionEl.style.display = "none";
    }
  } else {
    title.textContent = data.title || "Download ready";
  }

  count.textContent = `${downloads.length} download option${downloads.length === 1 ? "" : "s"} found`;
  thumbnail.alt = data.thumbnail ? data.title || "Media thumbnail" : "";
  renderSmartPreview(data, downloads);
  setPlatformIcon(platformKey, data.platform_label, data.platform_icon);

  // Stats badges (excluding views/likes/shares since they have their own grid boxes)
  resultBadges.replaceChildren(
    ...[
      data.platform_label || data.platform,
      data.creator?.name,
      data.duration
    ]
      .filter(Boolean)
      .map(makeBadge)
  );

  // Render media stats box grid
  const mediaStatsBox = document.querySelector("#media-stats-box");
  if (mediaStatsBox) {
    const media = data.media || {};
    const views = media.view_count || "";
    const likes = media.like_count || "";
    const shares = media.share_count || "";
    const duration = media.duration || data.duration || "";

    const hasStats = Boolean(views || likes || shares || duration);
    mediaStatsBox.style.display = hasStats ? "grid" : "none";

    const statViewsVal = document.querySelector("#stat-views");
    const statLikesVal = document.querySelector("#stat-likes");
    const statSharesVal = document.querySelector("#stat-shares");
    const statDurationVal = document.querySelector("#stat-duration");

    if (statViewsVal) {
      statViewsVal.textContent = views || "-";
      statViewsVal.closest(".media-stat-card").style.display = views ? "flex" : "none";
    }
    if (statLikesVal) {
      statLikesVal.textContent = likes || "-";
      statLikesVal.closest(".media-stat-card").style.display = likes ? "flex" : "none";
    }
    if (statSharesVal) {
      statSharesVal.textContent = shares || "-";
      statSharesVal.closest(".media-stat-card").style.display = shares ? "flex" : "none";
    }
    if (statDurationVal) {
      statDurationVal.textContent = duration || "-";
      statDurationVal.closest(".media-stat-card").style.display = duration ? "flex" : "none";
    }
  }

  setPrimaryAction(highDownload, highMeta, primaryActions.high_quality, "Best video");
  setPrimaryAction(normalDownload, normalMeta, primaryActions.normal_quality, "Smaller video");
  setPrimaryAction(audioDownload, audioMeta, primaryActions.audio_mp3, "Download MP3");
  setPrimaryAction(thumbnailDownload, thumbMeta, primaryActions.thumbnail_hd, "Preview image");
  sourceLink.href = data.source_url || "#";
  sourceLink.hidden = !data.source_url;

  renderCreator(data);
  renderOutputSummary(downloads);
  renderDownloadCards(data, downloads);
  result.hidden = false;
};

const renderOutputSummary = (downloads) => {
  const counts = downloads.reduce(
    (acc, item) => {
      acc.total += 1;
      acc[item.type || "video"] = (acc[item.type || "video"] || 0) + 1;
      return acc;
    },
    { total: 0, video: 0, audio: 0, image: 0 }
  );
  outputSummary.replaceChildren(
    ...[
      ["Total", counts.total],
      ["Video", counts.video],
      ["Audio", counts.audio],
      ["Images", counts.image]
    ].map(([label, value]) => {
      const item = document.createElement("span");
      item.className = "summary-pill";
      item.innerHTML = `<strong>${value}</strong><small>${label}</small>`;
      return item;
    })
  );
};

const renderDownloadCards = (data, downloads) => {
  const filtered = activeFilter === "all" ? downloads : downloads.filter((item) => (item.type || "video") === activeFilter);
  if (!filtered.length) {
    const empty = document.createElement("article");
    empty.className = "option empty-output";
    empty.innerHTML = `<div class="option-title">No ${activeFilter} assets found</div><p>This link did not expose that asset type. Try All or another public URL.</p>`;
    options.replaceChildren(empty);
    return;
  }
  options.replaceChildren(
    ...filtered.map((item, index) => {
      const originalIndex = downloads.indexOf(item);
      const card = document.createElement("article");
      card.className = `option ${originalIndex === 0 ? "option-best" : ""}`;

      const top = document.createElement("div");
      top.className = "option-top";

      const optionTitle = document.createElement("div");
      optionTitle.className = "option-title";
      optionTitle.textContent = `${originalIndex === 0 ? "Best - " : ""}${item.label || item.resolution || `Option ${originalIndex + 1}`}`;

      const badge = document.createElement("span");
      badge.className = `asset-badge asset-${item.type || "video"}`;
      badge.textContent = item.badge || item.type || "Asset";
      top.append(optionTitle, badge);

      const meta = document.createElement("div");
      meta.className = "meta";
      [item.type, item.resolution, item.extension?.toUpperCase(), item.size].filter(Boolean).forEach((value) => {
        const pill = document.createElement("span");
        pill.className = "pill";
        pill.textContent = value;
        meta.append(pill);
      });

      const actions = document.createElement("div");
      actions.className = "option-actions";

      const preview = document.createElement("a");
      preview.className = "preview-link";
      preview.href = assetUrl(item.preview_url || item.download_url);
      preview.textContent = "Preview";
      preview.setAttribute("role", "button");
      preview.addEventListener("click", (e) => {
        e.preventDefault();
        openPreviewModal(item);
      });

      const link = document.createElement("a");
      link.className = "download-link";
      link.href = assetUrl(item.download_url || `/api/download?id=${encodeURIComponent(item.id)}`);
      link.setAttribute("data-download-id", item.id || "");
      link.setAttribute("data-filename", brandedDownloadName(
        `${data.title || "social-download"}-${item.resolution || originalIndex + 1}`,
        item.extension
      ));
      link.textContent = "⬇ Download";

      actions.append(preview, link);
      card.append(top, meta, actions);
      return card;
    })
  );
};

const analyzeMedia = async (explicitUrl = null) => {
  const url = String(explicitUrl || (input ? input.value : "")).trim();
  if (!url) {
    setStatus("Please paste a valid video or media link first.", true);
    if (input) input.focus();
    return;
  }

  if (input) {
    input.value = url;
    if (btnClearUrl) btnClearUrl.style.display = "inline-flex";
  }

  setLoading(true, "Analyzing media link...", "Connecting to platform and extracting HD formats");
  startProcessLoader();
  if (result) result.hidden = true;
  if (creatorCard) creatorCard.hidden = true;
  setStatus("⏳ Fetching video information and download formats... Please wait.");

  if (loader) {
    loader.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  try {
    const response = await fetch(apiUrl("/api/video-info"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) {
      throw new Error(data.error || "Could not fetch media details.");
    }

    finishProcessLoader();
    renderResults(data);
    setStatus("✅ Ready! Your high-quality download options are available below.");
    if (result) {
      result.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    window.refreshSocialDownloaderAds?.();
  } catch (error) {
    console.error("Fetch error:", error);
    setStatus(`❌ ${error.message || "This public link could not be analyzed. Please check the URL and try again."}`, true);
  } finally {
    setLoading(false);
  }
};

if (form) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    event.stopPropagation();
    analyzeMedia();
    return false;
  });
}

if (input) {
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      analyzeMedia();
      return false;
    }
  });
}

filterButtons.forEach((buttonEl) => {
  buttonEl.addEventListener("click", () => {
    activeFilter = buttonEl.dataset.filter || "all";
    filterButtons.forEach((item) => item.classList.toggle("active", item === buttonEl));
    if (!result.hidden) {
      const data = {
        title: title.textContent || "social-download"
      };
      renderDownloadCards(data, currentDownloads);
    }
  });
});

bottomNavLinks.forEach((link) => {
  link.addEventListener("click", () => {
    bottomNavLinks.forEach((item) => item.classList.toggle("active", item === link));
  });
});

applyPageContent();



document.addEventListener("click", (event) => {
  const target = event.target.closest("a.primary-action, a.download-link");
  if (!target || !target.href || target.href.endsWith("#") || target.target === "_blank") return;

  const isDownload = target.classList.contains("download-link") || target.classList.contains("primary-action");
  const downloadHref = target.href;
  if (!isDownload || !downloadHref || downloadHref.includes("#")) return;

  event.preventDefault();
  setStatus("⏳ Starting download...");

  // For iOS, Android and mobile browsers, direct navigation or temporary anchor ensures browser native download manager triggers
  if (isIos() || /android/i.test(navigator.userAgent)) {
    const a = document.createElement("a");
    a.href = downloadHref;
    a.setAttribute("download", target.getAttribute("data-filename") || "download");
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 200);
  } else {
    let iframe = document.querySelector("#download-iframe");
    if (!iframe) {
      iframe = document.createElement("iframe");
      iframe.id = "download-iframe";
      iframe.style.display = "none";
      document.body.appendChild(iframe);
    }
    iframe.src = downloadHref;
  }

  setTimeout(() => {
    setStatus("✅ Download started!");
    setTimeout(() => setStatus(""), 4000);
  }, 1200);
});

// ==========================================
// PWA (PROGRESSIVE WEB APP) SERVICE WORKER & INSTALLATION
// ==========================================

let deferredPrompt = null;
const pwaInstallBtn = document.querySelector("#pwa-install-btn");
const pwaBanner = document.querySelector("#pwa-install-banner");
const pwaBannerInstallBtn = document.querySelector("#pwa-banner-install-btn");
const pwaBannerCloseBtn = document.querySelector("#pwa-banner-close-btn");
const iosDialog = document.querySelector("#ios-install-dialog");
const iosCloseBtn = document.querySelector("#ios-modal-close-btn");

// Register Service Worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        console.log("Service Worker registered with scope:", reg.scope);
      })
      .catch((err) => {
        console.warn("Service Worker registration failed:", err);
      });
  });
}

// Detect if running in standalone mode (already installed)
const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

// Detect iOS devices
const isIos = () => {
  const userAgent = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent);
};

const showInstallUI = () => {
  if (isStandalone) return;
  if (pwaInstallBtn) pwaInstallBtn.style.display = "inline-flex";

  // Show floating banner if user hasn't dismissed it in the last 7 days
  const dismissedTime = localStorage.getItem("pwa_prompt_dismissed");
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  if (pwaBanner && (!dismissedTime || Date.now() - Number(dismissedTime) > sevenDays)) {
    pwaBanner.removeAttribute("hidden");
  }
};

window.addEventListener("beforeinstallprompt", (e) => {
  // Prevent mini-infobar on mobile Chrome
  e.preventDefault();
  deferredPrompt = e;
  showInstallUI();
});

// For desktop and iOS or browsers, display the button if not installed
if (!isStandalone) {
  if (isIos() || window.innerWidth > 768) {
    showInstallUI();
  }
}

const triggerInstall = async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      console.log("User accepted the PWA install prompt");
      if (pwaInstallBtn) pwaInstallBtn.style.display = "none";
      if (pwaBanner) pwaBanner.hidden = true;
    }
    deferredPrompt = null;
  } else if (isIos()) {
    if (iosDialog) {
      if (typeof iosDialog.showModal === "function") {
        iosDialog.showModal();
      } else {
        iosDialog.setAttribute("open", "");
      }
    }
  } else {
    // If browser supports installation via menu
    setStatus("💡 Click the Install icon in your browser address bar or menu (⋮) to install.");
  }
};

if (pwaInstallBtn) {
  pwaInstallBtn.addEventListener("click", triggerInstall);
}

if (pwaBannerInstallBtn) {
  pwaBannerInstallBtn.addEventListener("click", triggerInstall);
}

if (pwaBannerCloseBtn) {
  pwaBannerCloseBtn.addEventListener("click", () => {
    if (pwaBanner) pwaBanner.hidden = true;
    localStorage.setItem("pwa_prompt_dismissed", String(Date.now()));
  });
}

if (iosCloseBtn && iosDialog) {
  iosCloseBtn.addEventListener("click", () => {
    if (typeof iosDialog.close === "function") {
      iosDialog.close();
    } else {
      iosDialog.removeAttribute("open");
    }
  });
  iosDialog.addEventListener("click", (e) => {
    if (e.target === iosDialog) {
      if (typeof iosDialog.close === "function") iosDialog.close();
      else iosDialog.removeAttribute("open");
    }
  });
}

window.addEventListener("appinstalled", () => {
  console.log("PWA installed successfully");
  if (pwaInstallBtn) pwaInstallBtn.style.display = "none";
  if (pwaBanner) pwaBanner.hidden = true;
  setStatus("🎉 Social Downloader App installed successfully!");
  setTimeout(() => setStatus(""), 4000);
});

// Auto-detect ?url= or ?link= in query parameters on page load
const initUrlFromQuery = () => {
  try {
    const params = new URLSearchParams(window.location.search);
    const queryUrl = params.get("url") || params.get("link");
    if (queryUrl && queryUrl.trim().startsWith("http")) {
      const cleanUrl = queryUrl.trim();
      if (input) {
        input.value = cleanUrl;
        if (btnClearUrl) btnClearUrl.style.display = "inline-flex";
      }
      setTimeout(() => {
        analyzeMedia(cleanUrl);
      }, 100);
    }
  } catch (err) {
    console.error("Failed to parse URL query:", err);
  }
};

initUrlFromQuery();

window.addEventListener("popstate", () => {
  const params = new URLSearchParams(window.location.search);
  const queryUrl = params.get("url") || params.get("link");
  if (queryUrl && queryUrl.trim().startsWith("http") && input && input.value !== queryUrl.trim()) {
    input.value = queryUrl.trim();
    analyzeMedia(queryUrl.trim());
  }
});

