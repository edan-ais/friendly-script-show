import { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, Circle, Square, Download, Type, Gauge, FlipHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const SAMPLE = `Welcome to Prompter.

Paste your script here, hit play, and the words will glide up the screen at your chosen pace.

Click record to capture yourself reading — the video saves straight to your device when you stop.

Adjust speed and font size on the right. Mirror the text if you're reading off a reflective glass rig.`;

export function Teleprompter() {
  const [text, setText] = useState(SAMPLE);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(60); // px/sec
  const [fontSize, setFontSize] = useState(56);
  const [mirror, setMirror] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [camReady, setCamReady] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const recStartRef = useRef<number>(0);

  // webcam
  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { width: 1280, height: 720 }, audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCamReady(true);
      })
      .catch(() => setCamReady(false));
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // scroll loop
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

  // recording timer
  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - recStartRef.current) / 1000));
    }, 250);
    return () => clearInterval(id);
  }, [recording]);

  const reset = () => {
    setPlaying(false);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream) return;
    chunksRef.current = [];
    const mimeCandidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    const mime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      setRecordedUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    };
    rec.start();
    recorderRef.current = rec;
    recStartRef.current = Date.now();
    setElapsed(0);
    setRecording(true);
    setPlaying(true);
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    setRecording(false);
    setPlaying(false);
  };

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="h-screen w-screen overflow-hidden bg-black text-foreground relative">
      {/* Fullscreen webcam */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
        style={{ transform: "scaleX(-1)" }}
      />
      {/* Dim overlay for legibility */}
      <div className="absolute inset-0 bg-black/45 pointer-events-none" />

      {/* Prompter text column — narrow so ~4 words per line */}
      <div className="absolute inset-0 flex justify-center pointer-events-none">
        <div className="relative h-full w-full max-w-3xl">
          {/* fade gradients */}
          <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/80 to-transparent z-10 pointer-events-none" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/80 to-transparent z-10 pointer-events-none" />
          {/* reading line */}
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
                transform: mirror ? "scaleX(-1)" : undefined,
                textShadow: "0 2px 24px rgba(0,0,0,0.8)",
              }}
            >
              {text || "Paste your script in the panel →"}
            </p>
            <div style={{ height: "60vh" }} />
          </div>
        </div>
      </div>

      {/* REC badge — visible while recording */}
      {recording && (
        <div className="absolute top-6 left-6 z-30 flex items-center gap-2 px-3 py-1.5 rounded-full bg-destructive text-destructive-foreground text-sm font-medium">
          <Circle className="size-3 fill-current animate-pulse" />
          REC {fmt(elapsed)}
        </div>
      )}

      {/* Floating stop button — only while recording */}
      {recording && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30">
          <Button size="lg" variant="destructive" onClick={stopRecording} className="rounded-full shadow-2xl px-6">
            <Square className="size-4 fill-current" /> Stop recording
          </Button>
        </div>
      )}

      {/* Header — hidden while recording */}
      {!recording && (
        <header className="absolute top-0 inset-x-0 z-30 border-b border-white/10 bg-black/40 backdrop-blur px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold">P</div>
            <h1 className="text-xl font-bold">Prompter</h1>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className={`size-2 rounded-full ${camReady ? "bg-primary" : "bg-destructive"}`} />
            {camReady ? "Camera ready" : "Camera unavailable"}
          </div>
        </header>
      )}

      {/* Bottom controls — hidden while recording */}
      {!recording && (
        <div className="absolute bottom-0 inset-x-0 z-30 border-t border-white/10 bg-black/50 backdrop-blur px-6 py-4 flex items-center justify-center gap-3">
          <Button size="lg" variant="secondary" onClick={reset}>
            <RotateCcw className="size-4" /> Reset
          </Button>
          <Button size="lg" onClick={() => setPlaying((p) => !p)} className="min-w-32">
            {playing ? <><Pause className="size-4" /> Pause</> : <><Play className="size-4" /> Play</>}
          </Button>
          <Button size="lg" variant="destructive" onClick={startRecording} disabled={!camReady}>
            <Circle className="size-4 fill-current" /> Record
          </Button>
        </div>
      )}

      {/* Side panel — hidden while recording */}
      {!recording && (
        <aside className="absolute top-16 bottom-20 right-0 w-[340px] z-30 border-l border-white/10 bg-black/60 backdrop-blur p-5 flex flex-col gap-5 overflow-y-auto">
          <div className="flex flex-col gap-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Script</Label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste your script here…"
              className="min-h-64 resize-none font-mono text-sm bg-input border-border"
            />
            <p className="text-xs text-muted-foreground">{text.trim().split(/\s+/).filter(Boolean).length} words</p>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2 text-sm"><Gauge className="size-4" /> Speed</Label>
              <span className="text-sm text-muted-foreground tabular-nums">{speed} px/s</span>
            </div>
            <Slider value={[speed]} min={20} max={250} step={5} onValueChange={(v) => setSpeed(v[0])} />
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2 text-sm"><Type className="size-4" /> Font size</Label>
              <span className="text-sm text-muted-foreground tabular-nums">{fontSize}px</span>
            </div>
            <Slider value={[fontSize]} min={24} max={120} step={2} onValueChange={(v) => setFontSize(v[0])} />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="mirror" className="flex items-center gap-2 text-sm">
              <FlipHorizontal className="size-4" /> Mirror text
            </Label>
            <Switch id="mirror" checked={mirror} onCheckedChange={setMirror} />
          </div>

          {recordedUrl && (
            <div className="flex flex-col gap-3 pt-4 border-t border-border">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Last recording</Label>
              <video src={recordedUrl} controls className="w-full rounded-lg border border-border" />
              <Button asChild variant="secondary">
                <a href={recordedUrl} download={`prompter-${Date.now()}.webm`}>
                  <Download className="size-4" /> Download
                </a>
              </Button>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}
  );
}
