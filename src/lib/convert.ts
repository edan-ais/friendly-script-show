// Lazy-loaded video → mp4 conversion using local ffmpeg.wasm assets.
import type { FFmpeg } from "@ffmpeg/ffmpeg";

let ffmpegPromise: Promise<FFmpeg> | null = null;
let jobId = 0;

async function getFFmpeg(): Promise<FFmpeg> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const ff = new FFmpeg();
      ff.on("log", ({ message }) => console.debug("[ffmpeg]", message));
      await ff.load({
        coreURL: "/ffmpeg/ffmpeg-core.js",
        wasmURL: "/ffmpeg/ffmpeg-core.wasm",
      });
      return ff;
    })();
  }
  return ffmpegPromise;
}

function extensionFor(input: Blob): string {
  if (input instanceof File) {
    const match = input.name.match(/\.([a-z0-9]+)$/i);
    if (match) return match[1].toLowerCase();
  }
  if (input.type.includes("quicktime")) return "mov";
  if (input.type.includes("mp4")) return "mp4";
  if (input.type.includes("x-matroska")) return "mkv";
  return "webm";
}

async function runConversion(input: Blob, args: string[], outputName: string): Promise<Blob> {
  const ff = await getFFmpeg();
  const { fetchFile } = await import("@ffmpeg/util");
  const id = ++jobId;
  const inputName = `in-${id}.${extensionFor(input)}`;
  await ff.writeFile(inputName, await fetchFile(input));
  try {
    const code = await ff.exec(["-i", inputName, ...args, outputName]);
    if (code !== 0) throw new Error(`FFmpeg exited with code ${code}`);
    const data = await ff.readFile(outputName);
    const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
    return new Blob([bytes], { type: "video/mp4" });
  } finally {
    await ff.deleteFile(inputName).catch(() => {});
    await ff.deleteFile(outputName).catch(() => {});
  }
}

export async function videoToMp4(input: Blob, opts?: { mirror?: boolean }): Promise<Blob> {
  const outputName = `out-${jobId + 1}.mp4`;
  const args = ["-map", "0:v:0", "-map", "0:a?", ...(opts?.mirror ? ["-vf", "hflip"] : []), "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart"];
  return runConversion(input, args, outputName);
}

export async function videoToMp3(input: Blob): Promise<Blob> {
  const outputName = `out-${jobId + 1}.mp3`;
  const ff = await getFFmpeg();
  const { fetchFile } = await import("@ffmpeg/util");
  const id = ++jobId;
  const inputName = `in-${id}.${extensionFor(input)}`;
  await ff.writeFile(inputName, await fetchFile(input));
  try {
    const code = await ff.exec(["-i", inputName, "-vn", "-map", "0:a:0?", "-c:a", "libmp3lame", "-b:a", "192k", outputName]);
    if (code !== 0) throw new Error(`FFmpeg exited with code ${code}`);
    const data = await ff.readFile(outputName);
    const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
    return new Blob([bytes], { type: "audio/mpeg" });
  } finally {
    await ff.deleteFile(inputName).catch(() => {});
    await ff.deleteFile(outputName).catch(() => {});
  }
}

export const webmToMp4 = videoToMp4;
