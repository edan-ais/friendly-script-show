import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type MutableRefObject, type PointerEvent } from "react";
import {
  ArrowLeft,
  Circle,
  Square,
  MonitorUp,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Camera,
  CameraOff,
  PictureInPicture2,
  Library,
  Loader2,
  Gauge,
  Type,
  Play,
  Pause,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { saveClip } from "@/lib/video-bank";
import { useAuth } from "@/hooks/use-auth";
import { loadOrCreateScript, saveScript } from "@/lib/persistence/scripts";

type Stage = "setup" | "live";

const SAMPLE = `Welcome to Screen Cast.\n\nHit record, pick the window or screen to share, and I'll capture your screen with your face in the corner — just like Loom.\n\nPop out the teleprompter and the script floats above any app so you can read while you demo.`;

// ---------- helpers ----------
function fmt(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

interface DocumentPictureInPictureWindow {
  document: Document;
  addEventListener(type: "pagehide", listener: () => void): void;
  close(): void;
}
interface DocumentPictureInPicture {
  requestWindow(opts: { width: number; height: number }): Promise<DocumentPictureInPictureWindow>;
  window: DocumentPictureInPictureWindow | null;
}

function getDocPiP(): DocumentPictureInPicture | null {
  const w = window as unknown as { documentPictureInPicture?: DocumentPictureInPicture };
  return w.documentPictureInPicture ?? null;
}

export function ScreenCast() {
  const { user, ready } = useAuth();

  // ---- script / settings ----
  const [text, setText] = useState("");
  const [scriptId, setScriptId] = useState<string | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [speed, setSpeed] = useState(60);
  const [fontSize, setFontSize] = useState(36);
  const [micOn, setMicOn] = useState(true);
  const [sysAudioOn, setSysAudioOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [pipPos, setPipPos] = useState<"br" | "bl" | "tr" | "tl">("br");

  // ---- stage ----
  const [stage, setStage] = useState<Stage>("setup");
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [pipActive, setPipActive] = useState(false);

  // ---- refs ----
  const screenStreamRef = useRef<MediaStream | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const compositeStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recStartRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null); // shows the canvas
  const screenVideoRef = useRef<HTMLVideoElement | null>(null); // hidden source
  const camVideoRef = useRef<HTMLVideoElement | null>(null); // hidden source

  // floating teleprompter (page-side overlay)
  const promptScrollRef = useRef<HTMLDivElement | null>(null);
  const pipPromptScrollRef = useRef<HTMLDivElement | null>(null);
  const pipWindowRef = useRef<DocumentPictureInPictureWindow | null>(null);
  const scrollSaveTimer = useRef<number | null>(null);

  const getSourceVideo = (ref: MutableRefObject<HTMLVideoElement | null>) => {
    if (ref.current) return ref.current;
    const video = document.createElement("video");
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    ref.current = video;
    return video;
  };

  const getCanvas = () => {
    if (canvasRef.current) return canvasRef.current;
    const canvas = document.createElement("canvas");
    canvasRef.current = canvas;
    return canvas;
  };

  // ---- load script ----
  useEffect(() => {
    if (!user) return;
    loadOrCreateScript(user.id)
      .then((row) => {
        setScriptId(row.id);
        setText(row.content || SAMPLE);
        setScriptLoaded(true);
      })
      .catch(() => {
        setText(SAMPLE);
        setScriptLoaded(true);
      });
  }, [user]);

  // debounced script save
  useEffect(() => {
    if (!scriptId || !scriptLoaded) return;
    if (scrollSaveTimer.current) window.clearTimeout(scrollSaveTimer.current);
    scrollSaveTimer.current = window.setTimeout(() => {
      saveScript(scriptId, { content: text }).catch(() => {});
    }, 600);
    return () => {
      if (scrollSaveTimer.current) window.clearTimeout(scrollSaveTimer.current);
    };
  }, [text, scriptId, scriptLoaded]);

  // ---- recording timer ----
  useEffect(() => {
    if (!recording) return;
    const id = setInterval(
      () => setElapsed(Math.floor((Date.now() - recStartRef.current) / 1000)),
      250,
    );
    return () => clearInterval(id);
  }, [recording]);

  // ---- teleprompter scroll loop (both the on-page overlay and the PiP doc) ----
  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    let last: number | null = null;
    const tick = (ts: number) => {
      if (last == null) last = ts;
      const dt = (ts - last) / 1000;
      last = ts;
      const inc = speed * dt;
      const targets = [promptScrollRef.current, pipPromptScrollRef.current];
      for (const el of targets) {
        if (!el) continue;
        el.scrollTop += inc;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, speed]);

  // ---- cleanup on unmount ----
  useEffect(() => {
    return () => {
      stopAllTracks();
      pipWindowRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopAllTracks() {
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    camStreamRef.current?.getTracks().forEach((t) => t.stop());
    compositeStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    camStreamRef.current = null;
    compositeStreamRef.current = null;
  }

  // ---- composite renderer ----
  function startCompositeLoop(width: number, height: number) {
    const canvas = getCanvas();
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false })!;

    const draw = () => {
      const sv = screenVideoRef.current;
      const cv = camVideoRef.current;
      if (sv && sv.readyState >= 2) {
        // letterbox the screen into the canvas (cover, preserve aspect)
        const sr = sv.videoWidth / sv.videoHeight;
        const cr = width / height;
        let dw = width;
        let dh = height;
        let dx = 0;
        let dy = 0;
        if (sr > cr) {
          dh = width / sr;
          dy = (height - dh) / 2;
        } else {
          dw = height * sr;
          dx = (width - dw) / 2;
        }
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(sv, dx, dy, dw, dh);
      } else {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, width, height);
      }
      if (camOn && cv && cv.readyState >= 2 && cv.videoWidth > 0 && cv.videoHeight > 0) {
        // circular webcam, ~22% of canvas height, position from current pipPos
        const size = Math.round(height * 0.22);
        const margin = Math.round(height * 0.025);
        const x =
          pipPos === "br" || pipPos === "tr" ? width - size - margin : margin;
        const y =
          pipPos === "br" || pipPos === "bl" ? height - size - margin : margin;
        // shadow ring
        ctx.save();
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, size / 2 + 4, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fill();
        // clip circle
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        // mirror cam
        ctx.translate(x + size, y);
        ctx.scale(-1, 1);
        const cr = cv.videoWidth / cv.videoHeight;
        // cover into square
        let sx = 0;
        let sy = 0;
        let sw = cv.videoWidth;
        let sh = cv.videoHeight;
        if (cr > 1) {
          sw = cv.videoHeight;
          sx = (cv.videoWidth - sw) / 2;
        } else {
          sh = cv.videoWidth;
          sy = (cv.videoHeight - sh) / 2;
        }
        ctx.drawImage(cv, sx, sy, sw, sh, 0, 0, size, size);
        ctx.restore();
        // outline
        ctx.save();
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.stroke();
        ctx.restore();
      }
      rafCompositeRef.current = requestAnimationFrame(draw);
    };
    rafCompositeRef.current = requestAnimationFrame(draw);
  }

  const rafCompositeRef = useRef<number | null>(null);
  function stopCompositeLoop() {
    if (rafCompositeRef.current) cancelAnimationFrame(rafCompositeRef.current);
    rafCompositeRef.current = null;
  }

  // ---- start cast: gets streams, opens stage ----
  const startCast = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // 1) screen + optional system audio
      const screen = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: sysAudioOn,
      });
      screenStreamRef.current = screen;
      // user stopped sharing → bail
      screen.getVideoTracks()[0].addEventListener("ended", () => {
        if (recording) stopRecording();
        teardown();
      });

      // 2) cam + mic
      const cam = await navigator.mediaDevices.getUserMedia({
        video: camOn ? { facingMode: "user", width: 640, height: 480 } : false,
        audio: micOn,
      });
      camStreamRef.current = cam;

      // Attach to detached source elements so React stage changes cannot remount
      // them and drop the streams while the canvas compositor is drawing.
      const screenVideo = getSourceVideo(screenVideoRef);
      screenVideo.srcObject = screen;
      await screenVideo.play().catch(() => {});

      const camVideo = getSourceVideo(camVideoRef);
      camVideo.srcObject = new MediaStream(cam.getVideoTracks());
      await camVideo.play().catch(() => {});

      // wait one frame for metadata
      const vw = screen.getVideoTracks()[0].getSettings().width || 1280;
      const vh = screen.getVideoTracks()[0].getSettings().height || 720;

      startCompositeLoop(vw, vh);

      // build composite stream: canvas video + audio tracks
      const compositeVideo = getCanvas().captureStream(30);
      const composite = new MediaStream();
      compositeVideo.getVideoTracks().forEach((t) => composite.addTrack(t));

      // mix audio (mic + system) via WebAudio if both present
      const audioTracks: MediaStreamTrack[] = [];
      const micTrack = cam.getAudioTracks()[0];
      const sysTrack = screen.getAudioTracks()[0];
      if (micTrack && sysTrack) {
        const ac = new AudioContext();
        const dest = ac.createMediaStreamDestination();
        ac.createMediaStreamSource(new MediaStream([micTrack])).connect(dest);
        ac.createMediaStreamSource(new MediaStream([sysTrack])).connect(dest);
        dest.stream.getAudioTracks().forEach((t) => audioTracks.push(t));
      } else if (micTrack) {
        audioTracks.push(micTrack);
      } else if (sysTrack) {
        audioTracks.push(sysTrack);
      }
      audioTracks.forEach((t) => composite.addTrack(t));
      compositeStreamRef.current = composite;

      // show preview
      if (previewRef.current) {
        previewRef.current.srcObject = composite;
        previewRef.current.play().catch(() => {});
      }
      setStage("live");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Couldn't start cast");
      teardown();
    } finally {
      setBusy(false);
    }
  };

  function teardown() {
    stopCompositeLoop();
    stopAllTracks();
    setStage("setup");
    setRecording(false);
    setPlaying(false);
  }

  const exitStage = () => {
    if (recording) {
      try {
        recorderRef.current?.stop();
      } catch {
        /* ignore */
      }
    }
    teardown();
  };

  const beginRecording = () => {
    const composite = compositeStreamRef.current;
    if (!composite) return;
    chunksRef.current = [];
    const mimeCandidates = [
      "video/mp4;codecs=h264,aac",
      "video/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ];
    const mime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    const rec = new MediaRecorder(
      composite,
      mime ? { mimeType: mime, videoBitsPerSecond: 4_000_000 } : undefined,
    );
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = async () => {
      const type = rec.mimeType || "video/webm";
      const blob = new Blob(chunksRef.current, { type });
      const ext: "webm" | "mp4" = type.includes("mp4") ? "mp4" : "webm";
      const durationSec = Math.floor((Date.now() - recStartRef.current) / 1000);
      try {
        await saveClip({
          blob,
          ext,
          durationSec,
          name: `Cast ${new Date().toLocaleString()}`,
        });
        toast.success("Saved to your video bank");
      } catch (e) {
        console.error(e);
        toast.error("Couldn't save the cast");
      }
    };
    rec.onerror = (e) => {
      console.error(e);
      toast.error("Recording error");
    };
    rec.start(1000);
    recorderRef.current = rec;
    recStartRef.current = Date.now();
    setElapsed(0);
    setRecording(true);
    setPlaying(true);
  };

  const startRecording = () => {
    if (!compositeStreamRef.current) return;
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
    try {
      recorderRef.current?.stop();
    } catch {
      /* ignore */
    }
    setRecording(false);
    setPlaying(false);
  };

  const resetScroll = () => {
    setPlaying(false);
    if (promptScrollRef.current) promptScrollRef.current.scrollTop = 0;
    if (pipPromptScrollRef.current) pipPromptScrollRef.current.scrollTop = 0;
  };

  // ---- Document PiP teleprompter ----
  const openPiP = async () => {
    const dpip = getDocPiP();
    if (!dpip) {
      // Fallback: regular popup window
      const w = window.open(
        "",
        "prompter-pop",
        "popup,width=520,height=320,alwaysRaised,left=40,top=40",
      );
      if (!w) {
        toast.error("Allow popups to pop out the teleprompter");
        return;
      }
      writePopDocument(w.document);
      pipWindowRef.current = {
        document: w.document,
        addEventListener: (_t, l) => w.addEventListener("beforeunload", l),
        close: () => w.close(),
      };
      attachPipScrollRef(w.document);
      setPipActive(true);
      return;
    }
    try {
      const pw = await dpip.requestWindow({ width: 520, height: 320 });
      writePopDocument(pw.document);
      pw.addEventListener("pagehide", () => {
        pipPromptScrollRef.current = null;
        pipWindowRef.current = null;
        setPipActive(false);
      });
      pipWindowRef.current = pw;
      attachPipScrollRef(pw.document);
      setPipActive(true);
    } catch (e) {
      console.error(e);
      toast.error("Couldn't open floating teleprompter");
    }
  };

  const closePiP = () => {
    pipWindowRef.current?.close();
    pipWindowRef.current = null;
    pipPromptScrollRef.current = null;
    setPipActive(false);
  };

  function writePopDocument(doc: Document) {
    doc.documentElement.innerHTML = `
      <head>
        <meta charset="utf-8" />
        <title>Teleprompter</title>
        <style>
          :root { color-scheme: dark; }
          html,body { margin:0; padding:0; height:100%; background:#000; color:#fff;
            font-family: 'Space Grotesk', system-ui, -apple-system, Segoe UI, sans-serif; }
          .wrap { position:relative; height:100%; overflow:hidden; }
          .fade-t, .fade-b { position:absolute; left:0; right:0; height:60px; z-index:2; pointer-events:none; }
          .fade-t { top:0; background:linear-gradient(180deg, rgba(0,0,0,0.95), transparent); }
          .fade-b { bottom:0; background:linear-gradient(0deg, rgba(0,0,0,0.95), transparent); }
          .line { position:absolute; left:8px; right:8px; top:50%; border-top:2px solid rgba(239,51,64,0.65); z-index:2; }
          .scroll { position:absolute; inset:0; overflow-y:auto; padding:0 18px; }
          .scroll::-webkit-scrollbar { display:none; }
          .pad { height:50%; }
          .text { white-space:pre-wrap; text-align:center; font-weight:700; line-height:1.15;
            text-shadow:0 2px 16px rgba(0,0,0,0.85); }
        </style>
      </head>
      <body>
        <div class="wrap">
          <div class="fade-t"></div>
          <div class="fade-b"></div>
          <div class="line"></div>
          <div id="scroll" class="scroll">
            <div class="pad"></div>
            <div id="text" class="text"></div>
            <div class="pad"></div>
          </div>
        </div>
      </body>
    `;
  }

  function attachPipScrollRef(doc: Document) {
    const el = doc.getElementById("scroll") as HTMLDivElement | null;
    const txt = doc.getElementById("text") as HTMLDivElement | null;
    if (txt) {
      txt.textContent = text || SAMPLE;
      txt.style.fontSize = `${Math.max(20, Math.round(fontSize * 0.85))}px`;
    }
    pipPromptScrollRef.current = el;
  }

  // keep PiP doc text in sync with edits / settings
  useEffect(() => {
    const w = pipWindowRef.current;
    if (!w) return;
    const txt = w.document.getElementById("text");
    if (txt) {
      txt.textContent = text || SAMPLE;
      (txt as HTMLElement).style.fontSize = `${Math.max(20, Math.round(fontSize * 0.85))}px`;
    }
  }, [text, fontSize, pipActive]);

  // ----------------- RENDER -----------------
  if (!ready) return <div className="min-h-screen bg-background" />;
  if (!user) return <div className="min-h-screen bg-background" />;
  if (!scriptLoaded) {
    return (
      <div className="min-h-screen w-full bg-background text-foreground flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Source media elements are intentionally detached from React DOM so route
  // stage changes cannot remount them and break the active screen/camera feeds.
  const hiddenSources = null;

  if (stage === "setup") {
    return (
      <div className="min-h-screen w-full bg-background text-foreground">
        {hiddenSources}
        <header className="border-b border-border bg-card/40 backdrop-blur px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild className="-ml-2">
              <Link to="/prompter">
                <ArrowLeft className="size-5" />
              </Link>
            </Button>
            <div className="size-8 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold">
              <MonitorUp className="size-4" />
            </div>
            <h1 className="text-xl font-bold">Screen Cast</h1>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/prompter">
              <Library className="size-4" /> <span className="hidden sm:inline">Video bank</span>
            </Link>
          </Button>
        </header>

        <main className="max-w-2xl mx-auto p-4 sm:p-6 flex flex-col gap-6 pb-32">
          <section className="flex flex-col gap-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Script</Label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste your script here…"
              className="min-h-56 resize-y font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {text.trim().split(/\s+/).filter(Boolean).length} words · shared with Prompter
            </p>
          </section>

          <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-border p-3 flex items-center justify-between">
              <Label htmlFor="mic" className="flex items-center gap-2 text-sm">
                {micOn ? <Mic className="size-4" /> : <MicOff className="size-4" />} Microphone
              </Label>
              <Switch id="mic" checked={micOn} onCheckedChange={setMicOn} />
            </div>
            <div className="rounded-lg border border-border p-3 flex items-center justify-between">
              <Label htmlFor="sys" className="flex items-center gap-2 text-sm">
                {sysAudioOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />} System
                audio
              </Label>
              <Switch id="sys" checked={sysAudioOn} onCheckedChange={setSysAudioOn} />
            </div>
            <div className="rounded-lg border border-border p-3 flex items-center justify-between">
              <Label htmlFor="cam" className="flex items-center gap-2 text-sm">
                {camOn ? <Camera className="size-4" /> : <CameraOff className="size-4" />} Webcam
                overlay
              </Label>
              <Switch id="cam" checked={camOn} onCheckedChange={setCamOn} />
            </div>
            <div className="rounded-lg border border-border p-3 flex items-center justify-between">
              <Label className="text-sm">Cam position</Label>
              <div className="flex gap-1">
                {(["tl", "tr", "bl", "br"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPipPos(p)}
                    className={`size-8 rounded border ${
                      pipPos === p
                        ? "border-primary bg-primary/20"
                        : "border-border bg-card"
                    } relative`}
                    aria-label={p}
                  >
                    <span
                      className={`absolute size-2 rounded-full bg-foreground/90 ${
                        p === "tl" ? "top-1 left-1" : ""
                      } ${p === "tr" ? "top-1 right-1" : ""} ${
                        p === "bl" ? "bottom-1 left-1" : ""
                      } ${p === "br" ? "bottom-1 right-1" : ""}`}
                    />
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2 text-sm">
                <Gauge className="size-4" /> Scroll speed
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
              min={20}
              max={80}
              step={2}
              onValueChange={(v) => setFontSize(v[0])}
            />
          </section>
        </main>

        <div className="fixed bottom-0 inset-x-0 z-20 border-t border-border bg-card/90 backdrop-blur px-4 py-3 flex gap-2 justify-center">
          <Button
            size="lg"
            variant="destructive"
            className="flex-1 max-w-sm"
            onClick={startCast}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MonitorUp className="size-4" />
            )}{" "}
            Start screen cast
          </Button>
        </div>
      </div>
    );
  }

  // ---------- LIVE STAGE ----------
  return (
    <div className="h-[100dvh] w-screen bg-black text-foreground relative overflow-hidden">
      {hiddenSources}

      {/* Live composite preview */}
      <video
        ref={previewRef}
        autoPlay
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-contain bg-black"
      />

      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 z-30 flex items-center justify-between gap-2 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 bg-gradient-to-b from-black/70 to-transparent">
        <Button size="sm" variant="secondary" onClick={exitStage} className="rounded-full">
          <ArrowLeft className="size-4" /> Exit
        </Button>
        {recording ? (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-destructive text-destructive-foreground text-sm font-medium">
            <Circle className="size-3 fill-current animate-pulse" />
            REC {fmt(elapsed)}
          </div>
        ) : (
          <div className="text-xs text-white/70 px-3 py-1.5 rounded-full bg-white/10">
            Live preview · ready
          </div>
        )}
        <Button
          size="sm"
          variant={pipActive ? "default" : "secondary"}
          onClick={pipActive ? closePiP : openPiP}
          className="rounded-full"
          title="Pop out the teleprompter so it floats above any app"
        >
          <PictureInPicture2 className="size-4" />
          <span className="hidden sm:inline">
            {pipActive ? "Close prompter" : "Pop out prompter"}
          </span>
        </Button>
      </div>

      {/* Floating on-page teleprompter overlay */}
      <FloatingPrompter
        text={text || SAMPLE}
        fontSize={fontSize}
        scrollRef={promptScrollRef}
      />

      {/* Countdown */}
      {countdown > 0 && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none">
          <div className="text-[180px] font-display font-bold text-primary leading-none animate-pulse">
            {countdown}
          </div>
        </div>
      )}

      {/* Bottom controls */}
      <div className="absolute inset-x-0 bottom-0 z-30 flex flex-wrap items-center justify-center gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 bg-gradient-to-t from-black/70 to-transparent">
        <Button
          size="lg"
          variant="secondary"
          onClick={() => setPlaying((p) => !p)}
          className="rounded-full shadow-xl"
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
          variant="secondary"
          onClick={resetScroll}
          className="rounded-full shadow-xl"
        >
          <RotateCcw className="size-4" /> Reset
        </Button>
        {recording ? (
          <Button
            size="lg"
            variant="destructive"
            onClick={stopRecording}
            className="rounded-full shadow-xl"
          >
            <Square className="size-4 fill-current" /> Stop
          </Button>
        ) : (
          <Button
            size="lg"
            variant="destructive"
            onClick={startRecording}
            disabled={countdown > 0}
            className="rounded-full shadow-xl"
          >
            <Circle className="size-4 fill-current" /> Record
          </Button>
        )}
      </div>
    </div>
  );
}

// =================== Floating draggable teleprompter ===================
function FloatingPrompter({
  text,
  fontSize,
  scrollRef,
}: {
  text: string;
  fontSize: number;
  scrollRef: MutableRefObject<HTMLDivElement | null>;
}) {
  const [pos, setPos] = useState({ x: 24, y: 80 });
  const [size, setSize] = useState({ w: 520, h: 280 });
  const [collapsed, setCollapsed] = useState(false);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  const onPointerDown = (e: PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!dragRef.current) return;
    const x = Math.max(0, Math.min(window.innerWidth - size.w, e.clientX - dragRef.current.dx));
    const y = Math.max(0, Math.min(window.innerHeight - 60, e.clientY - dragRef.current.dy));
    setPos({ x, y });
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div
      className="absolute z-30 rounded-xl border border-white/15 bg-black/65 backdrop-blur-md shadow-2xl"
      style={{ left: pos.x, top: pos.y, width: size.w, height: collapsed ? 36 : size.h }}
    >
      <div
        className="h-9 flex items-center justify-between px-2 cursor-move select-none border-b border-white/10"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div className="flex items-center gap-2 text-xs text-white/80 px-1.5">
          <span className="size-1.5 rounded-full bg-primary" /> Teleprompter
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setSize((s) => ({ ...s, w: Math.max(300, s.w - 60) }))}
            className="text-white/70 hover:text-white text-xs px-2"
            aria-label="Narrower"
          >
            −W
          </button>
          <button
            onClick={() => setSize((s) => ({ ...s, w: Math.min(window.innerWidth - pos.x, s.w + 60) }))}
            className="text-white/70 hover:text-white text-xs px-2"
            aria-label="Wider"
          >
            +W
          </button>
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="text-white/70 hover:text-white text-xs px-2"
            aria-label={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? "▢" : "—"}
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="relative" style={{ height: size.h - 36 }}>
          <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-black/85 to-transparent z-10 pointer-events-none" />
          <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/85 to-transparent z-10 pointer-events-none" />
          <div className="absolute inset-x-3 top-1/2 -translate-y-1/2 border-t-2 border-primary/60 z-10 pointer-events-none" />
          <div
            ref={scrollRef}
            className="absolute inset-0 overflow-y-auto px-4"
            style={{ scrollbarWidth: "none" }}
          >
            <div style={{ height: "50%" }} />
            <p
              className="whitespace-pre-wrap font-display font-bold leading-[1.15] text-white text-center"
              style={{
                fontSize: `${fontSize}px`,
                textShadow: "0 2px 16px rgba(0,0,0,0.9)",
              }}
            >
              {text}
            </p>
            <div style={{ height: "60%" }} />
          </div>
        </div>
      )}
    </div>
  );
}
