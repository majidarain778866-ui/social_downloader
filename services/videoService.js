import { execFile, execSync } from "node:child_process";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

import { join } from "node:path";
import { existsSync, writeFileSync, copyFileSync, chmodSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { getFfmpegEnv } from "./localFfmpegPath.js";

export const prepareServerlessBinary = (srcPath, name) => {
  if (!srcPath || !existsSync(srcPath)) return srcPath;
  
  const isServerless = Boolean(process.env.NETLIFY || process.env.VERCEL || process.env.NOW_BUILDER || process.env.LAMBDA_TASK_ROOT);
  if (!isServerless) return srcPath;

  const destPath = join(tmpdir(), name);
  try {
    if (!existsSync(destPath)) {
      copyFileSync(srcPath, destPath);
    }
    chmodSync(destPath, 0o755);
    console.log(`[Serverless] Prepared binary ${name} in /tmp: ${destPath}`);
    return destPath;
  } catch (err) {
    console.error(`[Serverless] Failed to prepare binary ${name}:`, err);
    return srcPath;
  }
};

const currentDir = fileURLToPath(new URL(".", import.meta.url));
const bundledPythonPath = [
  join(currentDir, "..", "netlify", "functions", "python"),
  join(process.cwd(), "netlify", "functions", "python")
].find(p => existsSync(p));

if (bundledPythonPath) {
  process.env.PYTHONPATH = [process.env.PYTHONPATH, bundledPythonPath].filter(Boolean).join(process.platform === "win32" ? ";" : ":");
}

export let pythonCmd = "python3";
export let ytDlpArgs = ["-m", "yt_dlp"];

export const isServerless = Boolean(process.env.NETLIFY || process.env.VERCEL || process.env.NOW_BUILDER || process.env.VERCEL_ENV || process.env.LAMBDA_TASK_ROOT);
export const isVercel = Boolean(process.env.VERCEL || process.env.NOW_BUILDER || process.env.VERCEL_ENV);
let hasPythonYtDlp = false;

// Respect explicit PYTHON env var (set in Dockerfile)
const envPython = process.env.PYTHON;

if (!isServerless) {
  // Try explicit PYTHON env var first
  if (envPython) {
    try {
      execSync(`${envPython} -m yt_dlp --version`, { stdio: "ignore" });
      pythonCmd = envPython;
      ytDlpArgs = ["-m", "yt_dlp"];
      hasPythonYtDlp = true;
    } catch {
      // env python not available or no yt_dlp
    }
  }

  if (!hasPythonYtDlp) {
    try {
      execSync("python3 -m yt_dlp --version", { stdio: "ignore" });
      pythonCmd = "python3";
      ytDlpArgs = ["-m", "yt_dlp"];
      hasPythonYtDlp = true;
    } catch {
      try {
        execSync("python -m yt_dlp --version", { stdio: "ignore" });
        pythonCmd = "python";
        ytDlpArgs = ["-m", "yt_dlp"];
        hasPythonYtDlp = true;
      } catch {
        // python module not available
      }
    }
  }
}

if (!hasPythonYtDlp) {
  const currentDir2 = fileURLToPath(new URL(".", import.meta.url));
  const binName = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
  const binPaths = [
    join(currentDir2, "..", "netlify", "functions", "bin", binName),
    join(process.cwd(), "netlify", "functions", "bin", binName),
    join(process.cwd(), "bin", binName),
    join(currentDir2, "bin", binName)
  ];

  const binPath = binPaths.find(p => existsSync(p));
  if (binPath) {
    pythonCmd = prepareServerlessBinary(binPath, binName);
    ytDlpArgs = [];
    hasPythonYtDlp = true;
  } else {
    pythonCmd = envPython || "yt-dlp";
    ytDlpArgs = [];
  }
}

console.log(`[videoService] Using: ${pythonCmd} ${ytDlpArgs.join(" ")}`);

const ALGORITHM = "aes-256-cbc";
const SECRET_KEY = scryptSync(process.env.DOWNLOAD_SECRET || "social-downloader-secure-key-2026", "salt-123", 32);

const base64urlToBase64 = (str) => {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return base64;
};

const base64ToBase64url = (str) => {
  return str.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
};

export const encryptData = (data) => {
  try {
    const iv = randomBytes(16);
    const cipher = createCipheriv(ALGORITHM, SECRET_KEY, iv);
    let encrypted = cipher.update(JSON.stringify(data), "utf8", "base64");
    encrypted += cipher.final("base64");
    const ivStr = base64ToBase64url(iv.toString("base64"));
    const encStr = base64ToBase64url(encrypted);
    return `${ivStr}.${encStr}`;
  } catch (e) {
    console.error("Encryption error:", e);
    return null;
  }
};

export const decryptData = (token) => {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const iv = Buffer.from(base64urlToBase64(parts[0]), "base64");
    const encrypted = Buffer.from(base64urlToBase64(parts[1]), "base64");
    const decipher = createDecipheriv(ALGORITHM, SECRET_KEY, iv);
    let decrypted = decipher.update(encrypted, undefined, "utf8");
    decrypted += decipher.final("utf8");
    return JSON.parse(decrypted);
  } catch (e) {
    console.error("Decryption error:", e);
    return null;
  }
};

const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_OPTIONS_PER_ENTRY = 24;
const BRAND_SUFFIX = "Social Downloader";
const downloadCache = new Map();
const videoInfoCache = new Map();
const INFO_CACHE_TTL_MS = 10 * 60 * 1000; // Cache metadata for 10 minutes

const PLATFORM_DEFINITIONS = [
  {
    key: "youtube",
    label: "YouTube",
    icon: "YT",
    match: ["youtube", "youtu.be", "youtube.com", "youtube shorts", "shorts"]
  },
  {
    key: "tiktok",
    label: "TikTok",
    icon: "TT",
    match: ["tiktok", "tiktok.com"]
  },
  {
    key: "instagram",
    label: "Instagram",
    icon: "IG",
    match: ["instagram", "instagr.am", "reels"]
  },
  {
    key: "facebook",
    label: "Facebook",
    icon: "FB",
    match: ["facebook", "fb.watch", "fb.com", "facebook.com"]
  },
  {
    key: "twitter",
    label: "X / Twitter",
    icon: "X",
    match: ["twitter", "x.com", "tweet"]
  },
  {
    key: "pinterest",
    label: "Pinterest",
    icon: "PI",
    match: ["pinterest", "pin.it", "pinterest.com"]
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    icon: "LN",
    match: ["linkedin", "linkedin.com"]
  },
  {
    key: "threads",
    label: "Threads",
    icon: "TH",
    match: ["threads.net", "threads"]
  },
  {
    key: "vimeo",
    label: "Vimeo",
    icon: "VI",
    match: ["vimeo", "vimeo.com"]
  },
  {
    key: "snapchat",
    label: "Snapchat",
    icon: "SC",
    match: ["snapchat", "snapchat.com"]
  },
  {
    key: "rumble",
    label: "Rumble",
    icon: "RM",
    match: ["rumble", "rumble.com"]
  },
  {
    key: "tumblr",
    label: "Tumblr",
    icon: "TM",
    match: ["tumblr", "tumblr.com"]
  },
  {
    key: "streamable",
    label: "Streamable",
    icon: "ST",
    match: ["streamable", "streamable.com"]
  },
  {
    key: "bitchute",
    label: "BitChute",
    icon: "BC",
    match: ["bitchute", "bitchute.com"]
  },
  {
    key: "bandcamp",
    label: "Bandcamp",
    icon: "BCM",
    match: ["bandcamp", "bandcamp.com"]
  },
  {
    key: "soundcloud",
    label: "SoundCloud",
    icon: "SC",
    match: ["soundcloud", "soundcloud.com"]
  },
  {
    key: "ifunny",
    label: "iFunny",
    icon: "IF",
    match: ["ifunny", "ifunny.co"]
  },
  {
    key: "douyin",
    label: "Douyin",
    icon: "DY",
    match: ["douyin", "douyin.com"]
  },
  {
    key: "bluesky",
    label: "Bluesky",
    icon: "BS",
    match: ["bsky.app", "bluesky"]
  },
  {
    key: "kwai",
    label: "Kwai",
    icon: "KW",
    match: ["kwai", "kwai.com"]
  },
  {
    key: "telegram",
    label: "Telegram",
    icon: "TG",
    match: ["telegram", "t.me"]
  },
  {
    key: "canva",
    label: "Canva",
    icon: "CV",
    match: ["canva", "canva.com"]
  },
  {
    key: "reddit",
    label: "Reddit",
    icon: "RD",
    match: ["reddit", "reddit.com", "v.redd.it"]
  },
  {
    key: "likee",
    label: "Likee",
    icon: "LK",
    match: ["likee", "likee.video"]
  },
  {
    key: "terabox",
    label: "TeraBox",
    icon: "TB",
    match: ["terabox", "terabox.com"]
  },
  {
    key: "mixcloud",
    label: "MixCloud",
    icon: "MC",
    match: ["mixcloud", "mixcloud.com"]
  },
  {
    key: "lemon8",
    label: "Lemon8",
    icon: "L8",
    match: ["lemon8", "lemon8-app.com"]
  },
  {
    key: "vk",
    label: "VK",
    icon: "VK",
    match: ["vk.com", "vkontakte"]
  },
  {
    key: "dailymotion",
    label: "Dailymotion",
    icon: "DM",
    match: ["dailymotion", "dai.ly"]
  },
  {
    key: "mx-takatak",
    label: "MX TakaTak",
    icon: "MX",
    match: ["takatak", "mxtakatak"]
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    icon: "WDP",
    match: ["whatsapp", "whatsapp.com"]
  },
  {
    key: "rednote",
    label: "RedNote",
    icon: "RN",
    match: ["rednote", "xiaohongshu", "xhslink"]
  },
  {
    key: "metaai",
    label: "Meta AI",
    icon: "MAI",
    match: ["meta.ai", "metaai"]
  },
  {
    key: "kick",
    label: "Kick",
    icon: "KK",
    match: ["kick.com", "kick"]
  },
  {
    key: "9gag",
    label: "9GAG",
    icon: "9G",
    match: ["9gag", "9gag.com"]
  },
  {
    key: "twitch",
    label: "Twitch",
    icon: "TW",
    match: ["twitch", "twitch.tv"]
  },
  {
    key: "loom",
    label: "Loom",
    icon: "LM",
    match: ["loom.com", "loom"]
  },
  {
    key: "sharechat",
    label: "ShareChat",
    icon: "SC",
    match: ["sharechat", "sharechat.com"]
  }
];

const isHttpUrl = (value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const pick = (source, keys) => {
  for (const key of keys) {
    if (source?.[key] !== undefined && source[key] !== null && source[key] !== "") {
      return source[key];
    }
  }
  return undefined;
};

const numberLabel = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return "";
  if (number >= 1000000000) return `${(number / 1000000000).toFixed(1)}B`;
  if (number >= 1000000) return `${(number / 1000000).toFixed(1)}M`;
  if (number >= 1000) return `${(number / 1000).toFixed(1)}K`;
  return String(number);
};

