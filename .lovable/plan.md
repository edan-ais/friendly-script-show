## Remove Playcast and Video Studio

### Scope
Delete the Prompter (Teleprompter), Screen Cast (Playcast), and Studio (Video Editor) apps entirely from the codebase, including all routes, components, libraries, and references.

### Files to Delete

**Routes:**
- `src/routes/cast.tsx` — Screen Cast route
- `src/routes/prompter.tsx` — Prompter route
- `src/routes/studio.tsx` — Studio route

**Components:**
- `src/components/ScreenCast.tsx` — Screen Cast component
- `src/components/Teleprompter.tsx` — Teleprompter component
- `src/components/studio/Inspector.tsx`
- `src/components/studio/PreviewCanvas.tsx`
- `src/components/studio/ScriptImporter.tsx`
- `src/components/studio/StudioEditor.tsx`
- `src/components/studio/Timeline.tsx`

**Libraries:**
- `src/lib/video-bank.ts` — Shared clip storage
- `src/lib/studio/export.ts`
- `src/lib/studio/state.ts`
- `src/lib/studio/types.ts`

### Files to Modify

**`src/routes/index.tsx`** — Remove three app tiles (Prompter, Screen Cast, Studio) and their Lucide imports, leaving Document and Files.

**`src/routes/login.tsx`** — Change the page heading from "Prompter / Studio" to "Hackathon Prep" since those apps no longer exist.

**`src/routeTree.gen.ts`** — Will auto-regenerate after route files are removed.

### What Stays
- Document Designer (`/document`)
- Files downloader (`/files`)
- `src/lib/persistence/media.ts` — generic media upload helpers used by other features