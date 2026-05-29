// Lazy-loaded, browser-only conversion using local ffmpeg.wasm assets.
import type { FFmpeg } from "@ffmpeg/ffmpeg";

export type ConversionResult = {
  blob: Blob;
  ext: "mp4" | "mp3" | "m4a" | "mov" | "webm" | "mkv" | "avi";
  mimeType: string;
  converted: boolean;
  note?: string;
};

let ffmpegPromise: Promise<FFmpeg> | null = null;
let jobId = 0;
let conversionQueue: Promise<unknown> = Promise.resolve();
const recentLogs: string[] = [];

async function getFFmpeg(): Promise<FFmpeg> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const ff = new FFmpeg();
      ff.on("log", ({ message }) => {
        recentLogs.push(message);
        if (recentLogs.length > 30) recentLogs.shift();
        console.debug("[ffmpeg]", message);
      });
      await ff.load({
        coreURL: "/ffmpeg/ffmpeg-core.js",
        wasmURL: "/ffmpeg/ffmpeg-core.wasm",
      });
      return ff;
    })().catch((error) => {
      ffmpegPromise = null;
      throw error;
    });
  }
  return ffmpegPromise;
}

function resetFFmpeg() {
  ffmpegPromise?.then((ff) => ff.terminate()).catch(() => {});
  ffmpegPromise = null;
  recentLogs.length = 0;
}

function queueConversion<T>(work: () => Promise<T>): Promise<T> {
  const run = conversionQueue.then(work, work);
  conversionQueue = run.catch(() => {});
  return run;
}

function extensionFor(input: Blob): ConversionResult["ext"] {
  if (input instanceof File) {
    const match = input.name.match(/\.([a-z0-9]+)$/i);
    const ext = match?.[1]?.toLowerCase();
    if (["mp4", "mp3", "m4a", "mov", "webm", "mkv", "avi"].includes(ext ?? "")) {
      return ext as ConversionResult["ext"];
    }
  }
  const type = input.type.toLowerCase();
  if (type.includes("quicktime")) return "mov";
  if (type.includes("mp4")) return "mp4";
  if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
  if (type.includes("x-matroska")) return "mkv";
  if (type.includes("avi")) return "avi";
  return "webm";
}

