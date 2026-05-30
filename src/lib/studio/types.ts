// Studio editor data model. All times in seconds.

export type Aspect = "16:9" | "9:16";

export const ASPECT_DIMS: Record<Aspect, { w: number; h: number }> = {
  "16:9": { w: 1920, h: 1080 },
  "9:16": { w: 1080, h: 1920 },
};

export type MediaAsset = {
  id: string;
  name: string;
  kind: "video" | "audio";
  mime: string;
  url: string; // object URL
  duration: number; // seconds
  width?: number;
  height?: number;
};

export type VideoClip = {
  id: string;
  kind: "video";
  start: number; // timeline start
  duration: number; // timeline length (after speed)
  assetId?: string; // optional: empty = blank/black
  inPoint: number; // seconds into source
  // edit
  speed: number; // 0.25..4
  preservePitch: boolean;
  zoom: number; // 1..4
  panX: number; // -1..1 (fraction of frame)
  panY: number; // -1..1
  fadeIn: number; // seconds
  fadeOut: number; // seconds
  // role
  role: "intro" | "segment" | "outro";
  sourceLine?: string; // script line that created it
};

export type AudioClip = {
  id: string;
  kind: "audio";
  start: number;
  duration: number;
  assetId: string;
  inPoint: number;
  volume: number; // 0..1
  fadeIn: number;
  fadeOut: number;
  track: "voice" | "music";
};

export type OverlayClip = {
  id: string;
  kind: "overlay";
  start: number;
  duration: number;
  text: string;
  position: "top" | "center" | "bottom";
  boxColor: string; // css
  boxOpacity: number; // 0..1
  textColor: string;
  fontSize: number; // px relative to 1080-tall canvas
  fadeIn: number;
  fadeOut: number;
};

export type SubtitleClip = {
  id: string;
  kind: "subtitle";
  start: number;
  duration: number;
  text: string;
  segmentId?: string; // link to original segment
};

export type AnyClip = VideoClip | AudioClip | OverlayClip | SubtitleClip;

export type Project = {
  name: string;
  aspect: Aspect;
  assets: MediaAsset[];
  video: VideoClip[];
  voice: AudioClip[];
  music: AudioClip[];
  overlays: OverlayClip[];
  subtitles: SubtitleClip[];
};

export type Selection =
  | { track: "video"; id: string }
  | { track: "voice"; id: string }
  | { track: "music"; id: string }
  | { track: "overlays"; id: string }
  | { track: "subtitles"; id: string }
  | null;

export function emptyProject(): Project {
  return {
    name: "Untitled project",
    aspect: "16:9",
    assets: [],
    video: [],
    voice: [],
    music: [],
    overlays: [],
    subtitles: [],
  };
}

export function projectDuration(p: Project): number {
  const end = (c: { start: number; duration: number }) => c.start + c.duration;
  const all = [
    ...p.video,
    ...p.voice,
    ...p.music,
    ...p.overlays,
    ...p.subtitles,
  ];
  return all.reduce((max, c) => Math.max(max, end(c)), 0);
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
