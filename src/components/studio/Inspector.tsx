import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  AudioClip,
  MediaAsset,
  OverlayClip,
  Project,
  Selection,
  SubtitleClip,
  VideoClip,
} from "@/lib/studio/types";
import type { Action } from "@/lib/studio/state";

type Props = {
  project: Project;
  selection: Selection;
  dispatch: (a: Action) => void;
  setPlayhead?: (time: number) => void;
};

export function Inspector({ project, selection, dispatch, setPlayhead }: Props) {
  if (!selection) {
    return (
      <div className="p-4 text-sm text-white/50">Select a clip on the timeline to edit it.</div>
    );
  }
  if (selection.track === "video") {
    const clip = project.video.find((c) => c.id === selection.id);
    if (!clip) return null;
    return (
      <VideoInspector
        clip={clip}
        assets={project.assets}
        dispatch={dispatch}
        setPlayhead={setPlayhead}
      />
    );
  }
  if (selection.track === "voice" || selection.track === "music") {
    const list = selection.track === "voice" ? project.voice : project.music;
    const clip = list.find((c) => c.id === selection.id);
    if (!clip) return null;
    return <AudioInspector clip={clip} track={selection.track} dispatch={dispatch} />;
  }
  if (selection.track === "overlays") {
    const clip = project.overlays.find((c) => c.id === selection.id);
    if (!clip) return null;
    return <OverlayInspector clip={clip} dispatch={dispatch} />;
  }
  if (selection.track === "subtitles") {
    const clip = project.subtitles.find((c) => c.id === selection.id);
    if (!clip) return null;
    return <SubtitleInspector clip={clip} dispatch={dispatch} />;
  }
  return null;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wide text-white/50">{label}</Label>
      {children}
    </div>
  );
}