function mimeForExt(ext: ConversionResult["ext"]): string {
  switch (ext) {
    case "mp4":
      return "video/mp4";
    case "mp3":
      return "audio/mpeg";
    case "m4a":
      return "audio/mp4";
    case "mov":
      return "video/quicktime";
    case "mkv":
      return "video/x-matroska";
    case "avi":
      return "video/x-msvideo";
    default:
      return "video/webm";
  }
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isMp4File(input: Blob): boolean {
  const type = input.type.toLowerCase();
  return type.includes("mp4") || (input instanceof File && /\.(mp4|m4v)$/i.test(input.name));
}

function isMp4Like(input: Blob): boolean {
  const type = input.type.toLowerCase();
  if (type.includes("mp4") || type.includes("quicktime")) return true;
  return input instanceof File && /\.(mp4|mov|m4v)$/i.test(input.name);
}

function blobFromData(data: Awaited<ReturnType<FFmpeg["readFile"]>>, type: string): Blob {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const copy = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new Blob([copy], { type });
}

function userFriendlyError(error: unknown): Error {
  const raw = error instanceof Error ? error.message : String(error);
  const tail = recentLogs.slice(-6).join("\n");
  const combined = `${raw}\n${tail}`.toLowerCase();
  if (
    combined.includes("output file does not contain any stream") ||
    combined.includes("matches no streams")
  ) {
    return new Error("No usable audio or video track was found in that file.");
  }
  if (
    combined.includes("memory") ||
    combined.includes("aborted") ||
    combined.includes("runtimeerror")
  ) {
    return new Error(
      "This device ran out of conversion memory before it could make an iPhone-compatible file.",
    );
  }
  return new Error("Conversion failed before an iPhone-compatible file could be created.");
}

async function mountInput(ff: FFmpeg, input: Blob, id: number) {
  const { FFFSType } = await import("@ffmpeg/ffmpeg");
  const dir = `/input-${id}`;
  const name = `source.${extensionFor(input)}`;
  await ff.createDir(dir);
  await ff.mount(FFFSType.WORKERFS, { blobs: [{ name, data: input }] }, dir);
  return {
    path: `${dir}/${name}`,
    cleanup: async () => {
      await ff.unmount(dir).catch(() => {});
      await ff.deleteDir(dir).catch(() => {});
    },
  };
}

async function runConversion(
  input: Blob,
  args: string[],
  outputExt: ConversionResult["ext"],
  type: string,
): Promise<Blob> {
  return queueConversion(async () => {
    const ff = await getFFmpeg();
    const { fetchFile } = await import("@ffmpeg/util");
    const id = ++jobId;
    const outputName = `out-${id}.${outputExt}`;
    let cleanupInput: (() => Promise<void>) | null = null;
    let inputPath = `in-${id}.${extensionFor(input)}`;

    try {
      try {
        const mounted = await mountInput(ff, input, id);
        inputPath = mounted.path;
        cleanupInput = mounted.cleanup;
      } catch (mountError) {
        console.warn("[convert] WORKERFS mount failed; falling back to memory input", mountError);
        await ff.writeFile(inputPath, await fetchFile(input));
        cleanupInput = async () => {
          await ff.deleteFile(inputPath).catch(() => {});
        };
      }

      const code = await ff.exec(["-hide_banner", "-i", inputPath, ...args, outputName]);
      if (code !== 0) throw new Error(`FFmpeg exited with code ${code}`);
      const data = await ff.readFile(outputName);
      return blobFromData(data, type);
    } catch (error) {
      const message =
        error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      if (
        message.includes("aborted") ||
        message.includes("memory") ||
        message.includes("runtimeerror")
      )
        resetFFmpeg();
      throw userFriendlyError(error);
    } finally {
      await cleanupInput?.();
      await ff.deleteFile(outputName).catch(() => {});
    }
  });
}

function mp4TranscodeArgs(opts?: {
  mirror?: boolean;
  width?: number;
  crf?: number;
  audio?: boolean;
  audioBitrate?: string;
}): string[] {
  const width = opts?.width ?? (isIOS() ? 540 : 854);
  const vf = [
    ...(opts?.mirror ? ["hflip"] : []),
    `scale=w=trunc(min(${width}\\,iw)/2)*2:h=-2`,
  ].join(",");
  return [
    "-map",
    "0:v:0",
    ...(opts?.audio === false ? [] : ["-map", "0:a?"]),
    "-vf",
    vf,
    "-c:v",
    "libx264",
    "-profile:v",
    "baseline",
    "-level",
    "3.1",
    "-preset",
    "ultrafast",
    "-crf",
    String(opts?.crf ?? (isIOS() ? 32 : 29)),
    "-pix_fmt",
    "yuv420p",
    "-tag:v",
    "avc1",
    "-threads",
    "1",
    ...(opts?.audio === false
      ? ["-an"]
      : ["-c:a", "aac", "-b:a", opts?.audioBitrate ?? "96k", "-ac", "2"]),
    "-movflags",
    "+faststart",
    "-f",
    "mp4",
  ];
}

function originalResult(input: Blob, note?: string): ConversionResult {
  const ext = extensionFor(input);
  return { blob: input, ext, mimeType: input.type || mimeForExt(ext), converted: false, note };
}

export async function videoToMp4(
  input: Blob,
  opts?: { mirror?: boolean },
): Promise<ConversionResult> {
  if (isMp4File(input) && !opts?.mirror) {
    return {
      blob: input,
      ext: "mp4",
      mimeType: input.type || "video/mp4",
      converted: false,
      note: "Already MP4 — downloaded instantly.",
    };
  }

  if (isMp4Like(input) && !opts?.mirror) {
    try {
      const blob = await runConversion(
        input,
        ["-map", "0:v:0?", "-map", "0:a?", "-c", "copy", "-movflags", "+faststart", "-f", "mp4"],
        "mp4",
        "video/mp4",
      );
      return { blob, ext: "mp4", mimeType: "video/mp4", converted: true };
    } catch (error) {
      console.warn("[convert] MP4/MOV rewrap failed; returning original", error);
      return originalResult(
        input,
        "This phone could not rewrap the clip, so the original file was downloaded instead.",
      );
    }
  }

  const profiles =
    isIOS() || input.size > 75 * 1024 * 1024
      ? [
          { width: 540, crf: 32, audioBitrate: "96k", audio: true },
          { width: 426, crf: 35, audioBitrate: "64k", audio: true },
          { width: 426, crf: 36, audio: false },
        ]
      : [
          { width: 854, crf: 29, audioBitrate: "128k", audio: true },
          { width: 640, crf: 32, audioBitrate: "96k", audio: true },
          { width: 426, crf: 35, audio: false },
        ];

  for (const profile of profiles) {
    try {
      const blob = await runConversion(
        input,
        mp4TranscodeArgs({ ...profile, mirror: opts?.mirror }),
        "mp4",
        "video/mp4",
      );
      return { blob, ext: "mp4", mimeType: "video/mp4", converted: true };
    } catch (error) {
      console.warn("[convert] MP4 transcode profile failed", profile, error);
    }
  }

  throw new Error(
    isIOS()
      ? "This iPhone could not finish converting that WebM. Use a shorter clip, or convert it on a desktop and then use Save to Photos."
      : "This file could not be converted into an iPhone-compatible MP4.",
  );
}

export async function videoToMp3(input: Blob): Promise<ConversionResult> {
  try {
    const blob = await runConversion(
      input,
      [
        "-vn",
        "-map",
        "0:a:0",
        "-c:a",
        "libmp3lame",
        "-b:a",
        isIOS() ? "128k" : "192k",
        "-f",
        "mp3",
      ],
      "mp3",
      "audio/mpeg",
    );
    return { blob, ext: "mp3", mimeType: "audio/mpeg", converted: true };
  } catch (mp3Error) {
    console.warn("[convert] MP3 encode failed; trying M4A fallback", mp3Error);
  }

  try {
    const blob = await runConversion(
      input,
      ["-vn", "-map", "0:a:0", "-c:a", "copy", "-f", "ipod"],
      "m4a",
      "audio/mp4",
    );
    return {
      blob,
      ext: "m4a",
      mimeType: "audio/mp4",
      converted: true,
      note: "MP3 failed on this device, so audio was saved as M4A instead.",
    };
  } catch (copyError) {
    console.warn("[convert] M4A copy failed; trying AAC encode fallback", copyError);
  }

  const blob = await runConversion(
    input,
    ["-vn", "-map", "0:a:0", "-c:a", "aac", "-b:a", "128k", "-f", "ipod"],
    "m4a",
    "audio/mp4",
  );
  return {
    blob,
    ext: "m4a",
    mimeType: "audio/mp4",
    converted: true,
    note: "MP3 failed on this device, so audio was saved as M4A instead.",
  };
}

export const webmToMp4 = videoToMp4;
