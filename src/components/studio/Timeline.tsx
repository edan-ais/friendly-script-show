import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { AnyClip, Project, Selection } from "@/lib/studio/types";
import { projectDuration } from "@/lib/studio/types";
import type { Action, TrackKey } from "@/lib/studio/state";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Scissors, Trash2 } from "lucide-react";

type Props = {
  project: Project;
  playhead: number;
  setPlayhead: (t: number) => void;
  dispatch: (a: Action) => void;
  selection: Selection;
  setSelection: (s: Selection) => void;
};

const PX_PER_SEC_DEFAULT = 80;

export function Timeline(props: Props) {
  const { project, playhead, setPlayhead, dispatch, selection, setSelection } = props;
  const [pxPerSec, setPxPerSec] = useState(PX_PER_SEC_DEFAULT);
  const duration = Math.max(projectDuration(project), 10);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const timelineWidth = Math.max(duration * pxPerSec + 240, 900);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const playheadX = playhead * pxPerSec;
    const leftEdge = scroller.scrollLeft + 96;
    const rightEdge = scroller.scrollLeft + scroller.clientWidth - 80;
    if (playheadX < leftEdge) {
      scroller.scrollTo({ left: Math.max(0, playheadX - 96), behavior: "smooth" });
    } else if (playheadX > rightEdge) {
      scroller.scrollTo({ left: playheadX - scroller.clientWidth + 160, behavior: "smooth" });
    }
  }, [playhead, pxPerSec]);

  const trackList: { key: TrackKey; label: string; clips: AnyClip[]; color: string }[] = [
    {
      key: "video",
      label: "Video",
      clips: project.video,
      color: "bg-rose-500/80 border-rose-300/70",
    },
    {
      key: "voice",
      label: "Voice",
      clips: project.voice,
      color: "bg-emerald-500/80 border-emerald-300/70",
    },
    {
      key: "music",
      label: "Music",
      clips: project.music,
      color: "bg-sky-500/80 border-sky-300/70",
    },
    {
      key: "overlays",
      label: "Overlays",
      clips: project.overlays,
      color: "bg-amber-500/80 border-amber-300/70",
    },
    {
      key: "subtitles",
      label: "Subtitles",
      clips: project.subtitles,
      color: "bg-purple-500/80 border-purple-300/70",
    },
  ];

  function onRulerClick(e: React.MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    setPlayhead(Math.max(0, x / pxPerSec));
  }

  function scrollByAmount(direction: -1 | 1) {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollBy({
      left: direction * Math.max(320, scroller.clientWidth * 0.75),
      behavior: "smooth",
    });
  }

  return (
    <div className="flex h-full flex-col border-t border-white/10 bg-[#0c0c14] text-white">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2 text-xs">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-white/60">Zoom</span>
          <input
            type="range"
            min={20}
            max={200}
            value={pxPerSec}
            onChange={(e) => setPxPerSec(Number(e.target.value))}
            className="w-32"
          />
          <span className="text-white/40">
            {playhead.toFixed(2)}s / {duration.toFixed(2)}s
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-white/60"
            onClick={() => scrollByAmount(-1)}
            title="Scroll timeline left"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-white/60"
            onClick={() => scrollByAmount(1)}
            title="Scroll timeline right"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        {selection && (
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 text-xs"
              onClick={() =>
                dispatch({
                  type: "split_clip",
                  track: selection.track,
                  id: selection.id,
                  at: playhead,
                })
              }
            >
              <Scissors className="h-3 w-3" /> Split at playhead
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 text-xs text-red-300 hover:text-red-200"
              onClick={() => {
                dispatch({ type: "remove_clip", track: selection.track, id: selection.id });
                setSelection(null);
              }}
            >
              <Trash2 className="h-3 w-3" /> Delete
            </Button>
          </div>
        )}
      </div>

      <div
        className="relative flex-1 overflow-x-scroll overflow-y-auto [scrollbar-color:rgba(255,255,255,0.35)_rgba(255,255,255,0.08)] [scrollbar-gutter:stable]"
        ref={scrollerRef}
      >
        <div style={{ width: timelineWidth }} className="relative min-w-full pb-4">
          {/* Ruler */}
          <div
            className="sticky top-0 z-10 h-6 cursor-pointer border-b border-white/10 bg-[#0c0c14]"
            onClick={onRulerClick}
          >
            {Array.from({ length: Math.ceil(duration) + 1 }).map((_, i) => (
              <div
                key={i}
                className="absolute top-0 h-full border-l border-white/10 pl-1 text-[10px] text-white/40"
                style={{ left: i * pxPerSec }}
              >
                {i}s
              </div>
            ))}
          </div>

          {/* Playhead */}
          <div
            className="pointer-events-none absolute top-0 z-20 h-full w-0.5 bg-red-400"
            style={{ left: playhead * pxPerSec }}
          />

          {/* Tracks */}
          {trackList.map((t) => (
            <div key={t.key} className="relative h-14 min-w-full border-b border-white/5">
              <div className="sticky left-0 z-10 inline-block w-20 -translate-x-0 bg-[#0c0c14]/95 px-2 py-1 text-[11px] uppercase tracking-wide text-white/50">
                {t.label}
              </div>
              {t.clips.map((c) => (
                <ClipBlock
                  key={c.id}
                  clip={c}
                  pxPerSec={pxPerSec}
                  color={t.color}
                  selected={selection?.track === t.key && selection.id === c.id}
                  onSelect={() => setSelection({ track: t.key, id: c.id })}
                  onResize={(newDur) =>
                    dispatch({
                      type: "update_clip",
                      track: t.key,
                      id: c.id,
                      patch: { duration: newDur },
                    })
                  }
                  onMove={
                    t.key === "video"
                      ? undefined
                      : (newStart) =>
                          dispatch({
                            type: "update_clip",
                            track: t.key,
                            id: c.id,
                            patch: { start: newStart },
                          })
                  }
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type ClipProps = {
  clip: AnyClip;
  pxPerSec: number;
  color: string;
  selected: boolean;
  onSelect: () => void;
  onResize: (durationSec: number) => void;
  onMove?: (startSec: number) => void;
};

function ClipBlock({ clip, pxPerSec, color, selected, onSelect, onResize, onMove }: ClipProps) {
  const label =
    clip.kind === "video"
      ? (clip.sourceLine ?? "Video")
      : clip.kind === "subtitle"
        ? clip.text
        : clip.kind === "overlay"
          ? clip.text
          : "Audio";

  function startResize(e: React.MouseEvent) {
    e.stopPropagation();
    const startX = e.clientX;
    const startDur = clip.duration;
    function move(ev: MouseEvent) {
      const dx = ev.clientX - startX;
      onResize(Math.max(0.2, startDur + dx / pxPerSec));
    }
    function up() {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  function startMove(e: React.MouseEvent) {
    if (!onMove) return;
    e.stopPropagation();
    const startX = e.clientX;
    const startStart = clip.start;
    function move(ev: MouseEvent) {
      const dx = ev.clientX - startX;
      onMove?.(Math.max(0, startStart + dx / pxPerSec));
    }
    function up() {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  return (
    <button
      onClick={onSelect}
      onMouseDown={startMove}
      className={cn(
        "absolute top-7 h-9 cursor-grab overflow-hidden rounded-md border px-2 py-1 text-left text-[11px] font-medium text-white shadow-sm transition active:cursor-grabbing",
        color,
        selected && "ring-2 ring-white",
      )}
      style={{ left: clip.start * pxPerSec, width: Math.max(20, clip.duration * pxPerSec) }}
      title={label}
    >
      <span className="block truncate leading-tight">{label}</span>
      <span className="block text-[10px] opacity-70">{clip.duration.toFixed(2)}s</span>
      <span
        onMouseDown={startResize}
        className="absolute right-0 top-0 h-full w-2 cursor-ew-resize bg-white/30 opacity-0 hover:opacity-100"
      />
    </button>
  );
}
