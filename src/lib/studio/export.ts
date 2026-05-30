// MP4 export pipeline: render each video clip to an intermediate MP4 (with its
// audio, speed, crop, fades, overlays burned in), concat, then mix voice/music.
// Runs entirely in the browser via ffmpeg.wasm.

import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { ASPECT_DIMS, type Project, projectDuration } from "./types";

let ffmpegPromise: Promise<FFmpeg> | null = null;
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

function escDrawtext(s: string): string {
  return s
    .replace(/\\/g, "\\\\\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\u2019")
    .replace(/\n/g, " ");
}

export type ExportProgress = (msg: string, ratio?: number) => void;

export async function exportProjectToMp4(
  project: Project,
  onProgress: ExportProgress = () => {},
): Promise<Blob> {
  const ff = await getFFmpeg();
  const { fetchFile } = await import("@ffmpeg/util");
  const { w, h } = ASPECT_DIMS[project.aspect];
  const totalDuration = Math.max(projectDuration(project), 1);

  // Write assets to FS
  onProgress("Loading assets...");
  const assetPath = new Map<string, string>();
  for (const a of project.assets) {
    const name = `${a.id}.${a.mime.includes("audio") ? "audio" : "video"}`;
    await ff.writeFile(name, await fetchFile(a.url));
    assetPath.set(a.id, name);
  }

  // Render each video segment to a clip file at target WxH, with overlays+subs
  // that fall within its time range burned in.
  const segmentFiles: string[] = [];
  let i = 0;
  for (const clip of project.video) {
    i++;
    onProgress(`Rendering segment ${i}/${project.video.length}...`, i / Math.max(project.video.length, 1) * 0.7);
    const out = `seg_${i}.mp4`;
    const args: string[] = ["-y"];
    const hasSource = clip.assetId && assetPath.has(clip.assetId);

    if (hasSource) {
      const src = assetPath.get(clip.assetId!)!;
      // Pull source from inPoint for (duration * speed) seconds, then atempo+setpts.
      args.push("-ss", String(clip.inPoint), "-t", String(clip.duration * clip.speed), "-i", src);
    } else {
      // Blank black video + silent audio
      args.push("-f", "lavfi", "-i", `color=c=black:s=${w}x${h}:r=30:d=${clip.duration}`);
      args.push("-f", "lavfi", "-i", `anullsrc=channel_layout=stereo:sample_rate=44100`);
    }

    // Build video filter
    const vf: string[] = [];
    // scale & crop with zoom/pan
    const zoom = Math.max(1, clip.zoom);
    const scaleW = Math.round(w * zoom);
    const scaleH = Math.round(h * zoom);
    vf.push(`scale=${scaleW}:${scaleH}:force_original_aspect_ratio=increase`);
    // Crop window
    const cropX = Math.round(((scaleW - w) / 2) * (1 + clip.panX));
    const cropY = Math.round(((scaleH - h) / 2) * (1 + clip.panY));
    vf.push(`crop=${w}:${h}:${cropX}:${cropY}`);
    // Speed (video)
    if (clip.speed !== 1) {
      vf.push(`setpts=${(1 / clip.speed).toFixed(4)}*PTS`);
    }
    // Fades on the clip itself
    if (clip.fadeIn > 0) vf.push(`fade=t=in:st=0:d=${clip.fadeIn}`);
    if (clip.fadeOut > 0) vf.push(`fade=t=out:st=${Math.max(0, clip.duration - clip.fadeOut)}:d=${clip.fadeOut}`);

    // Overlays + subtitles that intersect this clip
    const clipEnd = clip.start + clip.duration;
    const burnIns: { text: string; start: number; end: number; y: string; box: boolean; color: string; size: number }[] = [];
    for (const o of project.overlays) {
      const oEnd = o.start + o.duration;
      if (oEnd <= clip.start || o.start >= clipEnd) continue;
      const localStart = Math.max(0, o.start - clip.start);
      const localEnd = Math.min(clip.duration, oEnd - clip.start);
      burnIns.push({
        text: o.text,
        start: localStart,
        end: localEnd,
        y: o.position === "top" ? "h*0.08" : o.position === "bottom" ? "h-text_h-h*0.08" : "(h-text_h)/2",
        box: true,
        color: o.textColor,
        size: Math.max(20, Math.round(o.fontSize * (h / 1080))),
      });
    }
    for (const s of project.subtitles) {
      const sEnd = s.start + s.duration;
      if (sEnd <= clip.start || s.start >= clipEnd) continue;
      const localStart = Math.max(0, s.start - clip.start);
      const localEnd = Math.min(clip.duration, sEnd - clip.start);
      burnIns.push({
        text: s.text,
        start: localStart,
        end: localEnd,
        y: "h-text_h-h*0.06",
        box: true,
        color: "white",
        size: Math.max(28, Math.round(48 * (h / 1080))),
      });
    }
    for (const b of burnIns) {
      vf.push(
        `drawtext=text='${escDrawtext(b.text)}':fontcolor=${b.color}:fontsize=${b.size}:x=(w-text_w)/2:y=${b.y}:box=1:boxcolor=black@0.55:boxborderw=20:enable='between(t,${b.start.toFixed(3)},${b.end.toFixed(3)})'`,
      );
    }

    // Audio filter
    const af: string[] = [];
    if (hasSource) {
      if (clip.speed !== 1) {
        // atempo supports 0.5..2; chain for extremes
        let s = clip.speed;
        const chain: number[] = [];
        while (s > 2.0) { chain.push(2); s /= 2; }
        while (s < 0.5) { chain.push(0.5); s /= 0.5; }
        chain.push(s);
        if (clip.preservePitch) {
          af.push(chain.map((x) => `atempo=${x.toFixed(4)}`).join(","));
        } else {
          // Change pitch: resample then reset
          af.push(`asetrate=44100*${clip.speed.toFixed(4)},aresample=44100`);
        }
      }
    }

    args.push("-vf", vf.join(","));
    if (af.length) args.push("-af", af.join(","));
    args.push(
      "-r", "30",
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "128k",
      "-ar", "44100",
      "-ac", "2",
      "-t", String(clip.duration),
      "-shortest",
      out,
    );
    const code = await ff.exec(args);
    if (code !== 0) throw new Error(`Failed to render segment ${i}`);
    segmentFiles.push(out);
  }

  // Concat segments
  onProgress("Stitching segments...", 0.75);
  let videoBaseFile = "video_base.mp4";
  if (segmentFiles.length === 0) {
    // Pure audio project, generate black video for total duration
    await ff.exec([
      "-y",
      "-f", "lavfi", "-i", `color=c=black:s=${w}x${h}:r=30:d=${totalDuration}`,
      "-f", "lavfi", "-i", `anullsrc=channel_layout=stereo:sample_rate=44100`,
      "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-shortest",
      videoBaseFile,
    ]);
  } else if (segmentFiles.length === 1) {
    videoBaseFile = segmentFiles[0];
  } else {
    const list = segmentFiles.map((f) => `file '${f}'`).join("\n");
    await ff.writeFile("concat.txt", new TextEncoder().encode(list));
    const code = await ff.exec([
      "-y", "-f", "concat", "-safe", "0", "-i", "concat.txt",
      "-c", "copy", videoBaseFile,
    ]);
    if (code !== 0) throw new Error("Failed to concatenate segments");
  }

  // Mix in voice + music tracks
  const audioInputs: AudioInput[] = [];
  for (const v of project.voice) {
    if (!assetPath.has(v.assetId)) continue;
    audioInputs.push({ ...v, file: assetPath.get(v.assetId)! });
  }
  for (const m of project.music) {
    if (!assetPath.has(m.assetId)) continue;
    audioInputs.push({ ...m, file: assetPath.get(m.assetId)! });
  }

  const finalOut = "final.mp4";
  if (audioInputs.length === 0) {
    onProgress("Finalizing...", 0.95);
    // Just rename / re-encode to ensure faststart
    await ff.exec([
      "-y", "-i", videoBaseFile,
      "-c:v", "copy", "-c:a", "aac",
      "-movflags", "+faststart",
      finalOut,
    ]);
  } else {
    onProgress("Mixing audio...", 0.85);
    const args = ["-y", "-i", videoBaseFile];
    audioInputs.forEach((a) => {
      args.push("-ss", String(a.inPoint), "-t", String(a.duration), "-i", a.file);
    });
    // Filter complex: delay each external input to its start, set volume, then amix with original
    const parts: string[] = [];
    const labels: string[] = ["[0:a]"];
    audioInputs.forEach((a, idx) => {
      const inLabel = `[${idx + 1}:a]`;
      const outLabel = `[a${idx}]`;
      const delayMs = Math.round(a.start * 1000);
      const fades: string[] = [];
      if (a.fadeIn > 0) fades.push(`afade=t=in:st=0:d=${a.fadeIn}`);
      if (a.fadeOut > 0) fades.push(`afade=t=out:st=${Math.max(0, a.duration - a.fadeOut)}:d=${a.fadeOut}`);
      const chain = [
        `volume=${a.volume.toFixed(3)}`,
        ...fades,
        `adelay=${delayMs}|${delayMs}`,
      ].join(",");
      parts.push(`${inLabel}${chain}${outLabel}`);
      labels.push(outLabel);
    });
    parts.push(`${labels.join("")}amix=inputs=${labels.length}:normalize=0:duration=longest[aout]`);
    args.push(
      "-filter_complex", parts.join(";"),
      "-map", "0:v",
      "-map", "[aout]",
      "-c:v", "copy",
      "-c:a", "aac", "-b:a", "192k",
      "-movflags", "+faststart",
      "-shortest",
      finalOut,
    );
    const code = await ff.exec(args);
    if (code !== 0) throw new Error("Failed to mix audio");
  }

  onProgress("Reading output...", 0.99);
  const data = await ff.readFile(finalOut);
  const buf = typeof data === "string" ? new TextEncoder().encode(data) : data;
  // Cleanup output files (keep ffmpeg alive)
  for (const f of [...segmentFiles, "video_base.mp4", "final.mp4", "concat.txt"]) {
    await ff.deleteFile(f).catch(() => {});
  }
  onProgress("Done", 1);
  const copy = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  return new Blob([copy], { type: "video/mp4" });
}

type AudioInput = {
  file: string;
  start: number;
  duration: number;
  inPoint: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
};
