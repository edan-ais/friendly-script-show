import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Circle,
  Square,
  Download,
  Type,
  Gauge,
  FlipHorizontal,
  Trash2,
  Eye,
  EyeOff,
  ZoomIn,
  ArrowLeft,
  Video,
  Library,
  FileVideo,
  Loader2,
  X,
  RotateCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { listClips, saveClip, deleteClip, type SavedClip } from "@/lib/video-bank";
import { videoToMp4, webmToMp4 } from "@/lib/convert";
import { useAuth, signOut } from "@/hooks/use-auth";
import { loadOrCreateScript, saveScript } from "@/lib/persistence/scripts";

const SAMPLE = `Welcome to Prompter.

Paste your script here, hit play, and the words will glide up the screen at your chosen pace.

Click record to capture yourself reading — the video saves straight to your bank when you stop.

Adjust speed and font size on the setup screen. Mirror the text if you're reading off a reflective glass rig.`;

type Mode = "setup" | "stage";
type DownloadFormat = "original" | "mp4";

type ConvertProgress = { ratio: number; startedAt: number } | null;

function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.ceil(seconds % 60);
  return `${m}m ${s}s`;
}

function safeName(name: string) {
  return name.replace(/[^a-z0-9-_]+/gi, "_");
}

function downloadBlob(blob: Blob, filename: string) {
  const nav = navigator as Navigator & {
    msSaveOrOpenBlob?: (blob: Blob, defaultName?: string) => boolean;
  };
  if (nav.msSaveOrOpenBlob) {
    nav.msSaveOrOpenBlob(blob, filename);
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function Teleprompter() {
  const { user, ready } = useAuth();
  const [mode, setMode] = useState<Mode>("setup");
  const [text, setText] = useState("");
  const [scriptId, setScriptId] = useState<string | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(60);
  const [fontSize, setFontSize] = useState(56);
  const [mirrorText, setMirrorText] = useState(false);
  const [mirrorVideo, setMirrorVideo] = useState(true);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [camReady, setCamReady] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [clips, setClips] = useState<SavedClip[]>([]);
  const [bankOpen, setBankOpen] = useState(false);
  const [converterOpen, setConverterOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [convertProgress, setConvertProgress] = useState<ConvertProgress>(null);
  const [scriptRotation, setScriptRotation] = useState<0 | 90 | -90>(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const recStartRef = useRef<number>(0);
  const saveTimerRef = useRef<number | null>(null);

  // Load script + clips once the user is known
  useEffect(() => {
    if (!user) return;
    loadOrCreateScript(user.id)
      .then((row) => {
        setScriptId(row.id);
        setText(row.content || SAMPLE);
        setScriptLoaded(true);
      })
      .catch((e) => {
        console.error(e);
        toast.error("Couldn't load your script");
        setText(SAMPLE);
        setScriptLoaded(true);
      });
    listClips()
      .then(setClips)
      .catch((e) => console.error("listClips failed", e));
  }, [user]);

  // Debounced autosave of script text
  useEffect(() => {
    if (!scriptId || !scriptLoaded) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      setSaving(true);
      saveScript(scriptId, { content: text })
        .catch((e) => {
          console.error(e);
          toast.error("Save failed");
        })
        .finally(() => setSaving(false));
    }, 600);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [text, scriptId, scriptLoaded]);

  // Webcam — only when on stage
  useEffect(() => {
    if (mode !== "stage") return;
    let cancelled = false;
    setCamReady(false);
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" }, audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCamReady(true);
      })
      .catch(() => {
        setCamReady(false);
        toast.error("Couldn't access camera");
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [mode]);

  // Scroll loop
  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTsRef.current = null;
      return;
    }
    const tick = (ts: number) => {
      const el = scrollRef.current;
      if (!el) return;
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      el.scrollTop += speed * dt;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) {
        setPlaying(false);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, speed]);

  // Recording timer
  useEffect(() => {
    if (!recording) return;
    const id = setInterval(
      () => setElapsed(Math.floor((Date.now() - recStartRef.current) / 1000)),
      250,
    );
    return () => clearInterval(id);
  }, [recording]);

  const reset = () => {
    setPlaying(false);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  const enterStage = (startWith: "preview" | "record") => {
    setMode("stage");
    if (startWith === "preview") setPreviewing(true);
    // record will auto-start once camReady
    if (startWith === "record") {
      const tryStart = () => {
        if (streamRef.current) startRecording();
        else setTimeout(tryStart, 100);
      };
      setTimeout(tryStart, 200);
    }
  };

  const exitStage = () => {
    if (recording) recorderRef.current?.stop();
    setRecording(false);
    setPreviewing(false);
    setPlaying(false);
    setMode("setup");
  };

  const beginRecording = () => {
    const stream = streamRef.current;
    if (!stream) return;
    chunksRef.current = [];
    // Prefer mp4 on Safari/iOS (records H.264/AAC natively — no conversion needed).
    // Other browsers fall through to webm.
    const mimeCandidates = [
      "video/mp4;codecs=h264,aac",
      "video/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ];
    const mime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = async () => {
      const type = rec.mimeType || "video/webm";
      const blob = new Blob(chunksRef.current, { type });
      const ext: "webm" | "mp4" = type.includes("mp4") ? "mp4" : "webm";
      const durationSec = Math.floor((Date.now() - recStartRef.current) / 1000);
      const saved = await saveClip({
        blob,
        ext,
        durationSec,
        name: `Take ${new Date().toLocaleString()}`,
      });
      setClips((prev) => [saved, ...prev]);
      toast.success("Saved to your video bank");
    };
    rec.start();
    recorderRef.current = rec;
    recStartRef.current = Date.now();
    setElapsed(0);
    setRecording(true);
    setPreviewing(false);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setPlaying(true);
  };

  const startRecording = () => {
    if (!streamRef.current) return;
    setPreviewing(false);
    setCountdown(3);
    let n = 3;
    const tick = () => {
      n -= 1;
      if (n <= 0) {
        setCountdown(0);
        beginRecording();
      } else {
        setCountdown(n);
        setTimeout(tick, 1000);
      }
    };
    setTimeout(tick, 1000);
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    setRecording(false);
    setPlaying(false);
  };

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const downloadClip = useCallback(
    async (clip: SavedClip, format: DownloadFormat) => {
      try {
        let blob = clip.blob;
        let ext: string = clip.ext;
        if (format === "mp4") {
          setBusyId(clip.id);
          setConvertProgress({ ratio: 0, startedAt: performance.now() });
          toast.info("Converting to MP4… first time may take a moment.");
          const result = await videoToMp4(clip.blob, {
            onProgress: (ratio) =>
              setConvertProgress((prev) => ({
                ratio,
                startedAt: prev?.startedAt ?? performance.now(),
              })),
          });
          blob = result.blob;
          ext = result.ext;
          if (result.note) toast.info(result.note);
        }
        downloadBlob(blob, `${safeName(clip.name)}.${ext}`);
        if (ext === "mp4")
          toast.success(
            "MP4 ready. On iPhone, open it from Downloads and tap Share → Save Video.",
          );
      } catch (err) {
        console.error(err);
        toast.error(err instanceof Error ? err.message : "Conversion failed");
      } finally {
        setBusyId(null);
        setConvertProgress(null);
      }
    },
    [],
  );

  const removeClip = async (id: string) => {
    await deleteClip(id);
    setClips((prev) => prev.filter((c) => c.id !== id));
  };

  const convertUpload = async (file: File) => {
    try {
      setConverting(true);
      setConvertProgress({ ratio: 0, startedAt: performance.now() });
      toast.info("Converting… this may take a moment.");
      const result = await webmToMp4(file, {
        onProgress: (ratio) =>
          setConvertProgress((prev) => ({
            ratio,
            startedAt: prev?.startedAt ?? performance.now(),
          })),
      });
      downloadBlob(
        result.blob,
        file.name.replace(/\.(webm|mkv|mov|avi|mp4|m4v)$/i, "") + `.${result.ext}`,
      );
      toast.success(
        result.converted
          ? `Saved as ${result.ext.toUpperCase()}`
          : `Downloaded ${result.ext.toUpperCase()}`,
      );
      if (result.ext === "mp4")
        toast.info(
          "On iPhone, open the MP4 from Downloads and tap Share → Save Video to put it in Photos.",
        );
      if (result.note) toast.info(result.note);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Conversion failed", { duration: 9000 });
    } finally {
      setConverting(false);
      setConvertProgress(null);
    }
  };

  // Wait for auth to resolve so we don't redirect prematurely
  if (!ready) return <div className="min-h-screen bg-background" />;
  if (!user) return <div className="min-h-screen bg-background" />;

  // Don't render until the saved script content has been pulled from the server,
  // otherwise the empty default would overwrite real saved content via autosave.
  if (!scriptLoaded && mode === "setup") {
    return (
      <div className="min-h-screen w-full bg-background text-foreground flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // -------------- SETUP SCREEN --------------
  if (mode === "setup") {
    return (
      <div className="min-h-screen w-full bg-background text-foreground" style={{ touchAction: "manipulation" }}>
      <header className="border-b border-border bg-card/40 backdrop-blur px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild className="-ml-2">
              <Link to="/">
                <ArrowLeft className="size-5" />
              </Link>
            </Button>
            <div className="size-8 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold">
              P
            </div>
            <h1 className="text-xl font-bold">Prompter</h1>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {saving ? "Saving…" : "Saved"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setConverterOpen(true)}>
              <FileVideo className="size-4" /> <span className="hidden sm:inline">WebM → MP4</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setBankOpen(true)}>
              <Library className="size-4" /> <span className="hidden sm:inline">Bank</span>
              <span className="text-xs text-muted-foreground">({clips.length})</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => signOut()}>
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </header>


        <main className="max-w-2xl mx-auto p-4 sm:p-6 flex flex-col gap-6 pb-32">
          <section className="flex flex-col gap-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Script</Label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste your script here…"
              className="min-h-64 resize-y font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {text.trim().split(/\s+/).filter(Boolean).length} words
            </p>
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2 text-sm">
                <Gauge className="size-4" /> Speed
              </Label>
              <span className="text-sm text-muted-foreground tabular-nums">{speed} px/s</span>
            </div>
            <Slider
              value={[speed]}
              min={20}
              max={250}
              step={5}
              onValueChange={(v) => setSpeed(v[0])}
            />
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2 text-sm">
                <Type className="size-4" /> Font size
              </Label>
              <span className="text-sm text-muted-foreground tabular-nums">{fontSize}px</span>
            </div>
            <Slider
              value={[fontSize]}
              min={24}
              max={120}
              step={2}
              onValueChange={(v) => setFontSize(v[0])}
            />
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2 text-sm">
                <ZoomIn className="size-4" /> Camera zoom
              </Label>
              <span className="text-sm text-muted-foreground tabular-nums">{zoom.toFixed(2)}×</span>
            </div>
            <Slider
              value={[zoom]}
              min={1}
              max={3}
              step={0.05}
              onValueChange={(v) => setZoom(v[0])}
            />
          </section>

          <section className="flex items-center justify-between rounded-lg border border-border p-3">
            <Label htmlFor="mirror-text" className="flex items-center gap-2 text-sm">
              <FlipHorizontal className="size-4" /> Mirror text
            </Label>
            <Switch id="mirror-text" checked={mirrorText} onCheckedChange={setMirrorText} />
          </section>

          <section className="flex items-center justify-between rounded-lg border border-border p-3">
            <Label htmlFor="mirror-video" className="flex items-center gap-2 text-sm">
              <FlipHorizontal className="size-4" /> Mirror video
            </Label>
            <Switch id="mirror-video" checked={mirrorVideo} onCheckedChange={setMirrorVideo} />
          </section>
        </main>

        {/* Sticky action bar */}
        <div className="fixed bottom-0 inset-x-0 z-20 border-t border-border bg-card/90 backdrop-blur px-4 py-3 flex gap-2 justify-center">
          <Button
            size="lg"
            variant="secondary"
            className="flex-1 max-w-xs"
            onClick={() => enterStage("preview")}
          >
            <Eye className="size-4" /> Preview
          </Button>
          <Button
            size="lg"
            variant="destructive"
            className="flex-1 max-w-xs"
            onClick={() => enterStage("record")}
          >
            <Circle className="size-4 fill-current" /> Record
          </Button>
        </div>

        {bankOpen && (
          <VideoBank
            clips={clips}
            onClose={() => setBankOpen(false)}
            onDelete={removeClip}
            onDownload={downloadClip}
            busyId={busyId}
            progress={convertProgress}
          />
        )}
        {converterOpen && (
          <ConverterModal
            onClose={() => setConverterOpen(false)}
            onConvert={convertUpload}
            converting={converting}
            progress={convertProgress}
          />
        )}
      </div>
    );
  }

  // -------------- STAGE SCREEN --------------
  const videoTransform = `${mirrorVideo ? "scaleX(-1) " : ""}scale(${zoom})`;

  return (
    <div className="h-[100dvh] w-screen overflow-hidden bg-black text-foreground relative">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-200"
        style={{ transform: videoTransform }}
      />
      {!previewing && <div className="absolute inset-0 bg-black/45 pointer-events-none" />}

      {!previewing && (
        <div className="absolute inset-0 flex justify-center pointer-events-none">
          <div
            className="relative max-w-3xl"
            style={
              scriptRotation === 0
                ? { height: "100%", width: "100%" }
                : {
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    width: "100vh",
                    height: "100vw",
                    maxWidth: "none",
                    transform: `translate(-50%, -50%) rotate(${scriptRotation}deg)`,
                  }
            }
          >
            <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/80 to-transparent z-10 pointer-events-none" />
            <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/80 to-transparent z-10 pointer-events-none" />
            <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 border-t-2 border-primary/60 z-10 pointer-events-none" />
            <div
              ref={scrollRef}
              className="absolute inset-0 overflow-y-auto px-6 pointer-events-auto"
              style={{ scrollbarWidth: "none" }}
            >
              <div style={{ height: "50vh" }} />
              <p
                className="whitespace-pre-wrap font-display font-bold leading-[1.15] text-white text-center break-words"
                style={{
                  fontSize: `${fontSize}px`,
                  transform: mirrorText ? "scaleX(-1)" : undefined,
                  textShadow: "0 2px 24px rgba(0,0,0,0.8)",
                }}
              >
                {text || "Paste your script in the setup screen"}
              </p>
              <div style={{ height: "60vh" }} />
            </div>
          </div>
        </div>
      )}

      {recording && (
        <div className="absolute left-3 z-30 top-[max(0.75rem,env(safe-area-inset-top))] flex items-center gap-2 px-3 py-1.5 rounded-full bg-destructive text-destructive-foreground text-sm font-medium">
          <Circle className="size-3 fill-current animate-pulse" />
          REC {fmt(elapsed)}
        </div>
      )}

      {countdown > 0 && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="text-[180px] font-display font-bold text-primary leading-none animate-pulse">
            {countdown}
          </div>
        </div>
      )}

      {/* Back to home — top right when not recording */}
      {!recording && (
        <div className="absolute right-3 z-30 flex items-center gap-2 top-[max(0.75rem,env(safe-area-inset-top))]">
          <Button
            size="sm"
            variant="secondary"
            onClick={exitStage}
            className="rounded-full shadow-xl"
          >
            <ArrowLeft className="size-4" /> Setup
          </Button>
          <Button size="sm" variant="default" asChild className="rounded-full shadow-xl">
            <Link to="/">
              <ArrowLeft className="size-4" /> Home
            </Link>
          </Button>
        </div>
      )}

      {/* Floating zoom + rotate controls */}
      {(previewing || recording) && (
        <div className="absolute top-1/2 right-4 -translate-y-1/2 z-30 flex flex-col gap-2">
          <Button
            size="icon"
            variant="secondary"
            className="rounded-full size-11 shadow-xl"
            onClick={() => setZoom((z) => Math.min(3, +(z + 0.1).toFixed(2)))}
            aria-label="Zoom in"
          >
            +
          </Button>
          <div className="text-center text-xs font-medium text-white/80 bg-black/50 rounded-full py-1 tabular-nums">
            {zoom.toFixed(1)}×
          </div>
          <Button
            size="icon"
            variant="secondary"
            className="rounded-full size-11 shadow-xl"
            onClick={() => setZoom((z) => Math.max(1, +(z - 0.1).toFixed(2)))}
            aria-label="Zoom out"
          >
            −
          </Button>
          <Button
            size="icon"
            variant="secondary"
            className="rounded-full size-11 shadow-xl mt-2"
            onClick={() =>
              setScriptRotation((r) => (r === 0 ? 90 : r === 90 ? -90 : 0))
            }
            aria-label="Rotate script"
            title="Rotate script"
          >
            <RotateCw className="size-4" />
          </Button>
        </div>
      )}

      {/* Bottom controls when previewing only */}
      {previewing && !recording && (
        <div className="absolute inset-x-0 z-30 flex flex-wrap items-center justify-center gap-2 px-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button
            size="lg"
            variant="secondary"
            onClick={() => setPreviewing(false)}
            className="rounded-full shadow-2xl"
          >
            <EyeOff className="size-4" /> Exit preview
          </Button>
          <Button
            size="lg"
            variant="destructive"
            onClick={startRecording}
            disabled={!camReady}
            className="rounded-full shadow-2xl"
          >
            <Circle className="size-4 fill-current" /> Record
          </Button>
        </div>
      )}

      {/* Bottom controls when recording */}
      {recording && (
        <div className="absolute inset-x-0 z-30 flex flex-wrap items-center justify-center gap-2 px-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button
            size="lg"
            variant="secondary"
            onClick={() => setPlaying((p) => !p)}
            className="rounded-full shadow-2xl"
          >
            {playing ? (
              <>
                <Pause className="size-4" /> Pause
              </>
            ) : (
              <>
                <Play className="size-4" /> Play
              </>
            )}
          </Button>
          <Button
            size="lg"
            variant="destructive"
            onClick={stopRecording}
            className="rounded-full shadow-2xl"
          >
            <Square className="size-4 fill-current" /> Stop
          </Button>
        </div>
      )}

      {/* Bottom controls when neither (just landed, e.g. between preview/record) */}
      {!previewing && !recording && countdown === 0 && (
        <div className="absolute inset-x-0 z-30 flex flex-wrap items-center justify-center gap-2 px-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button size="lg" variant="secondary" onClick={reset} className="rounded-full shadow-2xl">
            <RotateCcw className="size-4" /> Reset
          </Button>
          <Button
            size="lg"
            onClick={() => setPlaying((p) => !p)}
            className="rounded-full shadow-2xl"
          >
            {playing ? (
              <>
                <Pause className="size-4" /> Pause
              </>
            ) : (
              <>
                <Play className="size-4" /> Play
              </>
            )}
          </Button>
          <Button
            size="lg"
            variant="destructive"
            onClick={startRecording}
            disabled={!camReady}
            className="rounded-full shadow-2xl"
          >
            <Circle className="size-4 fill-current" /> Record
          </Button>
        </div>
      )}
    </div>
  );
}

// ============ Conversion Progress Bar ============
function ConvertProgressBar({ progress }: { progress: ConvertProgress }) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!progress) return;
    const id = window.setInterval(() => force((n) => n + 1), 500);
    return () => window.clearInterval(id);
  }, [progress]);
  if (!progress) return null;
  const pct = Math.max(2, Math.min(100, Math.round(progress.ratio * 100)));
  const elapsedSec = (performance.now() - progress.startedAt) / 1000;
  const etaSec =
    progress.ratio > 0.01 ? elapsedSec / progress.ratio - elapsedSec : Number.POSITIVE_INFINITY;
  return (
    <div className="flex flex-col gap-1.5">
      <Progress value={pct} className="h-2" />
      <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>{pct}%</span>
        <span>
          {progress.ratio > 0.01 && Number.isFinite(etaSec)
            ? `~${formatEta(etaSec)} left`
            : "Estimating…"}
        </span>
      </div>
    </div>
  );
}

