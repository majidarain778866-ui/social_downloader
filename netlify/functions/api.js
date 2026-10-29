import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { extname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { fetchVideoDetails, getCachedDownload, pythonCmd, ytDlpArgs, getOrCreateCookiesPath } from "../../services/videoService.js";
import { resolveBundledFfmpegPath } from "../../services/bundledFfmpegPath.js";
import { chmodSync } from "node:fs";

const ffmpegPath = resolveBundledFfmpegPath();
try { chmodSync(ffmpegPath, 0o755); } catch {}
try {
  if (pythonCmd && !pythonCmd.startsWith("python")) {
    chmodSync(pythonCmd, 0o755);
  }
} catch {}

const functionDir = fileURLToPath(new URL(".", import.meta.url));
process.env.YTDLP_PYTHON_PATH ||= join(functionDir, "python");

const headers = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
  "cache-control": "no-store"
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      "content-type": "application/json; charset=utf-8"
    }
  });

const streamJson = async (producer) => {
  const encoder = new TextEncoder();
  let interval = null;
  let settled = false;

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(" "));
      interval = setInterval(() => {
        controller.enqueue(encoder.encode(" "));
      }, 2500);

      producer()
        .then((payload) => {
          if (settled) return;
          settled = true;
          if (interval) clearInterval(interval);
          controller.enqueue(encoder.encode(JSON.stringify(payload)));
          controller.close();
        })
        .catch((error) => {
          if (settled) return;
          settled = true;
          if (interval) clearInterval(interval);
          controller.enqueue(
            encoder.encode(JSON.stringify({ error: error?.message || "Something went wrong." }))
          );
          controller.close();
        });
    },
    cancel() {
      settled = true;
      if (interval) clearInterval(interval);
    }
  });

  return new Response(stream, {
    headers: {
      ...headers,
      "content-type": "application/json; charset=utf-8"
    }
  });
};

const statusForError = (error) => {
  const message = String(error?.message || "");
  if (error?.name === "AbortError" || /aborted|timeout/i.test(message)) return 504;
  if (/valid public video URL|request is too large|valid download URL|valid cached download ID/i.test(message)) return 400;
  if (/expired/i.test(message)) return 404;
  if (/private|unsupported|unavailable|needs cookies|login access|no downloadable media/i.test(message)) return 422;
  if (/yt-dlp is not installed|No module named yt_dlp/i.test(message)) return 503;
  return 500;
};

const safeFileName = (name) => {
  const str = String(name || "download")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const dotIndex = str.lastIndexOf(".");
  if (dotIndex > 0 && dotIndex > str.length - 8) {
    const ext = str.slice(dotIndex);
    const base = str.slice(0, dotIndex).slice(0, 100).trim();
    return `${base}${ext}`;
  }
  return str.slice(0, 100) || "download";
};

const contentDisposition = (filename, inline = false) => {
  const cleanName = safeFileName(filename);
  const asciiName = cleanName.replace(/[^\x20-\x7E]/g, "").trim() || "download";
  return `${inline ? "inline" : "attachment"}; filename="${asciiName.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(cleanName)}`;
};

