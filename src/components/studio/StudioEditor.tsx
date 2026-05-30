import { useEffect, useReducer, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowLeft,
  Download,
  Loader2,
  Music,
  Pause,
  Play,
  Plus,
  Type,
  Upload,
  Video,
  Volume2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  type Aspect,
  type MediaAsset,
  type Project,
  type Selection,
  emptyProject,
  projectDuration,
  uid,
} from "@/lib/studio/types";
import { reducer } from "@/lib/studio/state";
import { exportProjectToMp4 } from "@/lib/studio/export";
import { useAuth, signOut } from "@/hooks/use-auth";
import { loadOrCreateProject, saveProject } from "@/lib/persistence/projects";
import { uploadMedia, signMedia } from "@/lib/persistence/media";

import { ScriptImporter } from "./ScriptImporter";
import { Timeline } from "./Timeline";
import { PreviewCanvas } from "./PreviewCanvas";
import { Inspector } from "./Inspector";

async function probeMedia(file: File, kind: "video" | "audio"): Promise<MediaAsset> {
  const url = URL.createObjectURL(file);
  const el = kind === "video" ? document.createElement("video") : document.createElement("audio");
  el.preload = "metadata";
  el.src = url;
  await new Promise<void>((resolve) => {
    el.onloadedmetadata = () => resolve();
    el.onerror = () => resolve();
  });
  const duration = isFinite(el.duration) ? el.duration : 5;
  const width = kind === "video" ? (el as HTMLVideoElement).videoWidth : undefined;
  const height = kind === "video" ? (el as HTMLVideoElement).videoHeight : undefined;
  return {
    id: uid("a"),
    name: file.name,
    kind,
    mime: file.type || (kind === "video" ? "video/mp4" : "audio/mpeg"),
    url,
    duration,
    width,
    height,
  };
}