const detectPlatform = (data, entries, sourceUrl) => {
  const haystack = [
    data.extractor,
    data.extractor_key,
    data.webpage_url_domain,
    data.webpage_url,
    sourceUrl,
    ...entries.flatMap((entry) => [entry.extractor, entry.extractor_key, entry.webpage_url_domain, entry.webpage_url])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const platform = PLATFORM_DEFINITIONS.find((item) => item.match.some((match) => haystack.includes(match)));
  return platform || { key: "generic", label: String(pick(data, ["extractor", "webpage_url_domain"]) || "Social video"), icon: "SD" };
};

const buildCreator = (data, entries, platformKey) => {
  const first = entries[0] || {};
  const avatar =
    String(
      pick(data, ["uploader_avatar", "channel_avatar", "creator_avatar", "avatar_url"]) ||
        pick(first, ["uploader_avatar", "channel_avatar", "creator_avatar", "avatar_url", "profile_image_url"]) ||
        ""
    );
  let profileUrl =
    String(
      pick(data, ["uploader_url", "channel_url", "creator_url"]) ||
        pick(first, ["uploader_url", "channel_url", "creator_url"]) ||
        ""
    );

  // Reconstruct profile URL if missing
  if (!profileUrl || !isHttpUrl(profileUrl)) {
    const handle = String(
      pick(data, ["uploader_id", "channel_id", "creator_id", "uploader", "channel", "creator"]) ||
      pick(first, ["uploader_id", "channel_id", "creator_id", "uploader", "channel", "creator"]) ||
      ""
    ).trim();

    if (handle) {
      const cleanHandle = handle.replace(/^@/, "");
      if (platformKey === "tiktok") {
        profileUrl = `https://www.tiktok.com/@${cleanHandle}`;
      } else if (platformKey === "instagram") {
        profileUrl = `https://www.instagram.com/${cleanHandle}`;
      } else if (platformKey === "twitter" || platformKey === "x") {
        profileUrl = `https://x.com/${cleanHandle}`;
      } else if (platformKey === "youtube") {
        profileUrl = `https://www.youtube.com/${handle.startsWith("@") ? handle : `@${handle}`}`;
      } else if (platformKey === "facebook") {
        profileUrl = `https://www.facebook.com/${cleanHandle}`;
      } else if (platformKey === "pinterest") {
        profileUrl = `https://www.pinterest.com/${cleanHandle}`;
      }
    }
  }

  const followers =
    numberLabel(pick(data, ["channel_follower_count", "uploader_follower_count", "followers"]) || pick(first, ["channel_follower_count", "uploader_follower_count", "followers"]));

  return {
    name: String(pick(data, ["uploader", "channel", "creator"]) || pick(first, ["uploader", "channel", "creator"]) || ""),
    handle: String(pick(data, ["uploader_id", "channel_id", "creator_id"]) || pick(first, ["uploader_id", "channel_id", "creator_id"]) || ""),
    avatar: isHttpUrl(avatar) ? avatar : "",
    profile_url: isHttpUrl(profileUrl) ? profileUrl : "",
    followers,
    video_count: numberLabel(pick(data, ["playlist_count", "n_entries"]) || pick(first, ["playlist_count", "n_entries"])),
    verified: Boolean(pick(data, ["uploader_verified", "channel_is_verified"]) || pick(first, ["uploader_verified", "channel_is_verified"]))
  };
};

const cleanupCache = () => {
  const now = Date.now();
  for (const [id, item] of downloadCache) {
    if (item.expiresAt <= now) downloadCache.delete(id);
  }
};

const formatBytes = (value) => {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size >= 10 || unit === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`;
};

const formatDuration = (seconds) => {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return "";
  const mins = Math.floor(value / 60);
  const secs = Math.floor(value % 60);
  const hours = Math.floor(mins / 60);
  const restMins = mins % 60;
  if (hours) return `${hours}:${String(restMins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${restMins}:${String(secs).padStart(2, "0")}`;
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

const brandedFileName = (name, extension) => {
  const cleanExtension = String(extension || "mp4").replace(/^\./, "") || "mp4";
  let baseName = String(name || "social-download")
    .replace(new RegExp(`\\s*-\\s*${BRAND_SUFFIX.replace(".", "\\.")}\\s*$`, "i"), "")
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .trim();
  if (baseName.length > 50) baseName = baseName.slice(0, 50).trim();
  return safeFileName(`${baseName} - ${BRAND_SUFFIX}.${cleanExtension}`);
};

const cookieHeaderFromYtDlp = (cookies) => {
  if (!cookies) return "";
  return String(cookies)
    .split(";")
    .map((part) => part.trim())
    .filter((part) => {
      const lower = part.toLowerCase();
      return part.includes("=") && !lower.startsWith("domain=") && !lower.startsWith("path=") && !lower.startsWith("expires=");
    })
    .join("; ");
};

const getHeaders = (format, entry) => {
  const headers = {
    ...(entry.http_headers || {}),
    ...(format.http_headers || {})
  };
  // remove conflicting headers
  delete headers["Host"];
  const cookies = cookieHeaderFromYtDlp(format.cookies || entry.cookies);
  if (cookies) headers.Cookie = cookies;
  if (!headers["User-Agent"]) {
    headers["User-Agent"] =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36";
  }
  if (!headers.Accept) headers.Accept = "*/*";
  return headers;
};

const mediaTypeFor = (format) => {
  const ext = String(format.ext || "").toLowerCase();
  if (["jpg", "jpeg", "png", "webp", "gif", "heic", "avif"].includes(ext)) return "image";
  if (format.vcodec === "none" && format.acodec && format.acodec !== "none") return "audio";
  return "video";
};

const optionLabel = (format, entryIndex, totalEntries = 1) => {
  const type = mediaTypeFor(format);
  const parts = [];
  if (entryIndex > 0 && totalEntries > 1) parts.push(`Item ${entryIndex + 1}`);
  
  if (type === "image") {
    const rawExt = String(format.ext || "").toLowerCase();
    const imgExt = rawExt === "png" ? "PNG" : "JPG";
    const resStr = format.width && format.height ? `${format.width}x${format.height}` : "HD";
    parts.push(`Best HD Image (${resStr} ${imgExt})`);
    return parts.join(" ");
  }

  if (type === "audio") {
    return "High Quality Audio (MP3 320kbps)";
  }

  // Video format (MP4)
  let height = Number(format.height || 0);
  if (!height && format.resolution && /^\d+x(\d+)$/i.test(format.resolution)) {
    height = Number(format.resolution.match(/^\d+x(\d+)$/i)[1]);
  }
  if (!height && (format.format_id === "hd" || format.format_note === "hd" || /hd/i.test(String(format.format_id)))) {
    height = 720;
  }
  if (!height && (format.format_id === "sd" || format.format_note === "sd" || /sd/i.test(String(format.format_id)))) {
    height = 360;
  }

  let resLabel = "";
  if (height >= 2160) resLabel = "4K Ultra HD MP4 Video (2160p)";
  else if (height >= 1440) resLabel = "2K Quad HD MP4 Video (1440p)";
  else if (height >= 1080) resLabel = "1080p Full HD MP4 Video";
  else if (height >= 720) resLabel = "720p HD MP4 Video";
  else if (height >= 480) resLabel = "480p SD MP4 Video";
  else if (height > 0) resLabel = `${height}p SD MP4 Video`;
  else resLabel = format.resolution ? `${format.resolution} MP4 Video` : "Best HD MP4 Video";

  parts.push(resLabel);
  if (format.format_note && !String(format.format_note).includes("unknown") && !/^\d+p$/i.test(String(format.format_note))) {
    parts.push(format.format_note);
  }
  return parts.join(" ");
};

const isWatermarked = (format) =>
  /watermark|watermarked/i.test(
    [format.format_id, format.format_note, format.format, format.url].filter(Boolean).join(" ")
  );

const qualityScore = (format) => {
  const type = mediaTypeFor(format);
  const height = Number(format.height || 0);
  const width = Number(format.width || 0);
  const isMp4 = String(format.ext || "").toLowerCase() === "mp4";
  const mp4Bonus = isMp4 ? 50000 : 0;
  const audioBonus = hasAudio(format) ? 10000 : 0;
  return height * 1000000 + width * 1000 + mp4Bonus + audioBonus + Number(format.tbr || 0) + Number(format.filesize || format.filesize_approx || 0) / 1000000;
};

const hasAudio = (format) => Boolean(format.acodec && format.acodec !== "none");
const hasVideo = (format) => Boolean(format.vcodec && format.vcodec !== "none");

const cacheDownload = ({ format, entry = {}, title, entryIndex = 0 }) => {
  const type = mediaTypeFor(format);
  const sourceUrl = entry.webpage_url || entry.original_url || entry.url;
  const shouldMergeAudio = type === "video" && hasVideo(format) && !hasAudio(format) && format.format_id && sourceUrl;
  const mergeAudioSelector = "ba[ext=m4a]/ba[ext=mp4]/ba";
  
  const isVideoWebm = type === "video" && String(format.ext || "").toLowerCase() === "webm";
  const isDirectProtocol = !format.protocol || /^(https?)$/i.test(format.protocol);
  // We need server processing (yt-dlp) if we must merge audio/video, remux webm video to mp4, if we extract audio to MP3, or if it is not a direct protocol (e.g. m3u8, dash)
  const requiresYtDlp = Boolean(shouldMergeAudio || isVideoWebm || (type === "audio" && sourceUrl) || !isDirectProtocol);
  
  const rawExt = String(format.ext || "").toLowerCase();
  const ext = type === "video" ? "mp4" : type === "audio" ? "mp3" : (rawExt === "png" ? "png" : "jpg");
  const filename = brandedFileName(`${title}${entryIndex > 0 ? `-${entryIndex + 1}` : ""}`, ext);
  const strategy = entry._successful_strategy || { useCookies: true, useImpersonate: true };

  const payload = {
    url: format.url || sourceUrl || "",
    sourceUrl,
    requiresMux: Boolean(format.requiresMux),
    videoUrl: format.videoUrl || "",
    audioUrl: format.audioUrl || "",
    formatId: format.format_id,
    formatSelector: shouldMergeAudio
      ? mergeAudioSelector.split('/').map(a => `${format.format_id}+${a}`).join('/') + `/${format.format_id}+bestaudio/${format.format_id}`
      : (type === "audio" ? "bestaudio/best" : ""),
    headers: getHeaders(format, entry),
    filename,
    ext,
    type,
    requiresYtDlp,
    useCookies: strategy.useCookies,
    useImpersonate: strategy.useImpersonate
  };

  return encryptData(payload);
};

const cacheMp3Download = ({ sourceUrl, title, strategy }) => {
  const filename = brandedFileName(title, "mp3");

  const payload = {
    url: "",
    sourceUrl,
    formatId: "bestaudio",
    formatSelector: "bestaudio/best",
    filename,
    ext: "mp3",
    type: "audio",
    requiresYtDlp: true,
    useCookies: strategy?.useCookies !== false,
    useImpersonate: strategy?.useImpersonate !== false
  };
  const id = encryptData(payload);

  return {
    id,
    label: "High Quality MP3 Audio",
    resolution: "320kbps MP3",
    type: "audio",
    badge: "Audio MP3",
    extension: "mp3",
    size: "",
    download_url: `/api/download?id=${encodeURIComponent(id)}`,
    preview_url: ""
  };
};

const cacheMergedDownload = ({ sourceUrl, title, quality = "high", strategy }) => {
  const suffix = quality === "normal" ? "normal" : "high";
  const filename = brandedFileName(`${title}-${suffix}`, "mp4");
  const formatSelector =
    quality === "normal"
      ? "bv*[height<=720][ext=mp4]+ba[ext=m4a]/bv*[height<=720]+ba/b[height<=720]/best[height<=720]/best"
      : "bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/best";

  const payload = {
    url: "",
    sourceUrl,
    formatSelector,
    filename,
    ext: "mp4",
    type: "video",
    requiresYtDlp: true,
    useCookies: strategy?.useCookies !== false,
    useImpersonate: strategy?.useImpersonate !== false
  };
  const id = encryptData(payload);

  return {
    id,
    label: quality === "normal" ? "Standard MP4 Video (720p)" : "Best Quality MP4 Video (HD/4K)",
    resolution: quality === "normal" ? "720p HD MP4" : "Best HD/4K MP4",
    type: "video",
    has_audio: true,
    has_video: true,
    badge: "Audio Included",
    extension: "mp4",
    format_id: formatSelector,
    size: "",
    download_url: `/api/download?id=${encodeURIComponent(id)}`,
    preview_url: `/api/download?id=${encodeURIComponent(id)}&preview=1`
  };
};

const normalizeFormat = (format, entry, title, entryIndex, optionIndex, totalEntries = 1) => {
  if (!isHttpUrl(format.url)) return null;
  const type = mediaTypeFor(format);
  const id = cacheDownload({ format, entry, title, entryIndex });
  const mergedAudio = Boolean(type === "video" && hasVideo(format) && !hasAudio(format) && format.format_id);
  const isVideoWebm = type === "video" && String(format.ext || "").toLowerCase() === "webm";
  
  const sourceUrl = entry.webpage_url || entry.original_url || entry.url;
  const isDirectProtocol = !format.protocol || /^(https?)$/i.test(format.protocol);
  const requiresYtDlp = mergedAudio || isVideoWebm || (type === "audio" && sourceUrl) || !isDirectProtocol;

  const height = Number(format.height || 0);
  let resolution = "";
  if (height >= 2160) resolution = "2160p (4K Ultra HD)";
  else if (height >= 1440) resolution = "1440p (2K Quad HD)";
  else if (height >= 1080) resolution = "1080p (Full HD)";
  else if (height >= 720) resolution = "720p (HD)";
  else if (height >= 480) resolution = "480p (SD)";
  else if (height > 0) resolution = `${height}p`;
  else resolution = format.resolution || (format.width && format.height ? `${format.width}x${format.height}` : type === "audio" ? "Audio only" : type === "image" ? "Best HD Image" : "Original MP4");

  const rawExt = String(format.ext || "").toLowerCase();
  const ext = type === "video" ? "mp4" : type === "audio" ? "mp3" : (rawExt === "png" ? "png" : "jpg");

  return {
    id,
    label: optionLabel(format, entryIndex, totalEntries) || `Option ${optionIndex + 1}`,
    resolution,
    type,
    has_audio: mergedAudio || hasAudio(format) || isVideoWebm || type === "video",
    has_video: hasVideo(format) || type === "video",
    badge: isWatermarked(format)
      ? "Watermarked"
      : type === "image"
        ? (totalEntries > 1 ? `Carousel Photo ${entryIndex + 1}` : "Best HD Image")
        : type === "audio"
          ? "Audio MP3"
          : "Best MP4 Video",
    is_watermarked: isWatermarked(format),
    extension: ext,
    format_id: format.format_id || "",
    size: mergedAudio || isVideoWebm ? "" : formatBytes(format.filesize || format.filesize_approx),
    download_url: `/api/download?id=${encodeURIComponent(id)}`,
    preview_url: `/api/download?id=${encodeURIComponent(id)}&preview=1`
  };
};

const normalizeThumbnail = (thumbnail, title) => {
  if (!isHttpUrl(thumbnail)) return null;
  const isPng = /\.png$/i.test(new URL(thumbnail).pathname);
  const imgExt = isPng ? "png" : "jpg";
  const id = cacheDownload({
    format: {
      url: thumbnail,
      ext: imgExt
    },
    title: `${title}-thumbnail`
  });

  return {
    id,
    label: `Best HD Cover / Thumbnail (${imgExt.toUpperCase()})`,
    resolution: "Best HD Image",
    type: "image",
    badge: "Best HD Image",
    extension: imgExt,
    size: "",
    download_url: `/api/download?id=${encodeURIComponent(id)}`,
    preview_url: `/api/download?id=${encodeURIComponent(id)}&preview=1`
  };
};

const collectFormats = (entry) => {
  const formats = [];
  if (Array.isArray(entry.requested_downloads)) formats.push(...entry.requested_downloads);
  if (entry.url) formats.push(entry);
  if (entry.display_url && entry.display_url !== entry.url) {
    formats.push({ url: entry.display_url, ext: "jpg", width: entry.width, height: entry.height });
  }
  if (Array.isArray(entry.formats)) formats.push(...entry.formats);

  // If entry has thumbnails array and no direct formats, include highest res thumbnail
  if (Array.isArray(entry.thumbnails) && entry.thumbnails.length > 0) {
    const bestThumb = [...entry.thumbnails].sort((a, b) => (b.width || 0) - (a.width || 0))[0];
    if (bestThumb && bestThumb.url && isHttpUrl(bestThumb.url)) {
      formats.push({ url: bestThumb.url, ext: "jpg", width: bestThumb.width, height: bestThumb.height });
    }
  }

  // 1. Sort candidates by quality score (highest resolution first, preferring MP4)
  const sorted = formats
    .filter((format) => format && isHttpUrl(format.url))
    .filter((format) => !String(format.protocol || "").includes("m3u8"))
    .filter((format) => {
      const ext = String(format.ext || "").toLowerCase();
      if (["mhtml", "json", "srv1", "srv2", "srv3", "ttml", "vtt"].includes(ext)) return false;
      return mediaTypeFor(format) !== "video" || hasVideo(format) || hasAudio(format);
    })
    .sort((a, b) => {
      const aWatermark = isWatermarked(a) ? 1 : 0;
      const bWatermark = isWatermarked(b) ? 1 : 0;
      if (aWatermark !== bWatermark) return aWatermark - bWatermark;
      return qualityScore(b) - qualityScore(a);
    });

  // 2. Deduplicate based on type and height/resolution tier
  const seen = new Set();
  const deduped = [];
  for (const format of sorted) {
    const type = mediaTypeFor(format);
    const height = format.height || 0;
    const key = height ? `${type}|${height}p` : format.resolution || `${type}|${format.width}x${format.height}` || format.format_note || format.format_id;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(format);
    }
  }

  return deduped.slice(0, MAX_OPTIONS_PER_ENTRY);
};

const buildPrimaryActions = (downloads, { sourceUrl, title, strategy }) => {
  const isNetlifyRuntime = Boolean(process.env.NETLIFY);
  const videos = downloads.filter((item) => item.type === "video");
  const completeVideos = videos.filter((item) => item.has_audio !== false);
  const images = downloads.filter((item) => item.type === "image");

  const maxResolutionSide = (item) => {
    const values = String(item?.resolution || "")
      .match(/\d+/g)
      ?.map(Number)
      .filter(Number.isFinite);
    return values?.length ? Math.max(...values) : Number.POSITIVE_INFINITY;
  };

  const pickPlayableVideo = (items, { mp4Only = false, maxHeight = Number.POSITIVE_INFINITY } = {}) => {
    const candidates = items.filter((item) => {
      if (item.has_audio === false) return false;
      if (mp4Only && item.extension !== "mp4") return false;
      return maxResolutionSide(item) <= maxHeight;
    });
    return candidates.sort((a, b) => {
      const heightDiff = maxResolutionSide(b) - maxResolutionSide(a);
      if (heightDiff !== 0) return heightDiff;
      if (a.extension !== b.extension) return a.extension === "mp4" ? -1 : 1;
      return Number(b.size || 0) - Number(a.size || 0);
    })[0] || null;
  };

  const directHigh =
    pickPlayableVideo(completeVideos, { mp4Only: true, maxHeight: isNetlifyRuntime ? 1080 : Number.POSITIVE_INFINITY }) ||
    pickPlayableVideo(completeVideos, { mp4Only: true }) ||
    pickPlayableVideo(completeVideos) ||
    pickPlayableVideo(videos, { mp4Only: true }) ||
    pickPlayableVideo(videos);

  const directNormal =
    pickPlayableVideo(completeVideos.filter((item) => item !== directHigh), { mp4Only: true, maxHeight: 720 }) ||
    completeVideos.find((item) => item !== directHigh && maxResolutionSide(item) <= 720) ||
    completeVideos.find((item) => item !== directHigh && /360|480|540|normal|medium/i.test([item.label, item.resolution].join(" "))) ||
    pickPlayableVideo(videos.filter((item) => item !== directHigh), { mp4Only: true, maxHeight: 720 }) ||
    pickPlayableVideo(videos.filter((item) => item !== directHigh), { maxHeight: 720 });

  const directHighRes = directHigh ? maxResolutionSide(directHigh) : 0;
  const needMergedHigh = (!directHigh || directHighRes < 720) && Boolean(sourceUrl);
  const mergedHigh = sourceUrl ? cacheMergedDownload({ sourceUrl, title, quality: "high", strategy }) : null;
  const mergedNormal = sourceUrl ? cacheMergedDownload({ sourceUrl, title, quality: "normal", strategy }) : null;

  const highQuality =
    (needMergedHigh && mergedHigh)
      ? mergedHigh
      : (directHigh || mergedHigh || downloads.find((item) => item.type !== "audio") || downloads[0] || null);

  const normalQuality =
    directNormal ||
    mergedNormal ||
    directHigh ||
    highQuality;

  const audios = downloads.filter((item) => item.type === "audio");
  const audioMp3 = audios.find((item) => item.extension === "mp3") || audios[0] || null;
  const thumbnailHd = images.find((item) => /thumbnail|preview|cover|photo/i.test([item.label, item.badge].join(" "))) || images[0] || null;

  return {
    high_quality: highQuality,
    normal_quality: normalQuality,
    audio_mp3: audioMp3,
    thumbnail_hd: thumbnailHd
  };
};

const cleanInfoCache = () => {
  const now = Date.now();
  for (const [key, item] of videoInfoCache) {
    if (item.expiresAt <= now) videoInfoCache.delete(key);
  }
};

let cachedCookiesPath = null;

export const formatNetscapeCookies = (rawStr) => {
  if (!rawStr) return "";
  let str = String(rawStr).replace(/\\n/g, "\n").replace(/\\t/g, "\t");

  const lines = [
    "# Netscape HTTP Cookie File",
    "# http://curl.haxx.se/rfc/cookie_spec.html",
    "# This is a generated file! Do not edit.",
    ""
  ];

  const cookieRegex = /(\.?youtube\.com|\.?google\.com|\.tiktok\.com|\.instagram\.com)\s+(TRUE|FALSE)\s+(\/.*?)\s+(TRUE|FALSE)\s+(\d+)\s+([^\s]+)\s+([^\s]+)/gi;
  let match;
  let foundCount = 0;
  while ((match = cookieRegex.exec(str)) !== null) {
    foundCount++;
    const [, domain, flag, path, secure, expiration, name, value] = match;
    lines.push(`${domain}\t${flag.toUpperCase()}\t${path}\t${secure.toUpperCase()}\t${expiration}\t${name}\t${value}`);
  }

  if (foundCount > 0) {
    return lines.join("\n");
  }

  if (!str.startsWith("# Netscape")) {
    str = `# Netscape HTTP Cookie File\n# This is a generated file! Do not edit.\n${str}`;
  }
  return str;
};

export const getOrCreateCookiesPath = () => {
  if (cachedCookiesPath && existsSync(cachedCookiesPath)) {
    return cachedCookiesPath;
  }

  const envCookies =
    process.env.COOKIES_CONTENT ||
    process.env.YTDLP_COOKIES ||
    process.env.YOUTUBE_COOKIES ||
    process.env.NETLIFY_COOKIES;

  if (envCookies) {
    try {
      const formatted = formatNetscapeCookies(envCookies);
      const tempPath = join(tmpdir(), "cookies.txt");
      writeFileSync(tempPath, formatted, "utf8");
      console.log(`[videoService] Successfully created cookies.txt in temp dir: ${tempPath}`);
      cachedCookiesPath = tempPath;
      return tempPath;
    } catch (err) {
      console.error("[videoService] Failed to write cookies.txt to temp dir:", err);
    }
  }

  const lambdaRoot = process.env.LAMBDA_TASK_ROOT || "/var/task";
  const pathsToCheck = [
    join(process.cwd(), "cookies.txt"),
    join(process.cwd(), "social-downloader", "cookies.txt"),
    join(fileURLToPath(new URL(".", import.meta.url)), "..", "cookies.txt"),
    join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "cookies.txt"),
    join(lambdaRoot, "cookies.txt"),
    join(lambdaRoot, "src", "cookies.txt"),
    "/var/task/cookies.txt"
  ];

  for (const p of pathsToCheck) {
    if (existsSync(p)) {
      console.log(`[videoService] Found cookies.txt at: ${p}`);
      cachedCookiesPath = p;
      return p;
    }
  }

  return null;
};

const buildYtDlpArgs = (url, cookiesPath, { useImpersonate = true, useCookies = false, playerClient = null } = {}) => {
  const isYouTube = /youtube\.com|youtu\.be/i.test(url);
  const args = [
    ...ytDlpArgs,
    "--dump-single-json",
    "--skip-download",
    "--no-warnings",
    "--no-playlist",
    "--no-check-certificate",
    "--geo-bypass",
    "--no-cache-dir",
    "--js-runtimes", "node",
    "--user-agent",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
  ];

  if (useImpersonate) {
    args.push("--impersonate", "chrome");
  }

  if (isYouTube && playerClient) {
    args.push("--extractor-args", `youtube:player_client=${playerClient}`);
  }

  if (useCookies && cookiesPath) {
    args.push("--cookies", cookiesPath);
  }

  args.push(url);
  return args;
};

const runYtDlp = async (url) => {
  const cookiesPath = getOrCreateCookiesPath();
  const commonEnv = {
    ...process.env,
    ...getFfmpegEnv(),
    PYTHONPATH: [process.env.YTDLP_PYTHON_PATH, process.env.PYTHONPATH].filter(Boolean).join(process.platform === "win32" ? ";" : ":")
  };

  const isYouTube = /youtube\.com|youtu\.be/i.test(url);
  const execOptions = {
    encoding: "utf8",
    env: commonEnv,
    maxBuffer: 80 * 1024 * 1024,
    timeout: isYouTube ? 35000 : 25000,
    windowsHide: true
  };

  const strategies = [];
  if (isYouTube) {
    // Strategy 1: Clean request with node JS challenge solver (returns all resolutions: 4K, 1440p, 1080p, 720p, 360p & audio)
    strategies.push({ useCookies: false, useImpersonate: false, playerClient: null });
    // Strategy 2: If cookies exist, try with cookies (for age-restricted/member videos)
    if (cookiesPath) {
      strategies.push({ useCookies: true, useImpersonate: false, playerClient: null });
    }
    // Strategy 3: visionos fallback
    strategies.push({ useCookies: false, useImpersonate: false, playerClient: "visionos" });
  } else {
    // For social media (TikTok, Twitter, Instagram, Facebook):
    // Strategy 1: Without cookies (prevents failing on expired cookies)
    strategies.push({ useCookies: false, useImpersonate: true });
    // Strategy 2: With cookies if available
    if (cookiesPath) {
      strategies.push({ useCookies: true, useImpersonate: true });
    }
    // Strategy 3: Standard without impersonate
    strategies.push({ useCookies: false, useImpersonate: false });
  }

  let lastError;

  for (const strategy of strategies) {
    try {
      const args = buildYtDlpArgs(url, cookiesPath, strategy);
      const { stdout } = await execFileAsync(pythonCmd, args, execOptions);
      const result = JSON.parse(stdout);
      result._successful_strategy = strategy;
      return result;
    } catch (error) {
      const stderr = String(error.stderr || error.message || "");
      lastError = error;

      if (stderr.includes("No module named yt_dlp")) {
        throw new Error("yt-dlp is not installed. Run: python -m pip install -U yt-dlp");
      }
      if (process.platform === "win32" && /WinError 10013|forbidden by its access permissions/i.test(stderr)) {
        throw new Error(
          "Network permission blocked yt-dlp. Allow Python/Node through Windows Firewall or run the app outside the restricted sandbox."
        );
      }
      // If Instagram or TikTok has a definitive login/bot block, break early to prevent waiting
      if (/Instagram sent an empty media response|Requested content is not available|login required|Your IP address is blocked|Unexpected response from webpage request/i.test(stderr)) {
        break;
      }
    }
  }

  const stderr = String(lastError?.stderr || lastError?.message || "");
  console.error("runYtDlp all attempts failed. Stderr:", stderr);
  if (/Instagram sent an empty media response|Requested content is not available|login required|Failed to parse JSON/i.test(stderr)) {
    throw new Error("This Instagram post or reel requires login or is private. Please ensure the link is public or update cookies.txt.");
  }
  if (/Your IP address is blocked|Unexpected response from webpage request/i.test(stderr)) {
    throw new Error("TikTok bot detection temporarily blocked direct server access. Please use the direct no-watermark options.");
  }
  if (/private|login|cookies|not available|unsupported|unable to extract|unable to download webpage|http error 404|Cannot parse data/i.test(stderr)) {
    throw new Error("This video is private, unsupported, unavailable, or platform bot detection blocked access. Please check if link is public or update cookies.");
  }
  const cleanError = stderr.split("\n")
    .map((line) => line.trim())
    .filter((line) => line &&
      !line.toLowerCase().includes("deprecated") &&
      !line.toLowerCase().includes("please remove") &&
      !line.toLowerCase().includes("github.com/yt-dlp/yt-dlp/issues/") &&
      !line.startsWith("WARNING:")
    )
    .join(" | ") || "Could not extract media from this URL.";
  throw new Error(cleanError);
};

export const normalizeUrl = (urlString) => {
  try {
    const url = new URL(urlString);
    
    // YouTube
    if (url.hostname.includes("youtube.com") || url.hostname.includes("youtu.be")) {
      const v = url.searchParams.get("v");
      const cleanUrl = new URL(url.origin + url.pathname);
      if (v) cleanUrl.searchParams.set("v", v);
      return cleanUrl.toString();
    }
    
    // Social / media platforms (strip all tracking queries)
    if (
      url.hostname.includes("instagram.com") ||
      url.hostname.includes("instagr.am") ||
      url.hostname.includes("tiktok.com") ||
      url.hostname.includes("twitter.com") ||
      url.hostname.includes("x.com") ||
      url.hostname.includes("pinterest.com") ||
      url.hostname.includes("pin.it") ||
      url.hostname.includes("threads.net") ||
      url.hostname.includes("vimeo.com") ||
      url.hostname.includes("linkedin.com") ||
      url.hostname.includes("snapchat.com")
    ) {
      return url.origin + url.pathname.replace(/\/+$/, "");
    }
    
    // Facebook
    if (url.hostname.includes("facebook.com") || url.hostname.includes("fb.watch") || url.hostname.includes("fb.com")) {
      const v = url.searchParams.get("v");
      if (v) {
        const cleanUrl = new URL(url.origin + url.pathname);
        cleanUrl.searchParams.set("v", v);
        return cleanUrl.toString();
      }
      return url.origin + url.pathname.replace(/\/+$/, "");
    }
    
    // General fallback: delete UTM parameters, Facebook click IDs, and YouTube sharing tokens
    const stripParams = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid", "si"];
    for (const p of stripParams) {
      url.searchParams.delete(p);
    }
    return url.toString().replace(/\/+$/, "");
  } catch {
    return urlString;
  }
};

const extractYouTubeId = (urlStr) => {
  try {
    const url = new URL(urlStr);
    if (url.pathname.includes("/shorts/")) {
      return url.pathname.split("/shorts/")[1].split("/")[0];
    }
    if (url.pathname.includes("/watch")) {
      return url.searchParams.get("v");
    }
    if (url.hostname.includes("youtu.be")) {
      return url.pathname.replace(/^\//, "").split("/")[0];
    }
  } catch {}
  return null;
};

const fetchYtDirectDownloadUrl = async (url, format = "720") => {
  try {
    const initRes = await fetch(`https://loader.to/ajax/download.php?format=${format}&url=${encodeURIComponent(url)}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36" }
    }).catch(() => null);
    if (!initRes || !initRes.ok) return null;
    const initData = await initRes.json().catch(() => ({}));
    if (!initData.id) return null;

    let attempts = 0;
    while (attempts < 10) {
      attempts++;
      await new Promise(r => setTimeout(r, 600));
      const pRes = await fetch(`https://loader.to/ajax/progress.php?id=${initData.id}`).catch(() => null);
      if (!pRes || !pRes.ok) continue;
      const pData = await pRes.json().catch(() => ({}));
      if (pData.download_url && pData.download_url.startsWith("http")) {
        return pData.download_url;
      }
      if (pData.progress === 1000 || pData.success === 1) break;
    }
  } catch (e) {
    console.error("[fetchYtDirectDownloadUrl Error]:", e?.message);
  }
  return null;
};

const fetchYouTubeFallback = async (url) => {
  const videoId = extractYouTubeId(url);
  if (!videoId) throw new Error("Could not parse YouTube Video ID.");

  const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
  const oembedRes = await fetch(oembedUrl);
  if (!oembedRes.ok) {
    throw new Error("This video is private, unsupported, or unavailable.");
  }

  const meta = await oembedRes.json();
  const title = meta.title || "YouTube Video";
  const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  const maxThumbnail = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;

  // Fetch real direct stream URLs for Vercel serverless environment
  const directMp4Url = await fetchYtDirectDownloadUrl(url, "720");
  const directMp3Url = await fetchYtDirectDownloadUrl(url, "mp3");

  const downloads = [];

  if (directMp4Url) {
    const vId = cacheDownload({ format: { url: directMp4Url, ext: "mp4" }, title });
    downloads.push({
      id: vId,
      label: "720p HD MP4 Video",
      resolution: "720p (HD)",
      type: "video",
      has_audio: true,
      has_video: true,
      badge: "Best MP4 Video",
      extension: "mp4",
      download_url: `/api/download?id=${encodeURIComponent(vId)}`,
      preview_url: `/api/download?id=${encodeURIComponent(vId)}&preview=1`
    });
  } else {
    const videoStreamUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const videoFormat720 = cacheMergedDownload({ sourceUrl: videoStreamUrl, title, quality: "normal", strategy: { useCookies: true, useImpersonate: false } });
    downloads.push({
      id: videoFormat720.id,
      label: "720p HD MP4 Video",
      resolution: "720p (HD)",
      type: "video",
      has_audio: true,
      has_video: true,
      badge: "Best MP4 Video",
      extension: "mp4",
      download_url: videoFormat720.download_url,
      preview_url: videoFormat720.preview_url
    });
  }

  if (directMp3Url) {
    const aId = cacheDownload({ format: { url: directMp3Url, ext: "mp3" }, title });
    downloads.push({
      id: aId,
      label: "Audio MP3 (Highest Quality)",
      resolution: "320kbps MP3",
      type: "audio",
      badge: "Audio MP3",
      extension: "mp3",
      download_url: `/api/download?id=${encodeURIComponent(aId)}`
    });
  } else {
    const videoStreamUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const audioOption = cacheMp3Download({ sourceUrl: videoStreamUrl, title });
    downloads.push(audioOption);
  }

  const thumbOption = normalizeThumbnail(maxThumbnail, title);
  if (thumbOption) downloads.push(thumbOption);

  return {
    title,
    thumbnail,
    platform: "YouTube",
    platform_key: "youtube",
    platform_label: "YouTube",
    platform_icon: "YT",
    uploader: meta.author_name || "YouTube Creator",
    duration: "HD Media",
    source_url: url,
    media: {
      title,
      thumbnail,
      duration: "HD Media",
      view_count: "",
      like_count: "",
      share_count: "",
      upload_date: ""
    },
    creator: {
      name: meta.author_name || "YouTube Creator",
      handle: "",
      profile_url: meta.author_url || ""
    },
    primary_actions: {
      high_quality: downloads[0],
      normal_quality: downloads[0],
      audio_mp3: downloads.find(d => d.type === "audio") || null,
      thumbnail_hd: thumbOption
    },
    downloads,
    videos: downloads
  };
};

const fetchTikTokFallback = async (url) => {
  const cleanUrl = (url || "").trim().split("?")[0];
  // Strategy 1: Ultra-fast TikWM POST with hd=1 (resolves in ~0.4s with full HD & no watermark)
  try {
    const res = await fetch("https://www.tikwm.com/api/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
      },
      body: `url=${encodeURIComponent(cleanUrl || url)}&hd=1`
    });

    if (res.ok) {
      const json = await res.json().catch(() => ({}));
      if (json.code === 0 && json.data) {
        const data = json.data;
        const title = data.title || "TikTok Video";
        const coverUrl = data.cover || data.origin_cover || data.ai_dynamic_cover || "";
        const downloads = [];

        // 1. Full HD No-Watermark MP4 if available
        if (data.hdplay) {
          const hdId = cacheDownload({ format: { url: data.hdplay, ext: "mp4", height: 1080 }, title: `${title} (HD)` });
          downloads.push({
            id: hdId,
            label: "No Watermark HD MP4 Video",
            resolution: "1080p (HD)",
            type: "video",
            has_audio: true,
            has_video: true,
            badge: "Best HD (No Watermark)",
            extension: "mp4",
            download_url: `/api/download?id=${encodeURIComponent(hdId)}`,
            preview_url: `/api/download?id=${encodeURIComponent(hdId)}&preview=1`
          });
        }

        // 2. Standard No-Watermark MP4
        if (data.play) {
          const vId = cacheDownload({ format: { url: data.play, ext: "mp4", height: 720 }, title });
          downloads.push({
            id: vId,
            label: data.hdplay ? "No Watermark MP4 Video" : "No Watermark HD MP4 Video",
            resolution: "720p (HD)",
            type: "video",
            has_audio: true,
            has_video: true,
            badge: data.hdplay ? "Fast MP4" : "Best MP4 Video",
            extension: "mp4",
            download_url: `/api/download?id=${encodeURIComponent(vId)}`,
            preview_url: `/api/download?id=${encodeURIComponent(vId)}&preview=1`
          });
        }

        // 3. Watermarked MP4 if available
        if (data.wmplay) {
          const wId = cacheDownload({ format: { url: data.wmplay, ext: "mp4" }, title: `${title} (Watermark)` });
          downloads.push({
            id: wId,
            label: "Watermarked MP4 Video",
            resolution: "Original MP4",
            type: "video",
            has_audio: true,
            has_video: true,
            badge: "Watermark",
            extension: "mp4",
            download_url: `/api/download?id=${encodeURIComponent(wId)}`,
            preview_url: `/api/download?id=${encodeURIComponent(wId)}&preview=1`
          });
        }

        // 4. Photo slideshow images if this is a photo post
        if (Array.isArray(data.images) && data.images.length > 0) {
          data.images.forEach((imgUrl, idx) => {
            const pId = cacheDownload({ format: { url: imgUrl, ext: "jpeg" }, title: `${title}-photo-${idx + 1}` });
            downloads.push({
              id: pId,
              label: `HD Photo ${idx + 1}`,
              resolution: "High-Res Image",
              type: "image",
              badge: `Photo ${idx + 1}`,
              extension: "jpeg",
              download_url: `/api/download?id=${encodeURIComponent(pId)}`
            });
          });
        }

        // 5. Direct Audio MP3
        if (data.music) {
          const aId = cacheDownload({ format: { url: data.music, ext: "mp3" }, title: `${title}-audio` });
          downloads.push({
            id: aId,
            label: "TikTok Audio MP3",
            resolution: "320kbps MP3",
            type: "audio",
            badge: "Audio MP3",
            extension: "mp3",
            download_url: `/api/download?id=${encodeURIComponent(aId)}`
          });
        }

        // 6. HD Thumbnail cover
        const thumbOption = coverUrl ? normalizeThumbnail(coverUrl, title) : null;
        if (thumbOption) downloads.push(thumbOption);

        if (downloads.length > 0) {
          const authorNick = data.author?.nickname || "TikTok Creator";
          const authorUser = data.author?.unique_id || "";
          return {
            title,
            thumbnail: coverUrl,
            platform: "TikTok",
            platform_key: "tiktok",
            platform_label: "TikTok",
            platform_icon: "TT",
            uploader: authorNick,
            duration: formatDuration(data.duration),
            source_url: url,
            media: {
              title,
              thumbnail: coverUrl,
              duration: formatDuration(data.duration),
              view_count: data.play_count ? String(data.play_count) : "",
              like_count: data.digg_count ? String(data.digg_count) : "",
              share_count: data.share_count ? String(data.share_count) : "",
              upload_date: data.create_time ? new Date(data.create_time * 1000).toISOString() : ""
            },
            creator: {
              name: authorNick,
              handle: authorUser ? `@${authorUser}` : "",
              avatar: data.author?.avatar || "",
              profile_url: authorUser ? `https://www.tiktok.com/@${authorUser}` : ""
            },
            primary_actions: {
              high_quality: downloads[0],
              normal_quality: downloads[1] || downloads[0],
              audio_mp3: downloads.find(d => d.type === "audio") || null,
              thumbnail_hd: thumbOption
            },
            downloads,
            videos: downloads
          };
        }
      }
    }
  } catch (err) {
    console.warn("[videoService] TikWM POST error:", err.message);
  }

  // Strategy 2: GET fallback with www subdomain
  try {
    const res = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(cleanUrl || url)}&hd=1`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });
    const json = await res.json().catch(() => ({}));
    if (json.data && (json.data.play || json.data.hdplay)) {
      const data = json.data;
      const title = data.title || "TikTok Video";
      const videoUrl = data.hdplay || data.play;
      const coverUrl = data.cover || data.origin_cover;
      const videoFormatId = cacheDownload({ format: { url: videoUrl, ext: "mp4", height: 720 }, title });
      const audioFormatId = data.music ? cacheDownload({ format: { url: data.music, ext: "mp3" }, title: `${title}-audio` }) : null;
      const thumbOption = coverUrl ? normalizeThumbnail(coverUrl, title) : null;
      const downloads = [
        {
          id: videoFormatId,
          label: "No Watermark HD MP4 Video",
          resolution: "720p (HD)",
          type: "video",
          has_audio: true,
          has_video: true,
          badge: "Best MP4 Video",
          extension: "mp4",
          download_url: `/api/download?id=${encodeURIComponent(videoFormatId)}`,
          preview_url: `/api/download?id=${encodeURIComponent(videoFormatId)}&preview=1`
        }
      ];
      if (audioFormatId) {
        downloads.push({
          id: audioFormatId,
          label: "TikTok Audio MP3",
          resolution: "320kbps MP3",
          type: "audio",
          badge: "Audio MP3",
          extension: "mp3",
          download_url: `/api/download?id=${encodeURIComponent(audioFormatId)}`
        });
      }
      if (thumbOption) downloads.push(thumbOption);
      return {
        title,
        thumbnail: coverUrl || "",
        platform: "TikTok",
        platform_key: "tiktok",
        platform_label: "TikTok",
        platform_icon: "TT",
        uploader: data.author?.nickname || "TikTok Creator",
        duration: formatDuration(data.duration),
        source_url: url,
        media: { title, thumbnail: coverUrl },
        creator: { name: data.author?.nickname, handle: data.author?.unique_id, avatar: data.author?.avatar },
        primary_actions: {
          high_quality: downloads[0],
          normal_quality: downloads[0],
          audio_mp3: downloads.find(d => d.type === "audio") || null,
          thumbnail_hd: thumbOption
        },
        downloads,
        videos: downloads
      };
    }
  } catch (err) {
    console.warn("[videoService] TikWM GET fallback error:", err.message);
  }

  throw new Error("Could not extract TikTok video link. Please check if link is public.");
};

const decodeSnapApp = (args) => {
  let [h, u, n, t, e, r] = args;
  const tNum = Number(t);
  const eNum = Number(e);
  function decode(d, e, f) {
    const g = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/".split("");
    const hArr = g.slice(0, e);
    const iArr = g.slice(0, f);
    let j = d.split("").reverse().reduce((a, b, c) => {
      const idx = hArr.indexOf(b);
      if (idx !== -1) return a + idx * Math.pow(e, c);
      return a;
    }, 0);
    let k = "";
    while (j > 0) {
      k = iArr[j % f] + k;
      j = Math.floor(j / f);
    }
    return k || "0";
  }
  let result = "";
  for (let i = 0, len = h.length; i < len;) {
    let s = "";
    while (i < len && h[i] !== n[eNum]) {
      s += h[i];
      i++;
    }
    i++;
    for (let j = 0; j < n.length; j++) s = s.replace(new RegExp(n[j], "g"), j.toString());
    result += String.fromCharCode(Number(decode(s, eNum, 10)) - tNum);
  }
  try {
    const bytes = new Uint8Array(result.split("").map((c) => c.charCodeAt(0)));
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return result;
  }
};

const getEncodedSnapApp = (data) => {
  if (!data || typeof data !== "string") return null;
  const parts = data.split("decodeURIComponent(escape(r))}(");
  if (parts.length < 2) return null;
  return parts[1].split("))")[0].split(",").map((v) => v.replace(/"/g, "").trim());
};

const extractSnapSaveMedia = (decoded) => {
  if (!decoded || typeof decoded !== "string") return [];
  const marker = 'getElementById("download-section").innerHTML = "';
  const start = decoded.indexOf(marker);
  if (start === -1) return [];
  const end = decoded.indexOf('"; document.getElementById("inputData").remove();', start);
  const htmlRaw = end !== -1 ? decoded.slice(start + marker.length, end) : decoded.slice(start + marker.length);
  const html = htmlRaw.replace(/\\"/g, '"').replace(/\\\\/g, '\\');

  const items = [];
  const globalThumbMatch = html.match(/<article class="media"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/i) ||
                           html.match(/<img[^>]+src="([^"]*rapidcdn\.app\/thumb[^"]*)"/i);
  const globalThumb = globalThumbMatch ? globalThumbMatch[1] : "";

  // Pattern 1: Card items (.download-items)
  const cardRegex = /<div class="download-items">([\s\S]*?)<\/div>\s*<\/div>/g;
  let cardMatch;
  while ((cardMatch = cardRegex.exec(html)) !== null) {
    const block = cardMatch[1];
    const thumbMatch = block.match(/<img[^>]+src="([^"]+)"/i);
    const linkMatch = block.match(/<a[^>]+href="([^"]+)"/i);
    const isVideo = /icon-dlvideo|download video/i.test(block);

    if (linkMatch && linkMatch[1].startsWith("http")) {
      items.push({
        url: linkMatch[1],
        thumb: thumbMatch ? thumbMatch[1] : globalThumb,
        type: isVideo ? "video" : "image",
        resolution: isVideo ? "1080p (Full HD)" : "High-Res Image"
      });
    }
  }

  // Pattern 2: Table items (table.table)
  if (items.length === 0) {
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let rowMatch;
    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const row = rowMatch[1];
      const resMatch = row.match(/<td[^>]*class="[^"]*video-quality[^"]*"[^>]*>(.*?)<\/td>/i) ||
                       row.match(/<td[^>]*>(.*?)<\/td>/i);
      const qualityText = resMatch ? resMatch[1].replace(/<[^>]+>/g, "").trim() : "";
      if (!qualityText || /quality|processing/i.test(qualityText)) continue;

      const linkMatch = row.match(/<a[^>]+href="([^"]+)"/i);
      const renderMatch = row.match(/get_progressApi\(\\?['"](?:\/)?render\.php\?token=([^'"\\]+)/i);

      if (linkMatch && linkMatch[1].startsWith("http")) {
        items.push({
          url: linkMatch[1],
          thumb: globalThumb,
          type: "video",
          resolution: qualityText.includes("720") ? "720p (HD)" : qualityText
        });
      } else if (renderMatch && renderMatch[1]) {
        try {
          const token = renderMatch[1];
          const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString("utf8"));
          if (payload.video_url) {
            items.push({
              url: payload.video_url,
              videoUrl: payload.video_url,
              audioUrl: payload.audio_url || "",
              thumb: globalThumb,
              type: "video",
              resolution: qualityText || "1080p (Full HD)",
              requiresMux: Boolean(payload.audio_url)
            });
          }
        } catch (e) {
          console.warn("[videoService] Render token decode error:", e.message);
        }
      }
    }
  }

  // Fallback: direct rapidcdn link
  if (items.length === 0) {
    const anyLinkMatch = html.match(/href="(https:\/\/[^"]*rapidcdn\.app[^"]*)"/i);
    if (anyLinkMatch) {
      items.push({
        url: anyLinkMatch[1],
        thumb: globalThumb,
        type: "video",
        resolution: "720p (HD)"
      });
    }
  }

  return items;
};

const querySnapSave = async (url) => {
  const fd = new URLSearchParams();
  fd.append("url", url);
  const res = await fetch("https://snapsave.app/action.php?lang=en", {
    method: "POST",
    headers: {
      "accept": "*/*",
      "content-type": "application/x-www-form-urlencoded",
      "origin": "https://snapsave.app",
      "referer": "https://snapsave.app/",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36"
    },
    body: fd.toString()
  }).catch(() => null);

  if (!res || !res.ok) return [];
  const raw = await res.text().catch(() => "");
  const encoded = getEncodedSnapApp(raw);
  if (!encoded) return [];
  const decoded = decodeSnapApp(encoded);
  return extractSnapSaveMedia(decoded);
};

const fetchInstagramFallback = async (url) => {
  const cleanUrl = url.split("?")[0].replace(/\/+$/, "");

  // Strategy 1: SnapSave (Supports Reels, Posts, Carousels with HD MP4 and Images)
  try {
    const variations = [cleanUrl];
    if (cleanUrl.includes("/reel/")) {
      variations.push(cleanUrl.replace("/reel/", "/p/"));
    } else if (cleanUrl.includes("/reels/")) {
      variations.push(cleanUrl.replace("/reels/", "/p/"));
    }

    let snapItems = [];
    for (const vUrl of variations) {
      snapItems = await querySnapSave(vUrl);
      if (snapItems.length > 0) break;
    }

    if (snapItems.length > 0) {
      const title = "Instagram Media";
      const downloads = [];
      let firstThumb = "";

      snapItems.forEach((item, idx) => {
        if (!firstThumb && item.thumb) firstThumb = item.thumb;
        const isVid = item.type === "video";
        const label = snapItems.length > 1
          ? (isVid ? `Instagram HD Video ${idx + 1}` : `Instagram HD Photo ${idx + 1}`)
          : (isVid ? "Instagram HD MP4 Video" : "Instagram HD Photo");
        const badge = isVid ? "1080p (Full HD)" : "High-Res Image";
        const ext = isVid ? "mp4" : "jpeg";
        const formatId = cacheDownload({ format: { url: item.url, ext }, title: `${title}-${idx + 1}` });

        downloads.push({
          id: formatId,
          label,
          resolution: item.resolution || (isVid ? "1080p (Full HD)" : "HD Photo"),
          type: item.type,
          has_audio: isVid,
          has_video: isVid,
          badge,
          extension: ext,
          download_url: `/api/download?id=${encodeURIComponent(formatId)}`,
          preview_url: `/api/download?id=${encodeURIComponent(formatId)}&preview=1`
        });

        if (item.thumb) {
          const tOpt = normalizeThumbnail(item.thumb, `${title}-thumb-${idx + 1}`);
          if (tOpt) downloads.push(tOpt);
        }
      });

      if (downloads.length > 0) {
        return {
          title,
          thumbnail: firstThumb,
          platform: "Instagram",
          platform_key: "instagram",
          platform_label: "Instagram",
          platform_icon: "IG",
          uploader: "Instagram Creator",
          duration: "HD Media",
          source_url: url,
          primary_actions: {
            high_quality: downloads[0] || null,
            normal_quality: downloads[0] || null,
            audio_mp3: null,
            thumbnail_hd: downloads.find(d => d.type === "image") || null
          },
          downloads,
          videos: downloads
        };
      }
    }
  } catch (err) {
    console.warn("[videoService] SnapSave Instagram error:", err.message);
  }

  // Strategy 2: Check embedded captioned and public embed endpoints
  const embedUrls = [`${cleanUrl}/embed/captioned/`, `${cleanUrl}/embed/`];
  let videoUrl = null;
  let imgUrl = null;
  let caption = "";

  for (const embedUrl of embedUrls) {
    try {
      const htmlRes = await fetch(embedUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9"
        }
      }).catch(() => null);

      if (htmlRes && htmlRes.ok) {
        const html = await htmlRes.text();
        const videoMatch = html.match(/video_url\\?":\\?"([^"]+)\\?"/i) || html.match(/src=\\?"(https:\/\/[^"]+\.mp4[^"]*)\\?"/i);
        if (videoMatch) videoUrl = videoMatch[1].replace(/\\/g, "").replace(/&amp;/g, "&");

        const imgMatch = html.match(/display_url\\?":\\?"([^"]+)\\?"/i) || html.match(/src=\\?"(https:\/\/[^"]+\.jpg[^"]*)\\?"/i);
        if (imgMatch) imgUrl = imgMatch[1].replace(/\\/g, "").replace(/&amp;/g, "&");

        const captionMatch = html.match(/<div class="Caption"[^>]*>([\s\S]*?)<\/div>/i);
        if (captionMatch) {
          caption = captionMatch[1].replace(/<[^>]+>/g, "").trim().slice(0, 100);
        }

        if (videoUrl || imgUrl) break;
      }
    } catch {}
  }

  // Strategy 3: Social media crawler user-agent for OpenGraph tags
  if (!videoUrl && !imgUrl) {
    try {
      const fbRes = await fetch(cleanUrl, {
        headers: {
          "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      }).catch(() => null);

      if (fbRes && fbRes.ok) {
        const text = await fbRes.text();
        const ogVideo = text.match(/property="og:video(?::secure_url)?"\s+content="([^"]+)"/i) ||
                        text.match(/content="([^"]+)"\s+property="og:video(?::secure_url)?"/i);
        if (ogVideo) videoUrl = ogVideo[1].replace(/&amp;/g, "&");

        const ogImage = text.match(/property="og:image"\s+content="([^"]+)"/i) ||
                        text.match(/content="([^"]+)"\s+property="og:image"/i);
        if (ogImage) imgUrl = ogImage[1].replace(/&amp;/g, "&");
      }
    } catch {}
  }

  if (videoUrl) {
    const title = caption || "Instagram Video";
    const downloads = [];
    const vId = cacheDownload({ format: { url: videoUrl, ext: "mp4" }, title });
    downloads.push({
      id: vId,
      label: "Instagram HD MP4 Video",
      resolution: "Best HD MP4",
      type: "video",
      has_audio: true,
      has_video: true,
      badge: "Best MP4 Video",
      extension: "mp4",
      download_url: `/api/download?id=${encodeURIComponent(vId)}`,
      preview_url: `/api/download?id=${encodeURIComponent(vId)}&preview=1`
    });

    if (imgUrl) {
      const thumbOpt = normalizeThumbnail(imgUrl, title);
      if (thumbOpt) downloads.push(thumbOpt);
    }

    return {
      title,
      thumbnail: imgUrl || "",
      platform: "Instagram",
      platform_key: "instagram",
      platform_label: "Instagram",
      platform_icon: "IG",
      uploader: "Instagram Creator",
      duration: "HD Media",
      source_url: url,
      primary_actions: {
        high_quality: downloads[0] || null,
        normal_quality: downloads[0] || null,
        audio_mp3: null,
        thumbnail_hd: downloads.find(d => d.type === "image") || null
      },
      downloads,
      videos: downloads
    };
  }

  throw new Error("This Instagram post or reel is private, requires login, or was removed. Please ensure the link is from a public account.");
};

const fetchTwitterFallback = async (url) => {
  const statusIdMatch = url.match(/status\/(\d+)/);
  if (!statusIdMatch) throw new Error("Could not parse Twitter post ID.");
  const statusId = statusIdMatch[1];

  const res = await fetch(`https://api.fxtwitter.com/status/${statusId}`);
  const json = await res.json().catch(() => ({}));
  if (!json.tweet) throw new Error("Could not fetch Twitter video media. Please check if link contains a video.");

  const tweet = json.tweet;
  const title = tweet.text?.slice(0, 80) || "Twitter Video";
  const videoObj = tweet.media?.videos?.[0] || tweet.media_extended?.find(m => m.type === "video");
  const videoUrl = videoObj?.url || videoObj?.variants?.sort((a,b) => (b.bitrate||0)-(a.bitrate||0))?.[0]?.url;
  const thumbUrl = tweet.media?.photos?.[0]?.url || tweet.media_extended?.[0]?.thumbnail_url || tweet.author?.avatar_url;

  if (!videoUrl && !thumbUrl) throw new Error("No video media found in this tweet.");

  const downloads = [];
  if (videoUrl) {
    const vId = cacheDownload({ format: { url: videoUrl, ext: "mp4" }, title });
    downloads.push({
      id: vId,
      label: "Twitter HD MP4 Video",
      resolution: "Best HD MP4",
      type: "video",
      has_audio: true,
      has_video: true,
      badge: "Best MP4 Video",
      extension: "mp4",
      download_url: `/api/download?id=${encodeURIComponent(vId)}`,
      preview_url: `/api/download?id=${encodeURIComponent(vId)}&preview=1`
    });
  }
  if (thumbUrl) {
    const thumbOpt = normalizeThumbnail(thumbUrl, title);
    if (thumbOpt) downloads.push(thumbOpt);
  }

  return {
    title,
    thumbnail: thumbUrl || "",
    platform: "X / Twitter",
    platform_key: "twitter",
    platform_label: "X / Twitter",
    platform_icon: "X",
    uploader: tweet.author?.name || "Twitter User",
    duration: "HD Media",
    source_url: url,
    primary_actions: {
      high_quality: downloads[0] || null,
      normal_quality: downloads[0] || null,
      audio_mp3: null,
      thumbnail_hd: downloads.find(d => d.type === "image") || null
    },
    downloads,
    videos: downloads
  };
};