const isHttpUrl = (value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const contentTypeFromExtension = (extension = "") => {
  const ext = extension.toLowerCase().replace(/^\./, "");
  if (["jpg", "jpeg"].includes(ext)) return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (["mp3", "m4a", "aac"].includes(ext)) return "audio/mpeg";
  if (ext === "webm") return "video/webm";
  if (ext === "mp4") return "video/mp4";
  return "application/octet-stream";
};

const extensionFromContentType = (contentType, target) => {
  const pathExtension = extname(new URL(target).pathname);
  if (pathExtension && pathExtension.length <= 8) return pathExtension;
  if (contentType.includes("audio")) return ".mp3";
  if (contentType.includes("image/jpeg")) return ".jpg";
  if (contentType.includes("image/png")) return ".png";
  if (contentType.includes("video")) return ".mp4";
  return ".bin";
};

const handleVideoInfo = async (req) => {
  const body = await req.json().catch(() => ({}));
  try {
    const data = await fetchVideoDetails(body.url);
    return json(data);
  } catch (error) {
    return json({ error: error.message || "Failed to fetch video details" }, statusForError(error));
  }
};

const streamYtDlpDownload = async (cached, inline = false) => {
  const tempDir = await mkdtemp(join(tmpdir(), "social-downloader-"));
  const outputTemplate = join(tempDir, "download.%(ext)s");
  const isAudioMp3 = cached.type === "audio" && cached.ext === "mp3";
  const cookiesPath = getOrCreateCookiesPath();
  const useCookies = cached.useCookies !== false;
  const useImpersonate = cached.useImpersonate !== false;
  const args = [
    ...ytDlpArgs,
    "--no-warnings",
    "--no-check-certificate",
    "--no-cache-dir",
    "--js-runtimes", "node"
  ];

  if (ffmpegPath && ffmpegPath !== "ffmpeg") {
    args.push("--ffmpeg-location", ffmpegPath);
  }

  if (useImpersonate) {
    args.push("--impersonate", "chrome");
  }

  if (useCookies && cookiesPath) {
    args.push("--cookies", cookiesPath);
  }

  if (cached.playerClient) {
    args.push("--extractor-args", `youtube:player_client=${cached.playerClient}`);
  }

  if (isAudioMp3) {
    args.push(
      "-f",
      cached.formatSelector || "bestaudio/best",
      "-x",
      "--audio-format",
      "mp3",
      "--audio-quality",
      "0"
    );
  } else {
    args.push(
      "--merge-output-format",
      "mp4",
      "--remux-video",
      "mp4",
      "-f",
      cached.formatSelector || cached.formatId || "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/best",
      "--postprocessor-args",
      "Merger:-c:a aac -strict -2"
    );
  }

  args.push("-o", outputTemplate, cached.sourceUrl);
  const child = spawn(pythonCmd, args, {
    env: {
      ...process.env,
      PYTHONPATH: [process.env.YTDLP_PYTHON_PATH, process.env.PYTHONPATH].filter(Boolean).join(process.platform === "win32" ? ";" : ":")
    },
    windowsHide: true,
    stdio: ["ignore", "ignore", "pipe"]
  });
  const chunks = [];
  child.stderr.on("data", (chunk) => chunks.push(chunk));

  try {
    await new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("close", (code) => {
        const logs = Buffer.concat(chunks).toString("utf8").trim();
        if (logs.includes("WARNING:") || logs.includes("ERROR:")) {
          console.error("yt-dlp logs:", logs);
        }
        if (code === 0) resolve();
        else reject(new Error(logs || "yt-dlp download failed."));
      });
    });

    const files = await readdir(tempDir);
    const completedFiles = await Promise.all(
      files
        .filter((file) => !file.endsWith(".part") && !file.endsWith(".ytdl"))
        .map(async (file) => {
          const path = join(tempDir, file);
          const fileStat = await stat(path);
          return fileStat.isFile() ? { path, fileStat } : null;
        })
    );
    const targetFile = join(tempDir, `download.${cached.ext || "mp4"}`);
    const output = completedFiles.filter(Boolean).find((f) => f.path === targetFile) || 
                   completedFiles.filter(Boolean).sort((a, b) => b.fileStat.size - a.fileStat.size)[0];
    if (!output) throw new Error("yt-dlp did not produce a downloadable file.");

    const actualExtension = extname(output.path).slice(1) || cached.ext;
    const stream = createReadStream(output.path);
    stream.on("close", () => rm(tempDir, { recursive: true, force: true }).catch(() => {}));

    return new Response(Readable.toWeb(stream), {
      headers: {
        ...headers,
        "content-type": contentTypeFromExtension(actualExtension),
        "content-disposition": contentDisposition(cached.filename, inline),
        "content-length": String(output.fileStat.size)
      }
    });
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }
};

const handleDownload = async (req) => {
  const requestUrl = new URL(req.url);
  const id = requestUrl.searchParams.get("id");
  const inline = requestUrl.searchParams.get("preview") === "1";
  const cached = id ? getCachedDownload(id) : null;

  if (!id) return json({ error: "A valid cached download ID is required." }, 400);
  if (!cached) return json({ error: "This download link expired. Fetch the video again." }, 404);
  if (cached.requiresYtDlp) {
    if (cached.url && isHttpUrl(cached.url) && cached.url !== cached.sourceUrl) {
      // Has direct media URL candidate, continue to proxy/redirect
    } else {
      try {
        return await streamYtDlpDownload(cached, inline);
      } catch (dlErr) {
        console.error("streamYtDlpDownload failed:", dlErr.message);
        if (cached.url && isHttpUrl(cached.url) && cached.url !== cached.sourceUrl) {
          return Response.redirect(cached.url, 302);
        }
        return json({ error: dlErr?.message || "Download processing failed." }, 500);
      }
    }
  }
  if (!cached.url || !isHttpUrl(cached.url)) return json({ error: "A valid download URL is required." }, 400);

  const upstream = await fetch(cached.url, {
    headers: cached.headers,
    redirect: "follow"
  });

  if (!upstream.ok || !upstream.body) {
    // If proxy fails due to IP block or 403, fallback to direct redirect
    return Response.redirect(cached.url, 302);
  }

  const contentType = upstream.headers.get("content-type") || "application/octet-stream";
  if (contentType.toLowerCase().includes("text/html") || contentType.toLowerCase().includes("application/json")) {
    return json({ error: "Direct media stream could not be loaded. Please re-fetch and try another resolution." }, 502);
  }
  const rawExt = (extensionFromContentType(contentType, cached.url) || `.${cached.ext || "mp4"}`).replace(/^\./, "");
  let baseName = String(cached.filename || "download").replace(/[<>:"/\\|?*\x00-\x1F]/g, "").trim().replace(/\.+$/, "");
  const knownExtRegex = /\.(mp4|mp3|m4a|webm|jpg|jpeg|png|webp)$/i;
  const finalName = knownExtRegex.test(baseName) ? baseName : `${baseName}.${cached.ext || rawExt || "mp4"}`;

  return new Response(upstream.body, {
    headers: {
      ...headers,
      "content-type": contentType,
      "content-disposition": contentDisposition(finalName, inline)
    }
  });
};

export default async (req) => {
  if (req.method === "OPTIONS") return new Response("", { headers });

  try {
    const { pathname } = new URL(req.url);
    if (pathname === "/api/video-info" && req.method === "POST") return await handleVideoInfo(req);
    if (pathname === "/api/download" && req.method === "GET") return await handleDownload(req);
    return json({ error: "Not found" }, 404);
  } catch (error) {
    console.error(error);
    return json({ error: error?.message || "Something went wrong." }, statusForError(error));
  }
};

export const config = {
  path: ["/api/video-info", "/api/download"]
};
