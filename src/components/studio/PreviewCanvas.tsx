import { useEffect, useRef, useState } from "react";
import { ASPECT_DIMS, type Project, type VideoClip } from "@/lib/studio/types";

type Props = {
  project: Project;
  playhead: number;
  playing: boolean;
};

// Picks the video clip active at time t (or just before).
function activeVideo(project: Project, t: number): VideoClip | null {
  for (const c of project.video) {
    if (t >= c.start && t < c.start + c.duration) return c;
  }
  return project.video[project.video.length - 1] ?? null;
}

export function PreviewCanvas({ project, playhead, playing }: Props) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videosRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const audiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const [mediaVersion, setMediaVersion] = useState(0);
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number } | null>(null);
  const { w, h } = ASPECT_DIMS[project.aspect];

  // Size the displayed canvas explicitly so portrait formats fit inside the preview pane.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const updateSize = () => {
      const bounds = frame.getBoundingClientRect();
      const scale = Math.min(bounds.width / w, bounds.height / h);
      if (!Number.isFinite(scale) || scale <= 0) return;
      setDisplaySize({
        width: Math.floor(w * scale),
        height: Math.floor(h * scale),
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [w, h]);

  // Ensure media elements exist for each asset
  useEffect(() => {
    const vmap = videosRef.current;
    const amap = audiosRef.current;
    const seenV = new Set<string>();
    const seenA = new Set<string>();
    for (const a of project.assets) {
      if (a.kind === "video") {
        seenV.add(a.id);
        if (!vmap.has(a.id)) {
          const el = document.createElement("video");
          el.src = a.url;
          el.crossOrigin = "anonymous";
          el.muted = true;
          el.playsInline = true;
          el.preload = "auto";
          el.addEventListener("loadeddata", () => setMediaVersion((n) => n + 1));
          el.addEventListener("seeked", () => setMediaVersion((n) => n + 1));
          el.addEventListener("canplay", () => setMediaVersion((n) => n + 1));
          vmap.set(a.id, el);
        }
      } else {
        seenA.add(a.id);
        if (!amap.has(a.id)) {
          const el = document.createElement("audio");
          el.src = a.url;
          el.preload = "auto";
          amap.set(a.id, el);
        }
      }
    }
    // Drop removed
    for (const id of [...vmap.keys()]) if (!seenV.has(id)) vmap.delete(id);
    for (const id of [...amap.keys()]) if (!seenA.has(id)) amap.delete(id);
  }, [project.assets]);

  // Draw current frame whenever playhead/project changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = w;
    canvas.height = h;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);

    const clip = activeVideo(project, playhead);
    if (clip && clip.assetId) {
      const v = videosRef.current.get(clip.assetId);
      const asset = project.assets.find((a) => a.id === clip.assetId);
      if (v && asset) {
        const local = playhead - clip.start;
        const desired = clip.inPoint + local * clip.speed;
        if (!playing && Math.abs(v.currentTime - desired) > 0.05) {
          v.currentTime = Math.max(0, Math.min(desired, asset.duration - 0.01));
        }
        try {
          // Draw with zoom/pan crop
          const zoom = Math.max(1, clip.zoom);
          const srcW = v.videoWidth || w;
          const srcH = v.videoHeight || h;
          // Fit-cover scale
          const targetAspect = w / h;
          const srcAspect = srcW / srcH;
          let drawW: number, drawH: number;
          if (srcAspect > targetAspect) {
            drawH = h * zoom;
            drawW = drawH * srcAspect;
          } else {
            drawW = w * zoom;
            drawH = drawW / srcAspect;
          }
          const baseX = (w - drawW) / 2;
          const baseY = (h - drawH) / 2;
          const offX = ((drawW - w) / 2) * clip.panX;
          const offY = ((drawH - h) / 2) * clip.panY;
          ctx.drawImage(v, baseX - offX, baseY - offY, drawW, drawH);
        } catch {
          /* not yet decoded */
        }
      }
    }

    // Overlays
    for (const o of project.overlays) {
      if (playhead < o.start || playhead >= o.start + o.duration) continue;
      drawTextBox(ctx, o.text, o.position, o.fontSize, o.textColor, o.boxColor, o.boxOpacity, w, h);
    }
    // Subtitles
    for (const s of project.subtitles) {
      if (playhead < s.start || playhead >= s.start + s.duration) continue;
      drawTextBox(ctx, s.text, "bottom", 48, "#fff", "#000", 0.55, w, h);
    }
  }, [project, playhead, playing, w, h, mediaVersion]);

  // Drive playback of media elements when playing
  useEffect(() => {
    const clip = activeVideo(project, playhead);
    const videos = videosRef.current;
    const audios = audiosRef.current;

    if (!playing) {
      videos.forEach((v) => v.pause());
      audios.forEach((a) => a.pause());
      return;
    }

    // Play active video at desired offset
    videos.forEach((v) => v.pause());
    if (clip && clip.assetId) {
      const v = videos.get(clip.assetId);
      if (v) {
        const local = playhead - clip.start;
        const desired = clip.inPoint + local * clip.speed;
        if (Math.abs(v.currentTime - desired) > 0.2) v.currentTime = desired;
        v.playbackRate = clip.speed;
        v.muted = true;
        v.play().catch(() => {});
      }
    }

    // Voice + music: play any track active now
    audios.forEach((a) => a.pause());
    for (const a of [...project.voice, ...project.music]) {
      if (playhead >= a.start && playhead < a.start + a.duration) {
        const el = audios.get(a.assetId);
        if (el) {
          const local = playhead - a.start;
          const desired = a.inPoint + local;
          if (Math.abs(el.currentTime - desired) > 0.2) el.currentTime = desired;
          el.volume = a.volume;
          el.play().catch(() => {});
        }
      }
    }
  }, [playing, playhead, project]);

  return (
    <div
      ref={frameRef}
      className="flex h-full min-h-0 w-full min-w-0 items-center justify-center overflow-hidden bg-black p-3"
    >
      <canvas
        ref={canvasRef}
        width={w}
        height={h}
        className="block bg-black"
        style={{
          width: displaySize ? `${displaySize.width}px` : "100%",
          height: displaySize ? `${displaySize.height}px` : "100%",
        }}
      />
    </div>
  );
}

function drawTextBox(
  ctx: CanvasRenderingContext2D,
  text: string,
  position: "top" | "center" | "bottom",
  fontSize: number,
  color: string,
  boxColor: string,
  boxOpacity: number,
  w: number,
  h: number,
) {
  const fs = Math.max(20, Math.round(fontSize * (h / 1080)));
  ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const metrics = ctx.measureText(text);
  const padX = fs * 0.5;
  const padY = fs * 0.35;
  const boxW = Math.min(w * 0.9, metrics.width + padX * 2);
  const boxH = fs + padY * 2;
  const x = w / 2 - boxW / 2;
  const y = position === "top" ? h * 0.08 : position === "bottom" ? h - h * 0.08 - boxH : h / 2 - boxH / 2;
  ctx.globalAlpha = boxOpacity;
  ctx.fillStyle = boxColor;
  ctx.fillRect(x, y, boxW, boxH);
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, y + boxH / 2);
}
