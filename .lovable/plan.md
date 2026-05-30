# Studio — Script-Driven Video Editor

A new app at `/studio` for assembling videos from a script, with multi-track timeline, overlays, subtitles, and server-side MP4 export. The same render pipeline replaces ffmpeg.wasm as the mobile fallback in Prompter.

## Important constraint to confirm

Lovable Cloud (Supabase + Cloudflare Workers) **cannot run ffmpeg directly** — Workers have no native binaries and a 10-min CPU limit. To do real server-side rendering we need ONE of these, and I need you to pick before I build:

1. **External render API** (recommended): use **Shotstack** or **Creatomate**. We send a JSON edit description, they return an MP4 URL. Reliable, supports overlays/subtitles/transitions natively. Requires their API key (paid plans, ~$0.10–0.30/min of video).
2. **Self-hosted render worker**: a separate Node/ffmpeg service (e.g. Fly.io, Render.com, Railway). You'd manage and pay for that host. More flexible, more setup.
3. **Hybrid**: keep ffmpeg.wasm in-browser for short clips, only call the API for long/mobile jobs.

The rest of this plan assumes **option 1 (Shotstack-style JSON render API)** — say the word if you'd rather go with 2 or 3.

## App structure

New route `/studio` added to the home tile grid. Editor is a single page with:

```
┌─────────────────────────────────────────────────┐
│ Header: project name • aspect (16:9/9:16) • Export │
├──────────────────┬──────────────────────────────┤
│  Preview canvas  │  Inspector (selected clip)   │
│  (16:9 or 9:16)  │  - trim/speed/pitch          │
│                  │  - zoom & crop               │
│                  │  - overlay text+box          │
│                  │  - subtitle text             │
├──────────────────┴──────────────────────────────┤
│ Timeline                                         │
│   Video track   [seg1][seg2][seg3]...           │
│   Audio track   [─────voiceover─────]           │
│   Music track   [───────music───────]           │
│   Overlay track [text]      [text]              │
│   Subtitle track[sub][sub][sub][sub]            │
└─────────────────────────────────────────────────┘
```

## Features (v1)

**Script → segments**
- Paste/upload script. Each non-empty line = one video segment with default duration (3s) and the line as its subtitle.
- Reorder, lengthen, shorten via drag handles on timeline.

**Tracks (independent edit)**
- Video, Voiceover audio, Music, Overlays, Subtitles. Each clip selectable; inspector shows controls for the selected type.

**Per-clip video controls**
- Trim start/end, split at playhead (creates two clips), delete.
- Speed 0.25×–4× with "preserve pitch" toggle (applies to audio in that clip).
- Zoom (1×–4×) + pan X/Y to crop within frame.
- Fade in / fade out duration sliders.

**Aspect ratio**
- Toggle 16:9 (1920×1080) or 9:16 (1080×1920). Re-renders preview canvas; clip zoom/pan persist.

**Intro / outro**
- Dedicated slots before first / after last segment. Each is a clip with fade-in (intro) or fade-out (outro).

**Overlays**
- "Text with background box" preset: text + box color/opacity + position + in/out fade duration. Pinned to a time range on the overlay track.

**Subtitles**
- Auto-created from script, one per segment, timed to that segment's range. Editable text; split/merge on the subtitle track independently of video splits. Burned into export.

**Audio**
- Upload voiceover file → audio track. Upload music file → music track. Per-track volume + fade. Trim/split like video.

## Rendering & export

**Preview** (in-browser): HTML canvas + `<video>`/`<audio>` elements stitched with `requestAnimationFrame` and an internal playhead. Not pixel-perfect to export but accurate for timing.

**Export** (server-side):
1. Client serializes the project to a JSON edit spec.
2. POST to server fn `renderProject` → forwards to Shotstack render API with the spec translated to their schema (clips, overlays, captions, audio tracks).
3. Poll `renderStatus`. When done, store MP4 in Supabase Storage `renders` bucket, return signed download URL.
4. Browser downloads as `.mp4`.

## Mobile WebM→MP4 in Prompter

Update `src/lib/convert.ts` so on mobile (or when ffmpeg.wasm fails), it uploads the WebM to a new `convertVideo` server fn that pushes it through the same render API (single-clip job → MP4) and returns the signed URL. Desktop keeps the fast in-browser path.

## Data model (Lovable Cloud)

```
projects        (id, user_id, name, aspect, created_at, updated_at, spec jsonb)
renders         (id, project_id, status, output_url, error, created_at)
storage bucket: studio-assets   (user uploads: clips, audio, music)
storage bucket: studio-renders  (final MP4s, private + signed URL)
```

RLS: owner-only on both tables; `user_roles` not needed for v1.

## Files

- `src/routes/studio.tsx` — route shell
- `src/components/studio/StudioEditor.tsx` — main page
- `src/components/studio/Timeline.tsx` — multi-track timeline
- `src/components/studio/PreviewCanvas.tsx` — playback canvas
- `src/components/studio/Inspector.tsx` — selected-clip controls
- `src/components/studio/ScriptImporter.tsx` — paste/upload script
- `src/lib/studio/project.ts` — project/clip TS types + reducers
- `src/lib/studio/playback.ts` — preview playback engine
- `src/lib/studio/render-spec.ts` — project → render API JSON
- `src/lib/studio/render.functions.ts` — `renderProject`, `renderStatus`, `convertVideo` server fns
- `src/lib/studio/render.server.ts` — Shotstack client (uses `SHOTSTACK_API_KEY` runtime secret)
- `src/integrations/supabase/migrations/*` — `projects`, `renders` tables + GRANTs + RLS + storage buckets
- Update `src/routes/index.tsx` — add Studio tile
- Update `src/lib/convert.ts` — mobile fallback to `convertVideo`

## What's out of v1 (call out now)

- Transitions between clips beyond fade in/out
- Multiple overlay presets (only text+box)
- AI subtitle alignment to audio
- Color grading, filters, multi-track audio mixing beyond per-clip volume
- Collaborative editing
- Saving projects offline (requires login + Cloud enabled)

## Sequence

1. You pick render-service option (1, 2, or 3) and add the API key as a runtime secret.
2. Enable Lovable Cloud (auth + DB + storage).
3. Build data model + project CRUD.
4. Build editor UI (timeline, preview, inspector) with local state.
5. Wire upload → storage, persist project spec.
6. Wire render pipeline + download.
7. Swap Prompter mobile path to `convertVideo`.
8. QA on desktop + mobile, both 16:9 and 9:16.

Confirm the render-service choice (and that you're OK with the third-party cost + signup) and I'll start building.