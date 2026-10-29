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

const pageKey = document.documentElement.dataset.pageKey?.includes("__") ? "home" : document.documentElement.dataset.pageKey || "home";
const configuredApiBase = String(window.SOCIAL_DOWNLOADER_API_BASE || "").replace(/\/+$/, "");
let loaderTimer = null;
let activeFilter = "all";
let currentDownloads = [];
const brandSuffix = "Social Downloader";

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
  button.disabled = isLoading;
  input.disabled = isLoading;
  loader.hidden = !isLoading;
  if (isLoading) {
    loaderTitle.textContent = heading;
    loaderDetail.textContent = detail;
  } else {
    clearInterval(loaderTimer);
  }
};

const safeFileName = (name) =>
  String(name || "social-download")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "social-download";

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
  link.href = assetUrl(item.download_url);
  link.download = brandedDownloadName(
    `${title.textContent || "social-download"}-${item.label || fallbackLabel}`,
    item.extension
  );
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

const renderSmartPreview = (data, downloads) => {
  const previewItem = selectPreviewItem(data, downloads);

  // ALWAYS show thumbnail immediately — it loads fast from CDN
  smartPreview.hidden = true;
  smartPreview.removeAttribute("src");
  thumbnail.src = "";
  thumbnail.hidden = true;

  if (data.thumbnail) {
    thumbnail.src = data.thumbnail;
    thumbnail.hidden = false;
    thumbnail.onerror = () => { thumbnail.hidden = true; };
  }

  // Lazy-load video preview AFTER thumbnail is shown
  if (previewItem?.type === "video" && previewItem.preview_url) {
    // Small delay so thumbnail renders first, then video fades in
    setTimeout(() => {
      const videoSrc = assetUrl(previewItem.preview_url);
      smartPreview.src = videoSrc;
      smartPreview.hidden = false;
      // When video loads, show it alongside thumbnail (or replace if large)
      smartPreview.addEventListener(
        "loadedmetadata",
        () => {
          // Keep thumbnail visible, just also show video
          smartPreview.hidden = false;
        },
        { once: true }
      );
      smartPreview.addEventListener(
        "error",
        () => {
          smartPreview.hidden = true;
          thumbnail.hidden = !data.thumbnail;
        },
        { once: true }
      );
    }, 100);
  }
};

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
      preview.target = "_blank";
      preview.rel = "noreferrer";
      preview.textContent = "Preview";

      const link = document.createElement("a");
      link.className = "download-link";
      link.href = assetUrl(item.download_url || `/api/download?id=${encodeURIComponent(item.id)}`);
      link.download = brandedDownloadName(
        `${data.title || "social-download"}-${item.resolution || originalIndex + 1}`,
        item.extension
      );
      link.textContent = "Download";

      actions.append(preview, link);
      card.append(top, meta, actions);
      return card;
    })
  );
};

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const url = input.value.trim();
    if (!url) return;

    setLoading(true, "Analyzing link...", "Fetching public metadata with yt-dlp");
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
        throw new Error(data.error || "Could not fetch media details.");
      }

      finishProcessLoader();
      renderResults(data);
      setStatus("Links are ready.");
    } catch (error) {
      setStatus(error.message || "This public link could not be analyzed. Try another public media URL.", true);
    } finally {
      setLoading(false);
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
  if (target.dataset.downloading) {
    event.preventDefault();
    return;
  }
  
  target.dataset.downloading = "true";
  const originalHtml = target.innerHTML;
  if (target.classList.contains("primary-action")) {
    const span = target.querySelector("span");
    if (span) span.textContent = "Processing...";
  } else {
    target.textContent = "Processing...";
  }
  target.style.opacity = "0.7";
  target.style.pointerEvents = "none";
  setStatus("Preparing your download... This may take a minute.");
  
  const revert = () => {
    target.innerHTML = originalHtml;
    target.style.opacity = "";
    target.style.pointerEvents = "";
    delete target.dataset.downloading;
    setStatus("Download started.");
    setTimeout(() => setStatus(""), 3000);
    window.removeEventListener("blur", revert);
  };
  
  window.addEventListener("blur", revert);
  setTimeout(revert, 45000);
});
