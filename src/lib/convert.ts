// Lazy-loaded webm → mp4 conversion using ffmpeg.wasm (single-thread, no SAB needed).
import type { FFmpeg } from "@ffmpeg/ffmpeg";

let ffmpegPromise: Promise<FFmpeg> | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const { toBlobURL } = await import("@ffmpeg/util");
      const ff = new FFmpeg();
      const base = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";
      await ff.load({
        coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
      });
      return ff;
    })();
  }
  return ffmpegPromise;
}

export async function webmToMp4(input: Blob, opts?: { mirror?: boolean }): Promise<Blob> {
  const ff = await getFFmpeg();
  const { fetchFile } = await import("@ffmpeg/util");
  const inputName = "in.webm";
  const outputName = "out.mp4";
  await ff.writeFile(inputName, await fetchFile(input));
  const args = ["-i", inputName];
  if (opts?.mirror) args.push("-vf", "hflip");
  // Re-encode video for broad compatibility; copy audio when possible.
  args.push("-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", outputName);
  await ff.exec(args);
  const data = await ff.readFile(outputName);
  await ff.deleteFile(inputName).catch(() => {});
  await ff.deleteFile(outputName).catch(() => {});
  const arr = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data as ArrayBuffer);
  return new Blob([arr], { type: "video/mp4" });
}