const fetchFacebookMetadata = async (url) => {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });
    if (!res || !res.ok) return null;
    const html = await res.text().catch(() => "");
    if (!html) return null;

    const ogImageMatch =
      html.match(/property="og:image"\s+content="([^"]+)"/i) ||
      html.match(/content="([^"]+)"\s+property="og:image"/i) ||
      html.match(/(https:\/\/[^"]+fbcdn\.net[^"]+\.(?:jpg|png)[^"\s]*)/i);

    const ogTitleMatch =
      html.match(/property="og:title"\s+content="([^"]+)"/i) ||
      html.match(/content="([^"]+)"\s+property="og:title"/i) ||
      html.match(/<title>([^<]+)<\/title>/i);

    let rawTitle = ogTitleMatch ? ogTitleMatch[1].replace(/&amp;/g, "&").replace(/&#x201c;|&#x201d;/g, '"').replace(/&#xb7;/g, "·").trim() : "";
    const rawImage = ogImageMatch ? ogImageMatch[1].replace(/&amp;/g, "&") : "";

    let views = null;
    let reactions = null;
    let creatorName = null;
    let cleanTitle = rawTitle;

    if (rawTitle.includes("|")) {
      const parts = rawTitle.split("|").map(p => p.trim());
      if (parts[0] && /views|reactions|likes/i.test(parts[0])) {
        const statsStr = parts[0];
        const vMatch = statsStr.match(/([\d.]+[KMB]?)\s*views/i);
        const rMatch = statsStr.match(/([\d.]+[KMB]?)\s*(?:reactions|likes)/i);
        if (vMatch) views = vMatch[1];
        if (rMatch) reactions = rMatch[1];
        cleanTitle = parts.slice(1, parts.length > 2 ? -1 : undefined).join(" | ").trim();
        if (parts.length > 2) creatorName = parts[parts.length - 1];
      }
    }

    return {
      title: cleanTitle || rawTitle || "Facebook Video",
      thumbnail: rawImage || "",
      views,
      reactions,
      creatorName
    };
  } catch {
    return null;
  }
};

