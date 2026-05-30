import { useEffect, useMemo, useRef, useState } from "react";
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
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number } | null>(null);
  const { w, h } = ASPECT_DIMS[project.aspect];
  const clip = useMemo(() => activeVideo(project, playhead), [project, playhead]);
  const asset = clip?.assetId
    ? (project.assets.find((a) => a.id === clip.assetId && a.kind === "video") ?? null)
    : null;
  const desiredVideoTime =
    clip && asset
      ? clamp(
          clip.inPoint + Math.max(0, playhead - clip.start) * clip.speed,
          0,
          Math.max(0, asset.duration - 0.03),
        )
      : 0;

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

  // Ensure audio elements exist for each asset. The active video is rendered as a real
  // <video> element instead of being copied into a canvas, which avoids blank canvas
  // frames while the browser is still decoding a selected source clip.
  useEffect(() => {
    const amap = audiosRef.current;
    const seenA = new Set<string>();
    for (const a of project.assets) {
      if (a.kind === "audio") {
        seenA.add(a.id);
        if (!amap.has(a.id)) {
          const el = document.createElement("audio");
          el.src = a.url;
          el.preload = "auto";
          amap.set(a.id, el);
        }
      }
    }
    for (const id of [...amap.keys()]) if (!seenA.has(id)) amap.delete(id);
  }, [project.assets]);

  // Keep the visible source video synced to the editor playhead.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !clip || !asset) return;

    const syncTime = () => {
      const mediaDuration =
        Number.isFinite(video.duration) && video.duration > 0 ? video.duration : asset.duration;
      const target = clamp(desiredVideoTime, 0, Math.max(0, mediaDuration - 0.03));
      const decodedTarget = target === 0 && mediaDuration > 0.05 ? 0.001 : target;
      if (
        !playing ||
        Math.abs(video.currentTime - decodedTarget) > 0.25 ||
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        try {
          video.currentTime = decodedTarget;
        } catch {
          // Some browsers reject seeks before metadata; loadedmetadata retries it.
        }
      }
      video.playbackRate = clip.speed;
    };

    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      syncTime();
    } else {
      video.addEventListener("loadedmetadata", syncTime, { once: true });
      video.load();
    }

    return () => video.removeEventListener("loadedmetadata", syncTime);
  }, [asset, clip, desiredVideoTime, playing]);

  // Play/pause the visible video element.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!playing || !clip || !asset) {
      video.pause();
      return;
    }
    video.playbackRate = clip.speed;
    video.muted = true;
    video.play().catch(() => {});
  }, [asset, clip, playing]);

  // Drive playback of media elements when playing
  useEffect(() => {
    const audios = audiosRef.current;

    if (!playing) {
      audios.forEach((a) => a.pause());
      return;
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

  const activeSubtitles = project.subtitles.filter(
    (s) => playhead >= s.start && playhead < s.start + s.duration,
  );
  const textBoxes = [
    ...project.overlays
      .filter((o) => playhead >= o.start && playhead < o.start + o.duration)
      .map((o) => ({
        id: o.id,
        text: o.text,
        position: o.position,
        fontSize: o.fontSize,
        color: o.textColor,
        boxColor: o.boxColor,
        boxOpacity: o.boxOpacity,
      })),
    ...activeSubtitles.map((s) => ({
      id: s.id,
      text: s.text,
      position: "bottom" as const,
      fontSize: 48,
      color: "#ffffff",
      boxColor: "#000000",
      boxOpacity: 0.55,
    })),
    ...(activeSubtitles.length === 0 && clip?.sourceLine
      ? [
          {
            id: `${clip.id}-source-line`,
            text: clip.sourceLine,
            position: "bottom" as const,
            fontSize: 48,
            color: "#ffffff",
            boxColor: "#000000",
            boxOpacity: 0.55,
          },
        ]
      : []),
  ];

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 items-center justify-center overflow-hidden bg-black p-3">
      <div
        ref={frameRef}
        className="flex h-full min-h-0 w-full min-w-0 items-center justify-center"
      >
        <div
          className="relative overflow-hidden bg-black shadow-[0_0_0_1px_rgba(255,255,255,0.12)]"
          style={{
            width: displaySize ? `${displaySize.width}px` : undefined,
            height: displaySize ? `${displaySize.height}px` : undefined,
            aspectRatio: `${w} / ${h}`,
            maxWidth: "100%",
            maxHeight: "100%",
          }}
        >
          {asset && clip ? (
            <video
              key={`${clip.id}-${asset.id}`}
              ref={videoRef}
              src={asset.url}
              crossOrigin="anonymous"
              muted
              playsInline
              preload="auto"
              className="absolute inset-0 h-full w-full bg-black object-cover"
              style={{
                objectPosition: `${50 + clip.panX * 50}% ${50 + clip.panY * 50}%`,
                transform: `scale(${Math.max(1, clip.zoom)})`,
                transformOrigin: "center",
              }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-black px-6 text-center text-sm text-white/35">
              No source clip selected
            </div>
          )}
          {textBoxes.map((box) => (
            <PreviewTextBox key={box.id} box={box} frameHeight={displaySize?.height ?? h} />
          ))}
        </div>
      </div>
    </div>
  );
}

type PreviewTextBoxConfig = {
  text: string;
  position: "top" | "center" | "bottom";
  fontSize: number;
  color: string;
  boxColor: string;
  boxOpacity: number;
};

function PreviewTextBox({ box, frameHeight }: { box: PreviewTextBoxConfig; frameHeight: number }) {
  const fontSize = Math.max(12, Math.round((box.fontSize / 1080) * frameHeight));
  const positionStyle =
    box.position === "top"
      ? { top: "8%", transform: "translateX(-50%)" }
      : box.position === "bottom"
        ? { bottom: "8%", transform: "translateX(-50%)" }
        : { top: "50%", transform: "translate(-50%, -50%)" };

  return (
    <div
      className="absolute left-1/2 max-w-[90%] text-center font-semibold leading-tight"
      style={{
        ...positionStyle,
        color: box.color,
        backgroundColor: colorWithAlpha(box.boxColor, box.boxOpacity),
        fontSize,
        padding: `${Math.round(fontSize * 0.35)}px ${Math.round(fontSize * 0.5)}px`,
      }}
    >
      {box.text}
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function colorWithAlpha(color: string, alpha: number) {
  if (!color.startsWith("#")) return color;
  const hex = color.slice(1);
  const normalized =
    hex.length === 3
      ? hex
          .split("")
          .map((x) => x + x)
          .join("")
      : hex;
  const int = Number.parseInt(normalized, 16);
  if (!Number.isFinite(int)) return color;
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
