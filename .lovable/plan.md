## What the screenshot/code show

The black Studio preview is not primarily a cropping issue. The current timeline segments are script-generated video segments with no dependable source asset bound to them, so the preview renders black once the playhead reaches an unassigned segment. Separately, Prompter recordings are stored and replayed as large browser-created blobs; longer WebM recordings can become unreliable after ~15 seconds, especially when the app downloads every bank clip into memory and then plays object URLs.

## Fix plan

1. **Make Prompter recordings more reliable**
   - Change recording to collect chunks continuously with `MediaRecorder.start(1000)` instead of one large final blob.
   - Add recorder `onerror` handling and cleanup so a stalled recording cannot silently save a broken/frozen video.
   - Preserve accurate duration metadata when saving clips.

2. **Stop loading all Prompter videos as giant blobs**
   - Update the clip bank to list stored clips and create playable signed URLs on demand instead of downloading every video into memory.
   - Update each bank preview card to use that URL directly with `preload="metadata"`, `playsInline`, visible loading/error states, and retry-on-stall handling.
   - Keep blob use only for brand-new recordings before/while saving.

3. **Make Studio actually use Prompter videos as source clips**
   - Add Prompter-bank recordings into the Studio Media tab so they can be imported as source video assets without manual re-upload.
   - Add an obvious action for applying one source video across all script segments continuously, setting each segment’s `assetId` and `inPoint` so playback continues through the whole recording instead of going black after the first assigned segment.

4. **Harden the Studio preview player**
   - Keep a stable preview `<video>` element instead of remounting it per segment.
   - Sync `src`, `currentTime`, `playbackRate`, and play/pause only after metadata/data is ready.
   - Add `waiting`, `stalled`, `error`, `loadeddata`, and `seeked` handling so the UI shows what is happening and retries the seek instead of freezing silently.
   - Remove the fallback that shows the last video clip after the project duration; past the end should show an end/blank state, not a stale frame.

5. **Fix timeline navigation visibility**
   - Pin right-scroll and left-scroll controls to the visible timeline viewport, not inside the scrollable content.
   - Add a clearly labeled “next segment” control so you can move forward through clips even if the scrollbar is hard to use.

## Files I expect to change

- `src/components/Teleprompter.tsx`
- `src/lib/video-bank.ts`
- `src/components/studio/PreviewCanvas.tsx`
- `src/components/studio/StudioEditor.tsx`
- `src/components/studio/Timeline.tsx`
- possibly `src/lib/persistence/media.ts` for reusable signed-URL helpers

## Verification

After implementation I will verify with screenshots and browser inspection that:

- Prompter bank videos show a video frame instead of freezing silently.
- Studio TikTok preview shows the imported source video across the full timeline.
- The right-scroll/forward control is visible on a laptop-width viewport.
- Playback past 15 seconds continues showing video instead of freezing or going black.