function VideoInspector({
  clip,
  assets,
  dispatch,
  setPlayhead,
}: {
  clip: VideoClip;
  assets: MediaAsset[];
  dispatch: (a: Action) => void;
  setPlayhead?: (time: number) => void;
}) {
  const patch = (p: Partial<VideoClip>) =>
    dispatch({ type: "update_clip", track: "video", id: clip.id, patch: p });
  const videoAssets = assets.filter((a) => a.kind === "video");

  return (
    <div className="space-y-4 p-4 text-white">
      <h3 className="text-sm font-semibold">Video segment</h3>
      <Row label="Script line">
        <Textarea
          value={clip.sourceLine ?? ""}
          onChange={(e) => patch({ sourceLine: e.target.value })}
          rows={2}
          className="bg-white/5"
        />
      </Row>
      <Row label="Source clip">
        <Select
          value={clip.assetId ?? "__none"}
          onValueChange={(v) => {
            patch({ assetId: v === "__none" ? undefined : v, inPoint: 0 });
            setPlayhead?.(clip.start);
          }}
        >
          <SelectTrigger className="bg-white/5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">— No clip (black) —</SelectItem>
            {videoAssets.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <Row label={`Duration: ${clip.duration.toFixed(2)}s`}>
        <Slider
          min={0.5}
          max={30}
          step={0.1}
          value={[clip.duration]}
          onValueChange={([v]) => patch({ duration: v })}
        />
      </Row>
      <Row label={`Source in-point: ${clip.inPoint.toFixed(2)}s`}>
        <Slider
          min={0}
          max={Math.max(0.1, (assets.find((a) => a.id === clip.assetId)?.duration ?? 30) - 0.1)}
          step={0.1}
          value={[clip.inPoint]}
          onValueChange={([v]) => patch({ inPoint: v })}
        />
      </Row>
      <Row label={`Speed: ${clip.speed.toFixed(2)}×`}>
        <Slider
          min={0.25}
          max={4}
          step={0.05}
          value={[clip.speed]}
          onValueChange={([v]) => patch({ speed: v })}
        />
      </Row>
      <div className="flex items-center justify-between">
        <Label className="text-xs text-white/70">Preserve pitch</Label>
        <Switch checked={clip.preservePitch} onCheckedChange={(v) => patch({ preservePitch: v })} />
      </div>
      <Row label={`Zoom: ${clip.zoom.toFixed(2)}×`}>
        <Slider
          min={1}
          max={4}
          step={0.05}
          value={[clip.zoom]}
          onValueChange={([v]) => patch({ zoom: v })}
        />
      </Row>
      <Row label={`Pan X: ${clip.panX.toFixed(2)}`}>
        <Slider
          min={-1}
          max={1}
          step={0.01}
          value={[clip.panX]}
          onValueChange={([v]) => patch({ panX: v })}
        />
      </Row>
      <Row label={`Pan Y: ${clip.panY.toFixed(2)}`}>
        <Slider
          min={-1}
          max={1}
          step={0.01}
          value={[clip.panY]}
          onValueChange={([v]) => patch({ panY: v })}
        />
      </Row>
      <Row label={`Fade in: ${clip.fadeIn.toFixed(2)}s`}>
        <Slider
          min={0}
          max={Math.min(2, clip.duration / 2)}
          step={0.05}
          value={[clip.fadeIn]}
          onValueChange={([v]) => patch({ fadeIn: v })}
        />
      </Row>
      <Row label={`Fade out: ${clip.fadeOut.toFixed(2)}s`}>
        <Slider
          min={0}
          max={Math.min(2, clip.duration / 2)}
          step={0.05}
          value={[clip.fadeOut]}
          onValueChange={([v]) => patch({ fadeOut: v })}
        />
      </Row>
      <Row label="Role">
        <Select value={clip.role} onValueChange={(v) => patch({ role: v as VideoClip["role"] })}>
          <SelectTrigger className="bg-white/5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="intro">Intro</SelectItem>
            <SelectItem value="segment">Segment</SelectItem>
            <SelectItem value="outro">Outro</SelectItem>
          </SelectContent>
        </Select>
      </Row>
    </div>
  );
}

function AudioInspector({
  clip,
  track,
  dispatch,
}: {
  clip: AudioClip;
  track: "voice" | "music";
  dispatch: (a: Action) => void;
}) {
  const patch = (p: Partial<AudioClip>) =>
    dispatch({ type: "update_clip", track, id: clip.id, patch: p });
  return (
    <div className="space-y-4 p-4 text-white">
      <h3 className="text-sm font-semibold capitalize">{track} clip</h3>
      <Row label={`Start: ${clip.start.toFixed(2)}s`}>
        <Slider
          min={0}
          max={300}
          step={0.1}
          value={[clip.start]}
          onValueChange={([v]) => patch({ start: v })}
        />
      </Row>
      <Row label={`Duration: ${clip.duration.toFixed(2)}s`}>
        <Slider
          min={0.5}
          max={600}
          step={0.1}
          value={[clip.duration]}
          onValueChange={([v]) => patch({ duration: v })}
        />
      </Row>
      <Row label={`In-point: ${clip.inPoint.toFixed(2)}s`}>
        <Slider
          min={0}
          max={600}
          step={0.1}
          value={[clip.inPoint]}
          onValueChange={([v]) => patch({ inPoint: v })}
        />
      </Row>
      <Row label={`Volume: ${Math.round(clip.volume * 100)}%`}>
        <Slider
          min={0}
          max={1.5}
          step={0.01}
          value={[clip.volume]}
          onValueChange={([v]) => patch({ volume: v })}
        />
      </Row>
      <Row label={`Fade in: ${clip.fadeIn.toFixed(2)}s`}>
        <Slider
          min={0}
          max={5}
          step={0.05}
          value={[clip.fadeIn]}
          onValueChange={([v]) => patch({ fadeIn: v })}
        />
      </Row>
      <Row label={`Fade out: ${clip.fadeOut.toFixed(2)}s`}>
        <Slider
          min={0}
          max={5}
          step={0.05}
          value={[clip.fadeOut]}
          onValueChange={([v]) => patch({ fadeOut: v })}
        />
      </Row>
    </div>
  );
}

function OverlayInspector({
  clip,
  dispatch,
}: {
  clip: OverlayClip;
  dispatch: (a: Action) => void;
}) {
  const patch = (p: Partial<OverlayClip>) =>
    dispatch({ type: "update_clip", track: "overlays", id: clip.id, patch: p });
  return (
    <div className="space-y-4 p-4 text-white">
      <h3 className="text-sm font-semibold">Text overlay</h3>
      <Row label="Text">
        <Textarea
          value={clip.text}
          onChange={(e) => patch({ text: e.target.value })}
          rows={2}
          className="bg-white/5"
        />
      </Row>
      <Row label={`Start: ${clip.start.toFixed(2)}s`}>
        <Slider
          min={0}
          max={300}
          step={0.1}
          value={[clip.start]}
          onValueChange={([v]) => patch({ start: v })}
        />
      </Row>
      <Row label={`Duration: ${clip.duration.toFixed(2)}s`}>
        <Slider
          min={0.2}
          max={30}
          step={0.1}
          value={[clip.duration]}
          onValueChange={([v]) => patch({ duration: v })}
        />
      </Row>
      <Row label="Position">
        <Select
          value={clip.position}
          onValueChange={(v) => patch({ position: v as OverlayClip["position"] })}
        >
          <SelectTrigger className="bg-white/5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="top">Top</SelectItem>
            <SelectItem value="center">Center</SelectItem>
            <SelectItem value="bottom">Bottom</SelectItem>
          </SelectContent>
        </Select>
      </Row>
      <Row label={`Font size: ${clip.fontSize}px`}>
        <Slider
          min={24}
          max={160}
          step={2}
          value={[clip.fontSize]}
          onValueChange={([v]) => patch({ fontSize: v })}
        />
      </Row>
      <div className="grid grid-cols-2 gap-3">
        <Row label="Text color">
          <Input
            type="color"
            value={clip.textColor}
            onChange={(e) => patch({ textColor: e.target.value })}
            className="h-9 bg-white/5"
          />
        </Row>
        <Row label="Box color">
          <Input
            type="color"
            value={clip.boxColor}
            onChange={(e) => patch({ boxColor: e.target.value })}
            className="h-9 bg-white/5"
          />
        </Row>
      </div>
      <Row label={`Box opacity: ${Math.round(clip.boxOpacity * 100)}%`}>
        <Slider
          min={0}
          max={1}
          step={0.05}
          value={[clip.boxOpacity]}
          onValueChange={([v]) => patch({ boxOpacity: v })}
        />
      </Row>
      <Row label={`Fade in: ${clip.fadeIn.toFixed(2)}s`}>
        <Slider
          min={0}
          max={2}
          step={0.05}
          value={[clip.fadeIn]}
          onValueChange={([v]) => patch({ fadeIn: v })}
        />
      </Row>
      <Row label={`Fade out: ${clip.fadeOut.toFixed(2)}s`}>
        <Slider
          min={0}
          max={2}
          step={0.05}
          value={[clip.fadeOut]}
          onValueChange={([v]) => patch({ fadeOut: v })}
        />
      </Row>
    </div>
  );
}

function SubtitleInspector({
  clip,
  dispatch,
}: {
  clip: SubtitleClip;
  dispatch: (a: Action) => void;
}) {
  const patch = (p: Partial<SubtitleClip>) =>
    dispatch({ type: "update_clip", track: "subtitles", id: clip.id, patch: p });
  return (
    <div className="space-y-4 p-4 text-white">
      <h3 className="text-sm font-semibold">Subtitle</h3>
      <Row label="Text">
        <Textarea
          value={clip.text}
          onChange={(e) => patch({ text: e.target.value })}
          rows={3}
          className="bg-white/5"
        />
      </Row>
      <Row label={`Start: ${clip.start.toFixed(2)}s`}>
        <Slider
          min={0}
          max={600}
          step={0.05}
          value={[clip.start]}
          onValueChange={([v]) => patch({ start: v })}
        />
      </Row>
      <Row label={`Duration: ${clip.duration.toFixed(2)}s`}>
        <Slider
          min={0.2}
          max={30}
          step={0.05}
          value={[clip.duration]}
          onValueChange={([v]) => patch({ duration: v })}
        />
      </Row>
    </div>
  );
}

export function ToolbarButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Button size="sm" variant="secondary" {...props}>
      {children}
    </Button>
  );
}