export function StudioEditor() {
  const [project, dispatch] = useReducer(reducer, undefined, emptyProject);
  const [selection, setSelection] = useState<Selection>(null);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<{ msg: string; ratio: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);

  const duration = Math.max(projectDuration(project), 0.001);

  // Playback loop
  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    lastTickRef.current = performance.now();
    const tick = (now: number) => {
      const dt = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;
      setPlayhead((p) => {
        const next = p + dt;
        if (next >= duration) {
          setPlaying(false);
          return duration;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, duration]);

  async function uploadFiles(files: FileList | null, kind: "video" | "audio") {
    if (!files) return;
    for (const f of Array.from(files)) {
      const asset = await probeMedia(f, kind);
      dispatch({ type: "add_asset", asset });
      toast.success(`Loaded ${asset.name}`);
    }
  }

  function addBlankVideoClip() {
    const start = duration;
    dispatch({
      type: "add_video",
      clip: {
        id: uid("vc"),
        kind: "video",
        start,
        duration: 3,
        inPoint: 0,
        speed: 1,
        preservePitch: true,
        zoom: 1,
        panX: 0,
        panY: 0,
        fadeIn: 0,
        fadeOut: 0,
        role: "segment",
      },
    });
  }

  function addOverlay() {
    dispatch({
      type: "add_overlay",
      clip: {
        id: uid("ov"),
        kind: "overlay",
        start: playhead,
        duration: 3,
        text: "Your text here",
        position: "bottom",
        boxColor: "#000000",
        boxOpacity: 0.55,
        textColor: "#ffffff",
        fontSize: 64,
        fadeIn: 0.2,
        fadeOut: 0.2,
      },
    });
  }

  function addAudioFromAsset(assetId: string, track: "voice" | "music") {
    const asset = project.assets.find((a) => a.id === assetId);
    if (!asset) return;
    dispatch({
      type: "add_audio",
      track,
      clip: {
        id: uid("ac"),
        kind: "audio",
        start: 0,
        duration: asset.duration,
        inPoint: 0,
        assetId,
        volume: track === "voice" ? 1 : 0.4,
        fadeIn: 0,
        fadeOut: track === "music" ? 1 : 0,
        track,
      },
    });
  }

  async function handleExport() {
    if (exporting) return;
    if (project.video.length === 0 && project.voice.length === 0 && project.music.length === 0) {
      toast.error("Add some segments or audio first.");
      return;
    }
    setExporting(true);
    setProgress({ msg: "Starting...", ratio: 0 });
    try {
      const blob = await exportProjectToMp4(project, (msg, ratio = 0) => setProgress({ msg, ratio }));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${project.name.replace(/\W+/g, "-")}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Export complete");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
      setProgress(null);
    }
  }

  const videoAssets = project.assets.filter((a) => a.kind === "video");
  const audioAssets = project.assets.filter((a) => a.kind === "audio");

  return (
    <div className="flex h-screen flex-col bg-[#08080f] text-white">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-white/10 bg-[#0c0c14] px-4 py-2">
        <div className="flex items-center gap-3">
          <Button asChild size="sm" variant="ghost" className="text-white/70">
            <Link to="/"><ArrowLeft className="mr-1 h-4 w-4" /> Home</Link>
          </Button>
          <div className="h-6 w-px bg-white/10" />
          <Input
            value={project.name}
            onChange={(e) => dispatch({ type: "rename", name: e.target.value })}
            className="h-8 w-56 border-transparent bg-transparent text-sm font-semibold focus-visible:border-white/20"
          />
        </div>
        <div className="flex items-center gap-3">
          <Select value={project.aspect} onValueChange={(v) => dispatch({ type: "set_aspect", aspect: v as Aspect })}>
            <SelectTrigger className="h-8 w-36 bg-white/5 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="16:9">YouTube 16:9</SelectItem>
              <SelectItem value="9:16">TikTok 9:16</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleExport} disabled={exporting} className="gap-2">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {exporting ? "Exporting..." : "Export MP4"}
          </Button>
        </div>
      </header>

      {progress && (
        <div className="border-b border-white/10 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-100">
          {progress.msg}
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-amber-300 transition-all" style={{ width: `${Math.round(progress.ratio * 100)}%` }} />
          </div>
        </div>
      )}

      {/* Body */}
      <div className="grid flex-1 grid-cols-[300px_1fr_320px] overflow-hidden">
        {/* Left sidebar */}
        <aside className="overflow-y-auto border-r border-white/10 bg-[#0a0a12]">
          <Tabs defaultValue="script">
            <TabsList className="m-3 w-[calc(100%-1.5rem)] grid-cols-3 bg-white/5">
              <TabsTrigger value="script">Script</TabsTrigger>
              <TabsTrigger value="media">Media</TabsTrigger>
              <TabsTrigger value="add">Add</TabsTrigger>
            </TabsList>

            <TabsContent value="script">
              <ScriptImporter
                onApply={(lines, perLineSec) => {
                  dispatch({ type: "from_script", lines, perLineSec });
                  toast.success("Segments created from script");
                }}
              />
            </TabsContent>

            <TabsContent value="media" className="space-y-3 p-4">
              <UploadButton kind="video" onChange={(files) => uploadFiles(files, "video")} />
              <UploadButton kind="audio" onChange={(files) => uploadFiles(files, "audio")} />
              <div className="mt-4 space-y-2">
                <div className="text-xs uppercase tracking-wide text-white/40">Video assets</div>
                {videoAssets.length === 0 && <div className="text-xs text-white/30">None</div>}
                {videoAssets.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-md bg-white/5 px-2 py-1.5 text-xs">
                    <span className="truncate"><Video className="mr-1 inline h-3 w-3" />{a.name}</span>
                    <span className="text-white/40">{a.duration.toFixed(1)}s</span>
                  </div>
                ))}
                <div className="mt-4 text-xs uppercase tracking-wide text-white/40">Audio assets</div>
                {audioAssets.length === 0 && <div className="text-xs text-white/30">None</div>}
                {audioAssets.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-md bg-white/5 px-2 py-1.5 text-xs">
                    <span className="truncate"><Music className="mr-1 inline h-3 w-3" />{a.name}</span>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]" onClick={() => addAudioFromAsset(a.id, "voice")}>+ Voice</Button>
                      <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]" onClick={() => addAudioFromAsset(a.id, "music")}>+ Music</Button>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="add" className="space-y-2 p-4">
              <Button variant="secondary" className="w-full justify-start gap-2" onClick={addBlankVideoClip}>
                <Plus className="h-4 w-4" /> Add blank video segment
              </Button>
              <Button variant="secondary" className="w-full justify-start gap-2" onClick={addOverlay}>
                <Type className="h-4 w-4" /> Add text overlay
              </Button>
              <div className="pt-3 text-xs text-white/40">
                <Volume2 className="mr-1 inline h-3 w-3" />
                Voice & music tracks are added from the Media tab after uploading.
              </div>
            </TabsContent>
          </Tabs>
        </aside>

        {/* Center: preview + timeline */}
        <div className="grid grid-rows-[1fr_300px] overflow-hidden">
          <div className="relative overflow-hidden bg-black">
            <PreviewCanvas project={project} playhead={playhead} playing={playing} />
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 backdrop-blur">
              <Button size="icon" variant="ghost" className="h-8 w-8 text-white" onClick={() => setPlaying((p) => !p)}>
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <span className="font-mono text-xs text-white/70">
                {playhead.toFixed(2)}s / {duration.toFixed(2)}s
              </span>
              <Button size="sm" variant="ghost" className="h-8 text-xs text-white/70" onClick={() => setPlayhead(0)}>Reset</Button>
            </div>
          </div>
          <Timeline
            project={project}
            playhead={playhead}
            setPlayhead={setPlayhead}
            dispatch={dispatch}
            selection={selection}
            setSelection={setSelection}
          />
        </div>

        {/* Right inspector */}
        <aside className="overflow-y-auto border-l border-white/10 bg-[#0a0a12]">
          <Inspector project={project} selection={selection} dispatch={dispatch} />
        </aside>
      </div>
    </div>
  );
}

function UploadButton({ kind, onChange }: { kind: "video" | "audio"; onChange: (files: FileList | null) => void }) {
  const id = `upload-${kind}`;
  return (
    <label htmlFor={id} className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-white/20 bg-white/5 px-3 py-3 text-xs text-white/70 hover:bg-white/10">
      <Upload className="h-4 w-4" />
      Upload {kind}
      <input id={id} type="file" accept={kind === "video" ? "video/*" : "audio/*"} multiple className="hidden" onChange={(e) => onChange(e.target.files)} />
    </label>
  );
}