const fetchFacebookFallback = async (url) => {
  let targetUrl = url;
  if (url.includes("/share/")) {
    try {
      const headRes = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
        },
        redirect: "follow"
      });
      if (headRes && headRes.url && !headRes.url.includes("/share/")) {
        targetUrl = headRes.url.split("?")[0];
      }
    } catch {}
  }

  // Fetch OpenGraph metadata & direct Facebook HTML in parallel
  const fbMetaPromise = fetchFacebookMetadata(targetUrl).then(m => m || fetchFacebookMetadata(url));
  const fbDirectPromise = (async () => {
    try {
      const fbRes = await fetch(targetUrl, {
        headers: {
          "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
          "Accept-Language": "en-US,en;q=0.9"
        }
      });
      if (!fbRes || !fbRes.ok) return null;
      const rawHtml = await fbRes.text().catch(() => "");
      const html = rawHtml.replace(/\\u0025/g, "%").replace(/\\u0026/g, "&").replace(/\\\//g, "/").replace(/\\/g, "");
      const hdMatch = html.match(/"(?:browser_native_hd_url|playable_url_quality_hd|hd_src|hd_src_no_ratelimit)":\s*"([^"]+)"/i);
      const sdMatch = html.match(/"(?:browser_native_sd_url|playable_url|sd_src|sd_src_no_ratelimit)":\s*"([^"]+)"/i);
      const thumbMatch = html.match(/"preferred_thumbnail":\s*\{[^}]*"uri":\s*"([^"]+)"/i) ||
                         html.match(/property="og:image"\s+content="([^"]+)"/i);
      return {
        hdUrl: hdMatch ? hdMatch[1] : null,
        sdUrl: sdMatch ? sdMatch[1] : null,
        thumbUrl: thumbMatch ? thumbMatch[1].replace(/&amp;/g, "&") : null
      };
    } catch {
      return null;
    }
  })();

  // Strategy 1: SnapSave (Ultra-fast Facebook HD 1080p, 720p & 360p MP4)
  try {
    let snapItems = await querySnapSave(targetUrl);
    if ((!snapItems || snapItems.length === 0) && targetUrl !== url) {
      snapItems = await querySnapSave(url);
    }
    const fbDirect = await fbDirectPromise;
    const fbMeta = (await fbMetaPromise) || {};
    const title = fbMeta.title || "Facebook Video";

    if (snapItems.length > 0 || (fbDirect && (fbDirect.hdUrl || fbDirect.sdUrl))) {
      const thumbnail = fbMeta.thumbnail || snapItems[0]?.thumb || fbDirect?.thumbUrl || "";
      const downloads = [];

      // Add SnapSave items (supports 1080p with requiresMux and 720p direct)
      snapItems.forEach((item) => {
        const is1080 = item.resolution?.includes("1080");
        const is720 = item.resolution?.includes("720");
        const label = is1080
          ? "Facebook 1080p Full HD MP4 Video"
          : is720
          ? "Facebook 720p HD MP4 Video"
          : `Facebook MP4 Video (${item.resolution})`;
        const badge = is1080 ? "1080p Full HD" : is720 ? "720p HD" : "Fast MP4";

        const vId = cacheDownload({
          format: {
            url: item.url,
            ext: "mp4",
            requiresMux: Boolean(item.requiresMux),
            videoUrl: item.videoUrl || "",
            audioUrl: item.audioUrl || ""
          },
          title: `${title}-${item.resolution || "video"}`
        });

        downloads.push({
          id: vId,
          label,
          resolution: item.resolution || "HD Video",
          type: "video",
          has_audio: true,
          has_video: true,
          badge,
          extension: "mp4",
          download_url: `/api/download?id=${encodeURIComponent(vId)}`,
          preview_url: `/api/download?id=${encodeURIComponent(vId)}&preview=1`
        });
      });

      // If we don't have a 720p yet but Facebook direct has hdUrl, add it
      if (!downloads.some(d => d.resolution.includes("720") || d.label.includes("720")) && fbDirect?.hdUrl) {
        const hdId = cacheDownload({ format: { url: fbDirect.hdUrl, ext: "mp4" }, title: `${title}-720p` });
        downloads.push({
          id: hdId,
          label: "Facebook 720p HD MP4 Video",
          resolution: "720p (HD)",
          type: "video",
          has_audio: true,
          has_video: true,
          badge: "720p HD",
          extension: "mp4",
          download_url: `/api/download?id=${encodeURIComponent(hdId)}`,
          preview_url: `/api/download?id=${encodeURIComponent(hdId)}&preview=1`
        });
      }

      // Add real SD (480p / 360p) from Facebook direct sdUrl if available and not yet present
      if (!downloads.some(d => d.resolution.includes("360") || d.resolution.includes("480")) && fbDirect?.sdUrl) {
        const sdId = cacheDownload({ format: { url: fbDirect.sdUrl, ext: "mp4" }, title: `${title}-sd` });
        downloads.push({
          id: sdId,
          label: "Facebook Standard MP4 Video",
          resolution: "480p / 360p (SD)",
          type: "video",
          has_audio: true,
          has_video: true,
          badge: "Standard SD",
          extension: "mp4",
          download_url: `/api/download?id=${encodeURIComponent(sdId)}`,
          preview_url: `/api/download?id=${encodeURIComponent(sdId)}&preview=1`
        });
      }

      // Add High Quality MP3 Audio option
      const primaryVideoUrl = snapItems[0]?.audioUrl || snapItems[0]?.url || fbDirect?.hdUrl || fbDirect?.sdUrl;
      let audioOption = null;
      if (primaryVideoUrl) {
        const audioId = cacheDownload({
          format: { url: primaryVideoUrl, ext: "mp3", vcodec: "none", acodec: "mp3" },
          title: `${title} Audio`
        });
        audioOption = {
          id: audioId,
          label: "Facebook High Quality Audio (MP3)",
          resolution: "320kbps MP3",
          type: "audio",
          has_audio: true,
          has_video: false,
          badge: "320kbps MP3",
          extension: "mp3",
          download_url: `/api/download?id=${encodeURIComponent(audioId)}`,
          preview_url: `/api/download?id=${encodeURIComponent(audioId)}&preview=1`
        };
        downloads.push(audioOption);
      }

      // Add HD Thumbnail Cover option
      let thumbOption = null;
      if (thumbnail) {
        thumbOption = normalizeThumbnail(thumbnail, title);
        if (thumbOption) {
          thumbOption.label = "Facebook HD Cover (JPG)";
          thumbOption.resolution = "HD Cover (1080p)";
          thumbOption.badge = "HD JPG Cover";
          downloads.push(thumbOption);
        }
      }
      // Sort video downloads highest resolution first, then audio, then image
      downloads.sort((a, b) => {
        if (a.type !== b.type) {
          if (a.type === "video") return -1;
          if (b.type === "video") return 1;
          if (a.type === "audio") return -1;
          if (b.type === "audio") return 1;
        }
        const scoreA = a.resolution?.includes("1080") ? 1080 : a.resolution?.includes("720") ? 720 : a.resolution?.includes("480") ? 480 : a.resolution?.includes("360") ? 360 : 0;
        const scoreB = b.resolution?.includes("1080") ? 1080 : b.resolution?.includes("720") ? 720 : b.resolution?.includes("480") ? 480 : b.resolution?.includes("360") ? 360 : 0;
        return scoreB - scoreA;
      });

      const videoDownloads = downloads.filter(d => d.type === "video");

      return {
        title,
        thumbnail,
        platform: "Facebook",
        platform_key: "facebook",
        platform_label: "Facebook",
        platform_icon: "FB",
        uploader: fbMeta.creatorName || "Facebook Creator",
        duration: "HD Media",
        source_url: url,
        creator: {
          name: fbMeta.creatorName || "Facebook Creator",
          handle: "Facebook",
          avatar: thumbnail
        },
        media: {
          view_count: fbMeta.views || "",
          like_count: fbMeta.reactions || "",
          duration: "HD Media"
        },
        primary_actions: {
          high_quality: videoDownloads[0] || null,
          normal_quality: videoDownloads[1] || videoDownloads[0] || null,
          audio_mp3: audioOption || null,
          thumbnail_hd: thumbOption || null
        },
        downloads,
        videos: downloads
      };
    }
  } catch (err) {
    console.warn("[videoService] SnapSave Facebook error:", err.message);
  }

  // Strategy 2: Direct Facebook public page scraping with decoded unicode & multi-pattern regex
  const fbRes = await fetch(url, {
    headers: {
      "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      "Accept-Language": "en-US,en;q=0.9"
    }
  }).catch(() => null);

  if (fbRes && fbRes.ok) {
    const rawHtml = await fbRes.text().catch(() => "");
    const html = rawHtml
      .replace(/\\u0025/g, "%")
      .replace(/\\u0026/g, "&")
      .replace(/\\/g, "");

    const hdMatch = html.match(/"(?:browser_native_hd_url|playable_url_quality_hd|hd_src|hd_src_no_ratelimit)":\s*"([^"]+)"/i);
    const sdMatch = html.match(/"(?:browser_native_sd_url|playable_url|sd_src|sd_src_no_ratelimit)":\s*"([^"]+)"/i);
    const mp4Match = hdMatch || sdMatch || html.match(/(https:\/\/[^"]+fbcdn\.net[^"]+\.mp4[^"\s]*)/i);

    const thumbMatch =
      html.match(/"preferred_thumbnail":\s*\{[^}]*"uri":\s*"([^"]+)"/i) ||
      html.match(/property="og:image"\s+content="([^"]+)"/i) ||
      html.match(/(https:\/\/[^"]+fbcdn\.net[^"]+\.(?:jpg|png)[^"\s]*)/i);

    const titleMatch = rawHtml.match(/<title>([^<]{3,200})<\/title>/i);

    const hdUrl = hdMatch ? hdMatch[1] : null;
    const sdUrl = sdMatch ? sdMatch[1] : null;
    const videoUrl = mp4Match ? mp4Match[1] : null;
    const thumbUrl = thumbMatch ? thumbMatch[1].replace(/&amp;/g, "&") : null;
    const title = titleMatch ? titleMatch[1].replace(/ \| Facebook$/i, "").replace(/&amp;/g, "&").trim() : "Facebook Video";

    if (videoUrl) {
      const downloads = [];

      if (hdUrl) {
        const vId = cacheDownload({ format: { url: hdUrl, ext: "mp4" }, title: `${title}-HD` });
        downloads.push({
          id: vId,
          label: "Facebook 720p HD MP4 Video",
          resolution: "720p (HD)",
          type: "video",
          has_audio: true,
          has_video: true,
          badge: "720p HD",
          extension: "mp4",
          download_url: `/api/download?id=${encodeURIComponent(vId)}`,
          preview_url: `/api/download?id=${encodeURIComponent(vId)}&preview=1`
        });
      }

      if (sdUrl && sdUrl !== hdUrl) {
        const sdId = cacheDownload({ format: { url: sdUrl, ext: "mp4" }, title: `${title}-SD` });
        downloads.push({
          id: sdId,
          label: "Facebook Standard MP4 Video",
          resolution: "480p / 360p (SD)",
          type: "video",
          has_audio: true,
          has_video: true,
          badge: "Standard SD",
          extension: "mp4",
          download_url: `/api/download?id=${encodeURIComponent(sdId)}`,
          preview_url: `/api/download?id=${encodeURIComponent(sdId)}&preview=1`
        });
      } else if (!hdUrl) {
        const vId = cacheDownload({ format: { url: videoUrl, ext: "mp4" }, title });
        downloads.push({
          id: vId,
          label: "Facebook MP4 Video",
          resolution: "Best MP4",
          type: "video",
          has_audio: true,
          has_video: true,
          badge: "Fast MP4",
          extension: "mp4",
          download_url: `/api/download?id=${encodeURIComponent(vId)}`,
          preview_url: `/api/download?id=${encodeURIComponent(vId)}&preview=1`
        });
      }

      const audioId = cacheDownload({
        format: { url: videoUrl, ext: "mp3", vcodec: "none", acodec: "mp3" },
        title: `${title} Audio`
      });
      const audioOption = {
        id: audioId,
        label: "Facebook High Quality Audio (MP3)",
        resolution: "320kbps MP3",
        type: "audio",
        has_audio: true,
        has_video: false,
        badge: "320kbps MP3",
        extension: "mp3",
        download_url: `/api/download?id=${encodeURIComponent(audioId)}`,
        preview_url: `/api/download?id=${encodeURIComponent(audioId)}&preview=1`
      };
      downloads.push(audioOption);

      let thumbOption = null;
      if (thumbUrl) {
        thumbOption = normalizeThumbnail(thumbUrl, title);
        if (thumbOption) {
          thumbOption.label = "Facebook HD Cover (JPG)";
          thumbOption.resolution = "HD Cover (1080p)";
          thumbOption.badge = "HD JPG Cover";
          downloads.push(thumbOption);
        }
      }

      const videoDownloads = downloads.filter(d => d.type === "video");

      return {
        title,
        thumbnail: thumbUrl || "",
        platform: "Facebook",
        platform_key: "facebook",
        platform_label: "Facebook",
        platform_icon: "FB",
        uploader: "Facebook Creator",
        duration: "HD Media",
        source_url: url,
        primary_actions: {
          high_quality: videoDownloads[0] || null,
          normal_quality: videoDownloads[1] || videoDownloads[0] || null,
          audio_mp3: audioOption,
          thumbnail_hd: thumbOption || null
        },
        downloads,
        videos: downloads
      };
    }
  }

  throw new Error("Could not extract Facebook video. Please ensure the post is public and try again.");
};

const routePlatformFallback = async (url, originalErr) => {
  if (url.includes("tiktok.com") || url.includes("vm.tiktok.com")) {
    return await fetchTikTokFallback(url);
  }
  if (url.includes("twitter.com") || url.includes("x.com") || url.includes("t.co")) {
    return await fetchTwitterFallback(url);
  }
  if (url.includes("instagram.com") || url.includes("instagr.am")) {
    return await fetchInstagramFallback(url);
  }
  if (url.includes("facebook.com") || url.includes("fb.watch") || url.includes("fb.com")) {
    return await fetchFacebookFallback(url);
  }
  if (url.includes("youtube.com") || url.includes("youtu.be")) {
    return await fetchYouTubeFallback(url);
  }
  if (originalErr) throw originalErr;
  throw new Error("This platform is not supported yet. Please try YouTube, TikTok, Instagram, Twitter, or Facebook links.");
};

export const fetchVideoDetails = async (url) => {
  if (!isHttpUrl(url)) {
    throw new Error("Please enter a valid public video URL.");
  }

  const normalized = normalizeUrl(url);

  cleanInfoCache();
  
  let data;
  const cached = videoInfoCache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.data && cached.data.downloads) {
      return cached.data;
    }
    data = cached.data;
  } else {
    // Fast path: for TikTok, Twitter, Instagram, Facebook or serverless environments, try ultra-fast direct extractors first
    const isFastSocialPlatform = /tiktok\.com|twitter\.com|x\.com|instagram\.com|instagr\.am|facebook\.com|fb\.watch/i.test(normalized);
    if (isServerless || isFastSocialPlatform) {
      try {
        const fastResult = await routePlatformFallback(normalized, null);
        const hasVideo = fastResult && Array.isArray(fastResult.downloads) && fastResult.downloads.some(d => d.type === "video");
        if (fastResult && fastResult.downloads && (hasVideo || !isFastSocialPlatform)) {
          videoInfoCache.set(normalized, {
            data: fastResult,
            expiresAt: Date.now() + INFO_CACHE_TTL_MS
          });
          return fastResult;
        }
      } catch (fastErr) {
        console.warn("[videoService] Direct fast extractor failed, falling back to yt-dlp:", fastErr.message);
      }
    }

    try {
      data = await runYtDlp(normalized);
      videoInfoCache.set(normalized, {
        data,
        expiresAt: Date.now() + INFO_CACHE_TTL_MS
      });
    } catch (err) {
      console.warn("[videoService] runYtDlp failed, trying platform fallbacks:", err.message);
      try {
        const fallbackResult = await routePlatformFallback(normalized, err);
        if (fallbackResult && fallbackResult.downloads && fallbackResult.downloads.length > 0) {
          videoInfoCache.set(normalized, {
            data: fallbackResult,
            expiresAt: Date.now() + INFO_CACHE_TTL_MS
          });
          return fallbackResult;
        }
      } catch (fbErr) {
        console.warn("[videoService] Fallback also failed:", fbErr.message);
      }
      throw err;
    }
  }

  const entries = Array.isArray(data.entries) && data.entries.length
    ? data.entries.filter(Boolean).map((e) => {
        e._successful_strategy = data._successful_strategy;
        return e;
      })
    : [data];
  let title = String(pick(data, ["title", "fulltitle", "playlist_title"]) || "Social media download");

  // Clean up title and extract likes/shares if prepended
  let parsedReactions = null;
  let parsedShares = null;
  let parsedViews = null;
  
  const twoStatsPattern = /^(?:[^\d]*\s*)?([\d.]+[KMB]?)\s*(reactions|likes|views)\s*(?:·|•|·|-|\||\s)+\s*([\d.]+[KMB]?)\s*(shares|comments|views|reactions|likes)?\s*(?:\||-)\s*(.*)/i;
  const oneStatPattern = /^(?:[^\d]*\s*)?([\d.]+[KMB]?)\s*(reactions|likes|views|shares|comments)\s*(?:\||-)\s*(.*)/i;

  let match = title.match(twoStatsPattern);
  if (match) {
    const val1 = match[1];
    const label1 = match[2].toLowerCase();
    const val2 = match[3];
    const label2 = match[4] ? match[4].toLowerCase() : "";
    title = match[5];

    if (label1.includes("reaction") || label1.includes("like")) {
      parsedReactions = val1;
    } else if (label1.includes("view")) {
      parsedViews = val1;
    }

    if (label2.includes("share") || label2.includes("comment")) {
      parsedShares = val2;
    } else if (label2.includes("reaction") || label2.includes("like")) {
      parsedReactions = val2;
    } else if (label2.includes("view")) {
      parsedViews = val2;
    }
  } else {
    match = title.match(oneStatPattern);
    if (match) {
      const val1 = match[1];
      const label1 = match[2].toLowerCase();
      title = match[3];

      if (label1.includes("reaction") || label1.includes("like")) {
        parsedReactions = val1;
      } else if (label1.includes("view")) {
        parsedViews = val1;
      } else if (label1.includes("share") || label1.includes("comment")) {
        parsedShares = val1;
      }
    }
  }

  const thumbnail =
    String(pick(data, ["thumbnail"]) || pick(entries[0], ["thumbnail"]) || pick(entries[0]?.thumbnails?.at?.(-1), ["url"]) || "");
  const platform = detectPlatform(data, entries, url);
  const creator = buildCreator(data, entries, platform.key);

  let videos = entries.flatMap((entry, entryIndex) => {
    const entryTitle = String(pick(entry, ["title", "fulltitle"]) || title);
    return collectFormats(entry)
      .map((format, optionIndex) => normalizeFormat(format, entry, entryTitle, entryIndex, optionIndex, entries.length))
      .filter(Boolean);
  });
  
  videos = videos.filter(item => {
    const ext = String(item.extension || "").toLowerCase();
    return ["mp4", "mp3", "jpg", "jpeg", "png"].includes(ext);
  });
  const sourceUrl = String(pick(data, ["webpage_url", "original_url"]) || pick(entries[0], ["webpage_url", "original_url", "url"]) || url);
  const mp3Option = sourceUrl ? cacheMp3Download({ sourceUrl, title, strategy: data._successful_strategy }) : null;
  if (mp3Option) videos.push(mp3Option);

  const thumbnailOption = normalizeThumbnail(thumbnail, title);
  if (thumbnailOption) videos.push(thumbnailOption);

  if (!videos.length) {
    throw new Error("No downloadable media links were found for this URL.");
  }
  const primaryActions = buildPrimaryActions(videos, { sourceUrl, title, strategy: data._successful_strategy });

  return {
    title,
    thumbnail,
    platform: platform.label,
    platform_key: platform.key,
    platform_label: platform.label,
    platform_icon: platform.icon,
    uploader: creator.name,
    duration: formatDuration(pick(data, ["duration"]) || pick(entries[0], ["duration"])),
    source_url: url,
    media: {
      title,
      thumbnail,
      duration: formatDuration(pick(data, ["duration"]) || pick(entries[0], ["duration"])),
      view_count: parsedViews || numberLabel(pick(data, ["view_count"]) || pick(entries[0], ["view_count"])),
      like_count: parsedReactions || numberLabel(pick(data, ["like_count"]) || pick(entries[0], ["like_count"])),
      share_count: parsedShares || numberLabel(pick(data, ["share_count"]) || pick(entries[0], ["share_count"])),
      upload_date: String(pick(data, ["upload_date"]) || pick(entries[0], ["upload_date"]) || "")
    },
    creator,
    primary_actions: primaryActions,
    downloads: videos,
    videos
  };
};

export const getCachedDownload = (id) => {
  return decryptData(id);
};

