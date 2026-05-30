import {
  type AnyClip,
  type AudioClip,
  type MediaAsset,
  type OverlayClip,
  type Project,
  type SubtitleClip,
  type VideoClip,
  uid,
} from "./types";

export type Action =
  | { type: "set"; project: Project }
  | { type: "rename"; name: string }
  | { type: "set_aspect"; aspect: Project["aspect"] }
  | { type: "add_asset"; asset: MediaAsset }
  | { type: "remove_asset"; id: string }
  | { type: "add_video"; clip: VideoClip }
  | { type: "add_audio"; track: "voice" | "music"; clip: AudioClip }
  | { type: "add_overlay"; clip: OverlayClip }
  | { type: "add_subtitle"; clip: SubtitleClip }
  | { type: "update_clip"; track: TrackKey; id: string; patch: Partial<AnyClip> }
  | { type: "remove_clip"; track: TrackKey; id: string }
  | { type: "split_clip"; track: TrackKey; id: string; at: number }
  | { type: "from_script"; lines: string[]; perLineSec: number }
  | { type: "reorder_video"; from: number; to: number };

export type TrackKey = "video" | "voice" | "music" | "overlays" | "subtitles";

function arr<T extends AnyClip>(p: Project, t: TrackKey): T[] {
  return (p as unknown as Record<TrackKey, T[]>)[t];
}

function replaceTrack(p: Project, t: TrackKey, next: AnyClip[]): Project {
  return { ...p, [t]: next } as Project;
}

function repositionVideo(clips: VideoClip[]): VideoClip[] {
  let cursor = 0;
  return clips.map((c) => {
    const next = { ...c, start: cursor };
    cursor += c.duration;
    return next;
  });
}

export function reducer(p: Project, a: Action): Project {
  switch (a.type) {
    case "set":
      return a.project;
    case "rename":
      return { ...p, name: a.name };
    case "set_aspect":
      return { ...p, aspect: a.aspect };
    case "add_asset":
      return { ...p, assets: [...p.assets, a.asset] };
    case "remove_asset":
      return { ...p, assets: p.assets.filter((x) => x.id !== a.id) };
    case "add_video": {
      const next = repositionVideo([...p.video, a.clip]);
      return { ...p, video: next };
    }
    case "add_audio":
      return a.track === "voice"
        ? { ...p, voice: [...p.voice, a.clip] }
        : { ...p, music: [...p.music, a.clip] };
    case "add_overlay":
      return { ...p, overlays: [...p.overlays, a.clip] };
    case "add_subtitle":
      return { ...p, subtitles: [...p.subtitles, a.clip] };
    case "update_clip": {
      const list = arr<AnyClip>(p, a.track).map((c) =>
        c.id === a.id ? ({ ...c, ...a.patch } as AnyClip) : c,
      );
      const next =
        a.track === "video"
          ? repositionVideo(list as VideoClip[])
          : list;
      return replaceTrack(p, a.track, next);
    }
    case "remove_clip": {
      const list = arr<AnyClip>(p, a.track).filter((c) => c.id !== a.id);
      const next =
        a.track === "video"
          ? repositionVideo(list as VideoClip[])
          : list;
      return replaceTrack(p, a.track, next);
    }
    case "split_clip": {
      const list = arr<AnyClip>(p, a.track);
      const idx = list.findIndex((c) => c.id === a.id);
      if (idx === -1) return p;
      const c = list[idx];
      const localAt = a.at - c.start;
      if (localAt <= 0.05 || localAt >= c.duration - 0.05) return p;

      const left = { ...c, duration: localAt };
      const right: AnyClip = (() => {
        if (c.kind === "video") {
          return {
            ...(c as VideoClip),
            id: uid("vc"),
            start: c.start + localAt,
            duration: c.duration - localAt,
            inPoint: (c as VideoClip).inPoint + localAt * (c as VideoClip).speed,
          } as VideoClip;
        }
        if (c.kind === "audio") {
          return {
            ...(c as AudioClip),
            id: uid("ac"),
            start: c.start + localAt,
            duration: c.duration - localAt,
            inPoint: (c as AudioClip).inPoint + localAt,
          } as AudioClip;
        }
        if (c.kind === "overlay") {
          return {
            ...(c as OverlayClip),
            id: uid("ov"),
            start: c.start + localAt,
            duration: c.duration - localAt,
          } as OverlayClip;
        }
        return {
          ...(c as SubtitleClip),
          id: uid("sub"),
          start: c.start + localAt,
          duration: c.duration - localAt,
        } as SubtitleClip;
      })();

      const next = [...list.slice(0, idx), left, right, ...list.slice(idx + 1)];
      return replaceTrack(
        p,
        a.track,
        a.track === "video" ? repositionVideo(next as VideoClip[]) : next,
      );
    }
    case "from_script": {
      const video: VideoClip[] = [];
      const subs: SubtitleClip[] = [];
      let cursor = 0;
      for (const line of a.lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const id = uid("vc");
        video.push({
          id,
          kind: "video",
          start: cursor,
          duration: a.perLineSec,
          inPoint: 0,
          speed: 1,
          preservePitch: true,
          zoom: 1,
          panX: 0,
          panY: 0,
          fadeIn: 0,
          fadeOut: 0,
          role: "segment",
          sourceLine: trimmed,
        });
        subs.push({
          id: uid("sub"),
          kind: "subtitle",
          start: cursor,
          duration: a.perLineSec,
          text: trimmed,
          segmentId: id,
        });
        cursor += a.perLineSec;
      }
      return { ...p, video, subtitles: subs };
    }
    case "reorder_video": {
      const next = [...p.video];
      const [moved] = next.splice(a.from, 1);
      next.splice(a.to, 0, moved);
      return { ...p, video: repositionVideo(next) };
    }
    default:
      return p;
  }
}