// ============ Video Bank Modal ============
function VideoBank({
  clips,
  onClose,
  onDelete,
  onDownload,
  busyId,
  progress,
}: {
  clips: SavedClip[];
  onClose: () => void;
  onDelete: (id: string) => void;
  onDownload: (clip: SavedClip, format: DownloadFormat) => void;
  busyId: string | null;
  progress: ConvertProgress;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-card text-card-foreground rounded-xl border border-border w-full max-w-3xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Library className="size-5" /> Video Bank
          </h2>
          <Button size="icon" variant="ghost" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
        <div className="overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {clips.length === 0 && (
            <div className="col-span-full text-center text-sm text-muted-foreground py-16">
              <Video className="size-10 mx-auto mb-3 opacity-50" />
              No recordings yet. Record a take and it'll show up here.
            </div>
          )}
          {clips.map((c) => (
            <BankCard
              key={c.id}
              clip={c}
              onDelete={onDelete}
              onDownload={onDownload}
              busy={busyId === c.id}
              progress={busyId === c.id ? progress : null}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function BankCard({
  clip,
  onDelete,
  onDownload,
  busy,
  progress,
}: {
  clip: SavedClip;
  onDelete: (id: string) => void;
  onDownload: (clip: SavedClip, format: DownloadFormat) => void;
  busy: boolean;
  progress: ConvertProgress;
}) {
  const [url, setUrl] = useState<string>("");
  useEffect(() => {
    const u = URL.createObjectURL(clip.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [clip.blob]);
  return (
    <div className="rounded-lg border border-border p-3 flex flex-col gap-2 bg-background">
      {url && <video src={url} controls className="w-full rounded-md aspect-video bg-black" />}
      <div className="text-xs text-muted-foreground">
        {new Date(clip.createdAt).toLocaleString()} · {clip.durationSec}s · {clip.ext.toUpperCase()}
      </div>
      {busy && <ConvertProgressBar progress={progress} />}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          className="flex-1"
          onClick={() => onDownload(clip, "mp4")}
          disabled={busy}
        >
          <Download className="size-4" /> MP4
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onDownload(clip, "original")}
          disabled={busy}
        >
          .{clip.ext}
        </Button>
        <Button size="sm" variant="destructive" onClick={() => onDelete(clip.id)} disabled={busy}>
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}

// ============ Converter Modal ============
function ConverterModal({
  onClose,
  onConvert,
  converting,
  progress,
}: {
  onClose: () => void;
  onConvert: (file: File) => void;
  converting: boolean;
  progress: ConvertProgress;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-card text-card-foreground rounded-xl border border-border w-full max-w-md p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <FileVideo className="size-5" /> WebM → MP4
          </h2>
          <Button size="icon" variant="ghost" onClick={onClose} disabled={converting}>
            <X className="size-4" />
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          WebM conversion on iPhone only works for short clips. Longer WebMs need desktop/server
          conversion before they can be saved to Photos.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onConvert(f);
            e.currentTarget.value = "";
          }}
        />
        {converting && <ConvertProgressBar progress={progress} />}
        <Button
          size="lg"
          onClick={() => inputRef.current?.click()}
          disabled={converting}
        >
          {converting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <FileVideo className="size-4" />
          )}{" "}
          Choose WebM to convert
        </Button>
      </div>
    </div>
  );
}
