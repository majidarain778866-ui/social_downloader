import { getCachedDownload } from "../services/videoService.js";
import { Readable } from "node:stream";

const safeFileName = (name) => {
  const str = String(name || "social-download")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const dotIndex = str.lastIndexOf(".");
  if (dotIndex > 0 && dotIndex > str.length - 8) {
    const ext = str.slice(dotIndex);
    const base = str.slice(0, dotIndex).slice(0, 100).trim();
    return `${base}${ext}`;
  }
  return str.slice(0, 100) || "social-download";
};

const contentDisposition = (filename) => {
  const cleanName = safeFileName(filename);
  const asciiName = cleanName.replace(/[^\x20-\x7E]/g, "").trim() || "download";
  return `attachment; filename="${asciiName.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(cleanName)}`;
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { id, preview } = req.query || {};

  if (!id) {
    return res.status(400).json({ error: "Missing download ID." });
  }

  let cached = null;
  try {
    cached = getCachedDownload(id);
  } catch (err) {
    console.error("[Download] Decryption failed:", err?.message);
    cached = null;
  }

  if (!cached) {
    return res.status(404).json({ error: "Download link expired. Please fetch the video again." });
  }

  const targetUrl = cached.url || cached.sourceUrl;

  if (!targetUrl || !targetUrl.startsWith("http")) {
    return res.status(400).json({ error: "No direct media URL found. Please re-fetch the video." });
  }

  let baseName = String(cached.filename || "social-download").replace(/[<>:"/\\|?*\x00-\x1F]/g, "").trim().replace(/\.+$/, "");
  const knownExtRegex = /\.(mp4|mp3|m4a|webm|jpg|jpeg|png|webp)$/i;
  const filename = knownExtRegex.test(baseName) ? baseName : `${baseName}.${cached.ext || "mp4"}`;

  try {
    const upstream = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        ...(cached.headers || {})
      }
    });

    if (!upstream.ok || !upstream.body) {
      return res.redirect(302, targetUrl);
    }

    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    const contentLength = upstream.headers.get("content-length");

    // Prevent HTML web pages or JSON error responses from being sent as .mp4 downloads
    if (contentType.toLowerCase().includes("text/html") || contentType.toLowerCase().includes("application/json")) {
      console.warn(`[Download] Upstream returned non-media content-type: ${contentType}.`);
      return res.status(502).json({ error: "Direct media stream could not be loaded. Please re-fetch and try another resolution." });
    }

    res.status(200);
    res.setHeader("Content-Type", contentType);
    if (preview !== "1") {
      res.setHeader("Content-Disposition", contentDisposition(filename));
    } else {
      res.setHeader("Content-Disposition", `inline; filename="${safeFileName(filename)}"`);
    }
    if (contentLength) {
      res.setHeader("Content-Length", contentLength);
    }

    const nodeStream = Readable.fromWeb(upstream.body);
    nodeStream.pipe(res);
  } catch (err) {
    console.error("[Download API Proxy Error]:", err?.message);
    return res.redirect(302, targetUrl);
  }
}
