import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

const require = createRequire(import.meta.url);

let ffmpeg = null;
let ffprobe = null;

try {
  ffmpeg = require("@ffmpeg-installer/ffmpeg");
} catch {
  // Gracefully ignored if platform binary package is missing on serverless runtime
}

try {
  ffprobe = require("@ffprobe-installer/ffprobe");
} catch {
  // Gracefully ignored if platform binary package is missing on serverless runtime
}

export const resolveLocalFfmpegPath = () => {
  const netlifyBinFfmpeg = join(process.cwd(), "netlify", "functions", "bin", "ffmpeg");
  if (existsSync(netlifyBinFfmpeg)) {
    return netlifyBinFfmpeg;
  }

  if (process.platform !== "win32") {
    try {
      execSync("ffmpeg -version", { stdio: "ignore" });
      return "ffmpeg";
    } catch {
      // fallback
    }
  }
  return ffmpeg?.path || "ffmpeg";
};

export const getFfmpegEnv = () => {
  const env = { ...process.env };
  const pathKey = Object.keys(env).find((k) => k.toLowerCase() === "path") || "PATH";

  const extraPaths = [];

  const netlifyBinDir = join(process.cwd(), "netlify", "functions", "bin");
  if (existsSync(netlifyBinDir)) {
    extraPaths.push(netlifyBinDir);
  }

  if (ffmpeg && ffmpeg.path) {
    try {
      extraPaths.push(dirname(ffmpeg.path));
    } catch {}
  }
  if (ffprobe && ffprobe.path) {
    try {
      extraPaths.push(dirname(ffprobe.path));
    } catch {}
  }

  if (extraPaths.length > 0) {
    env[pathKey] = [...extraPaths, env[pathKey]].filter(Boolean).join(process.platform === "win32" ? ";" : ":");
  }
  return env;
};
