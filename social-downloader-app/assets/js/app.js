(() => {
  // Select DOM Elements scoped to Social Downloader App
  const form = document.querySelector("#download-form");
  const input = document.querySelector("#url-input");
  const button = document.querySelector("#fetch-button");
  const btnPasteUrl = document.querySelector("#btn-paste-url");
  const btnClearUrl = document.querySelector("#btn-clear-url");
  const platformChips = document.querySelectorAll(".platform-chip");
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

  // Modal elements
  const previewModal = document.querySelector("#preview-modal");
  const previewModalBackdrop = document.querySelector("#preview-modal-backdrop");
  const previewModalClose = document.querySelector("#preview-modal-close");
  const previewModalPlayer = document.querySelector("#preview-modal-player");
  const previewModalTitle = document.querySelector("#preview-modal-title");

  // Toast element
  const toast = document.querySelector("#psd-toast");

  // Universal API Resolver
  const DEFAULT_REMOTE_API = "https://social-downloader-pro.netlify.app";
  const getApiBase = () => {
    const shell = document.querySelector(".psd-app-shell");
    if (shell && shell.dataset && shell.dataset.apiBase) {
      return String(shell.dataset.apiBase).replace(/\/+$/, "");
    }
    if (window.psdSettings && window.psdSettings.apiBase) {
      return String(window.psdSettings.apiBase).replace(/\/+$/, "");
    }
    if (window.SOCIAL_DOWNLOADER_API_BASE) {
      return String(window.SOCIAL_DOWNLOADER_API_BASE).replace(/\/+$/, "");
    }
    return DEFAULT_REMOTE_API;
  };

  const configuredApiBase = getApiBase();
  const brandSuffix = (window.psdSettings && window.psdSettings.brandSuffix) || "GetIntoDevice";

  let loaderTimer = null;
  let activeFilter = "all";
  let currentDownloads = [];

  const apiUrl = (path) => `${configuredApiBase}${path}`;

  const assetUrl = (url) => {
    if (!url || String(url).startsWith("http")) return url || "#";
    return apiUrl(url);
  };

  const showToast = (message, duration = 3500) => {
    if (!toast) return;
    toast.textContent = message;
    toast.style.display = "block";
    toast.classList.add("show");
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => {
        toast.style.display = "none";
      }, 300);
    }, duration);
  };

  const setStatus = (message, isError = false) => {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.toggle("error", isError);
  };

  // Toast and status helpers for input actions
  if (input && btnClearUrl) {
    input.addEventListener("input", () => {
      btnClearUrl.style.display = input.value.trim().length > 0 ? "inline-flex" : "none";
    });

    btnClearUrl.addEventListener("click", () => {
      input.value = "";
      btnClearUrl.style.display = "none";
      if (result) result.hidden = true;
      if (creatorCard) creatorCard.hidden = true;
      setStatus("");
      input.focus();
    });
  }

  if (btnPasteUrl && input) {
    btnPasteUrl.addEventListener("click", async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text && text.trim().startsWith("http")) {
          input.value = text.trim();
          if (btnClearUrl) btnClearUrl.style.display = "inline-flex";
          analyzeMedia();
        } else {
          showToast("Clipboard does not contain a valid URL. Please paste manually.");
          input.focus();
        }
      } catch (err) {
        // Fallback for browsers with strict clipboard permission
        input.focus();
        showToast("Please press Ctrl+V (or Cmd+V) to paste your link.");
      }
    });
  }

  // Quick platform chips shortcut
  if (platformChips && platformChips.length) {
    platformChips.forEach((chip) => {
      chip.addEventListener("click", () => {
        const platform = chip.dataset.platform;
        input.focus();
        showToast(`Paste your ${platform ? platform.toUpperCase() : "media"} link into the box!`);
      });
    });
  }

  const loaderStages = [
    { percent: 20, title: "Validating link...", detail: "Checking public source URL and platform API" },
    { percent: 45, title: "Detecting platform...", detail: "Matching source to high-speed extractors" },
    { percent: 75, title: "Extracting streams...", detail: "Collecting 1080p/720p HD MP4 and 320kbps MP3 audio" },
    { percent: 92, title: "Finalizing assets...", detail: "Generating direct high-speed CDN download links" }
  ];

  const updateLoaderProgress = (percent, heading, detail) => {
    if (loaderPercent) loaderPercent.textContent = `${percent}%`;
    if (progressBar) progressBar.style.width = `${percent}%`;
    if (loaderTitle) loaderTitle.textContent = heading;
    if (loaderDetail) loaderDetail.textContent = detail;
    if (processSteps && processSteps.length) {
      processSteps.forEach((step, index) => {
        const threshold = loaderStages[index]?.percent || 100;
        step.classList.toggle("done", percent >= threshold);
        step.classList.toggle(
          "active",
          percent < threshold && index === processSteps.length - 1
            ? false
            : percent >= (loaderStages[index - 1]?.percent || 0) && percent < threshold
        );
      });
    }
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
    }, 700);
  };

  const finishProcessLoader = () => {
    clearInterval(loaderTimer);
    updateLoaderProgress(100, "Assets ready!", "High quality MP4 & MP3 download options ready");
  };

  const setLoading = (isLoading, heading = "Analyzing link...", detail = "Preparing download options") => {
    if (button) button.disabled = isLoading;
    if (input) input.disabled = isLoading;
    if (loader) loader.hidden = !isLoading;
    if (isLoading) {
      if (loaderTitle) loaderTitle.textContent = heading;
      if (loaderDetail) loaderDetail.textContent = detail;
    } else {
      clearInterval(loaderTimer);
    }
  };

  const safeFileName = (name) =>
    String(name || "download")
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "download";

  const brandedDownloadName = (name, extension = "") => {
    const cleanExtension = String(extension || "").replace(/^\./, "").toLowerCase();
    const baseName = String(name || "download")
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
    reddit: { className: "platform-reddit", icon: "RD", label: "Reddit" },
    terabox: { className: "platform-terabox", icon: "TB", label: "TeraBox" },
    generic: { className: "platform-generic", icon: "DL", label: "Social Video" }
  };

  const setPlatformIcon = (key, label, icon) => {
    if (!platformIcon) return;
    const meta = platformMeta[key] || platformMeta.generic;
    platformIcon.className = `platform-icon ${meta.className}`;
    platformIcon.textContent = icon || meta.icon;
    platformIcon.setAttribute("aria-label", label || meta.label);
  };

  const setPrimaryAction = (link, meta, item, fallbackLabel) => {
    if (!link) return;
    link.hidden = !item;
    if (!item) {
      link.href = "#";
      if (meta) meta.textContent = fallbackLabel;
      return;
    }
    link.href = assetUrl(item.download_url);
    link.setAttribute("data-download-id", item.id || "");
    link.setAttribute(
      "data-filename",
      brandedDownloadName(`${title?.textContent || "video"}-${item.label || fallbackLabel}`, item.extension)
    );
    if (meta) {
      meta.textContent = [item.resolution, item.extension?.toUpperCase(), item.size].filter(Boolean).join(" - ") || fallbackLabel;
    }
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

  const renderSmartPreview = (data, downloads) => {
    if (!thumbnail) return;
    const previewItem = selectPreviewItem(data, downloads);

    if (smartPreview) {
      smartPreview.hidden = true;
      smartPreview.removeAttribute("src");
    }
    thumbnail.src = "";
    thumbnail.hidden = true;

    if (data.thumbnail) {
      thumbnail.src = data.thumbnail;
      thumbnail.hidden = false;
      thumbnail.onerror = () => {
        thumbnail.hidden = true;
      };
    }

    if (smartPreview && previewItem?.type === "video" && previewItem.preview_url) {
      setTimeout(() => {
        const videoSrc = assetUrl(previewItem.preview_url);
        smartPreview.src = videoSrc;
        smartPreview.hidden = false;
        smartPreview.addEventListener("loadedmetadata", () => {
          smartPreview.hidden = false;
        }, { once: true });
        smartPreview.addEventListener("error", () => {
          smartPreview.hidden = true;
          thumbnail.hidden = !data.thumbnail;
        }, { once: true });
      }, 300);
    }
  };

  const renderCreator = (data) => {
    if (!creatorCard) return;
    const creator = data.creator || {};
    const hasCreator = Boolean(creator.name || creator.handle);
    creatorCard.hidden = !hasCreator;
    if (!hasCreator) return;

    if (creatorName) creatorName.textContent = creator.name || data.uploader || "Verified Creator";
    if (creatorHandle) creatorHandle.textContent = creator.handle ? `@${creator.handle.replace(/^@/, "")}` : "";

    if (creatorAvatar) {
      if (creator.avatar) {
        creatorAvatar.innerHTML = `<img src="${creator.avatar}" alt="${creator.name || ""}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />`;
      } else {
        creatorAvatar.textContent = (creator.name || "C").slice(0, 2).toUpperCase();
      }
    }

    if (creatorLink) {
      if (creator.profile_url) {
        creatorLink.href = creator.profile_url;
        creatorLink.hidden = false;
      } else {
        creatorLink.hidden = true;
      }
    }
  };

  const renderResults = (data) => {
    const downloads = Array.isArray(data.downloads) ? data.downloads : Array.isArray(data.videos) ? data.videos : [];
    const platformKey = data.platform_key || "generic";
    const primaryActions = data.primary_actions || {};
    currentDownloads = downloads;

    const descriptionEl = document.querySelector("#description");
    if (title) {
      if (descriptionEl && data.title && (data.title.includes("\n") || data.title.length > 90)) {
        const parts = data.title.split("\n");
        title.textContent = parts[0].slice(0, 90) + (parts[0].length > 90 ? "..." : "");
        descriptionEl.textContent = data.title;
        descriptionEl.style.display = "block";
      } else {
        title.textContent = data.title || "Download Ready";
        if (descriptionEl) descriptionEl.style.display = "none";
      }
    }

    if (count) count.textContent = `${downloads.length} download option${downloads.length === 1 ? "" : "s"} ready`;
    renderSmartPreview(data, downloads);
    setPlatformIcon(platformKey, data.platform_label, data.platform_icon);

    if (resultBadges) {
      resultBadges.replaceChildren(
        ...[data.platform_label || data.platform, data.creator?.name, data.duration].filter(Boolean).map(makeBadge)
      );
    }

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

      if (statViewsVal) statViewsVal.textContent = views || "-";
      if (statLikesVal) statLikesVal.textContent = likes || "-";
      if (statSharesVal) statSharesVal.textContent = shares || "-";
      if (statDurationVal) statDurationVal.textContent = duration || "-";
    }

    setPrimaryAction(highDownload, highMeta, primaryActions.high_quality, "Best MP4 Video");
    setPrimaryAction(normalDownload, normalMeta, primaryActions.normal_quality, "Normal MP4 Video");
    setPrimaryAction(audioDownload, audioMeta, primaryActions.audio_mp3, "Audio MP3");
    setPrimaryAction(thumbnailDownload, thumbMeta, primaryActions.thumbnail_hd, "Cover Image");

    if (sourceLink) {
      sourceLink.href = data.source_url || "#";
      sourceLink.hidden = !data.source_url;
    }

    renderCreator(data);
    renderOutputSummary(downloads);
    renderDownloadCards(data, downloads);
    if (result) result.hidden = false;
  };

  const renderOutputSummary = (downloads) => {
    if (!outputSummary) return;
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
    if (!options) return;
    const filtered = activeFilter === "all" ? downloads : downloads.filter((item) => (item.type || "video") === activeFilter);
    if (!filtered.length) {
      const empty = document.createElement("article");
      empty.className = "option empty-output";
      empty.innerHTML = `<div class="option-title">No ${activeFilter} assets found</div><p>This media does not contain that asset type. Choose 'All' or another link.</p>`;
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
        optionTitle.textContent = `${originalIndex === 0 ? "Best - " : ""}${item.label || item.resolution || `Format ${originalIndex + 1}`}`;

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

        const previewBtn = document.createElement("button");
        previewBtn.type = "button";
        previewBtn.className = "preview-link";
        previewBtn.textContent = "Preview";
        previewBtn.addEventListener("click", () => {
          openPreviewModal(item, data.title);
        });

        const link = document.createElement("a");
        link.className = "download-link";
        link.href = assetUrl(item.download_url || `/api/download?id=${encodeURIComponent(item.id)}`);
        link.setAttribute(
          "data-filename",
          brandedDownloadName(`${data.title || "video"}-${item.resolution || originalIndex + 1}`, item.extension)
        );
        link.textContent = "Download";

        actions.append(previewBtn, link);
        card.append(top, meta, actions);
        return card;
      })
    );
  };

  // Preview Modal Handling
  const openPreviewModal = (item, mediaTitle) => {
    if (!previewModal || !previewModalPlayer) return;
    if (previewModalTitle) previewModalTitle.textContent = mediaTitle || item.label || "Media Preview";
    const mediaSrc = assetUrl(item.preview_url || item.download_url);

    if (item.type === "video") {
      previewModalPlayer.innerHTML = `<video src="${mediaSrc}" controls autoplay playsinline style="width:100%;max-height:70vh;border-radius:12px;background:#000;"></video>`;
    } else if (item.type === "audio") {
      previewModalPlayer.innerHTML = `<div style="padding:40px 20px;text-align:center;"><span class="material-symbols-outlined" style="font-size:64px;color:var(--theme-accent);display:block;margin-bottom:16px;">audiotrack</span><audio src="${mediaSrc}" controls autoplay style="width:100%;max-width:400px;"></audio></div>`;
    } else {
      previewModalPlayer.innerHTML = `<img src="${mediaSrc}" alt="" style="width:100%;max-height:70vh;object-fit:contain;border-radius:12px;" />`;
    }

    previewModal.hidden = false;
  };

  const closePreviewModal = () => {
    if (!previewModal) return;
    previewModal.hidden = true;
    if (previewModalPlayer) previewModalPlayer.innerHTML = "";
  };

  if (previewModalClose) previewModalClose.addEventListener("click", closePreviewModal);
  if (previewModalBackdrop) previewModalBackdrop.addEventListener("click", closePreviewModal);

  // Main Analyze Function
  const analyzeMedia = async () => {
    const url = input.value.trim();
    if (!url) return;

    if (btnClearUrl) btnClearUrl.style.display = "inline-flex";
    setLoading(true, "Connecting to servers...", "Extracting high definition formats & streams");
    startProcessLoader();
    if (result) result.hidden = true;
    if (creatorCard) creatorCard.hidden = true;
    setStatus("");

    try {
      const response = await fetch(apiUrl("/api/video-info"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) {
        throw new Error(data.error || "Could not fetch media details. Please make sure the link is public.");
      }

      finishProcessLoader();
      renderResults(data);
      setStatus(" Download links ready below!");
      showToast("Media extracted successfully!");
    } catch (error) {
      setStatus(error.message || "Failed to analyze link. Make sure it is public and accessible.", true);
      showToast(error.message || "Failed to analyze media link", 4000);
    } finally {
      setLoading(false);
    }
  };

  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      analyzeMedia();
    });
  }

  // Filter Buttons
  filterButtons.forEach((buttonEl) => {
    buttonEl.addEventListener("click", () => {
      activeFilter = buttonEl.dataset.filter || "all";
      filterButtons.forEach((item) => item.classList.toggle("active", item === buttonEl));
      if (!result.hidden) {
        const data = { title: title?.textContent || "video" };
        renderDownloadCards(data, currentDownloads);
      }
    });
  });

  // Direct Click Download Handling (Works 100% on iOS, Android, and PC)
  document.addEventListener("click", (event) => {
    const target = event.target.closest("a.primary-action, a.download-link");
    if (!target || !target.href || target.href.endsWith("#")) return;

    const downloadHref = target.href;
    event.preventDefault();

    showToast("Starting download! Please check your downloads folder.");
    setStatus("⏳ Processing download direct from CDN...");

    // Create a temporary anchor to trigger native browser download
    const filename = target.getAttribute("data-filename") || "download.mp4";
    const a = document.createElement("a");
    a.href = downloadHref;
    a.setAttribute("download", filename);
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      setStatus("Download initiated.");
    }, 1200);
  });
})();
