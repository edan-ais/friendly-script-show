// Server-backed clip bank, SHARED across all signed-in users. Clips are
// stored in Supabase Storage under `_shared/prompter-clips/`. Duration and
// display name are encoded in the filename so we don't need an extra DB
// table:
//   `${createdAtMs}__${durationSec}s__${safeName}.${ext}`
import { supabase } from "@/integrations/supabase/client";

const SHARED_FOLDER = "_shared/prompter-clips";
const BUCKET = "media";
const SIGNED_URL_TTL = 60 * 60 * 6; // 6h

export type SavedClip = {
  id: string; // storage path
  createdAt: number;
  durationSec: number;
  ext: "webm" | "mp4";
  name: string;
  size: number;
  /** Signed URL for streaming playback. Populated on list; refreshed on demand. */
  url: string;
};

function safeFile(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
}

function parseFilename(filename: string): { createdAt: number; durationSec: number; name: string; ext: "webm" | "mp4" } | null {
  const m = filename.match(/^(\d+)__(\d+)s__(.+)\.(webm|mp4)$/);
  if (!m) return null;
  return {
    createdAt: Number(m[1]),
    durationSec: Number(m[2]),
    name: m[3].replace(/_/g, " "),
    ext: m[4] as "webm" | "mp4",
  };
}

async function requireSignedIn(): Promise<void> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not signed in");
}

export async function saveClip(input: {
  blob: Blob;
  ext: "webm" | "mp4";
  durationSec: number;
  name: string;
}): Promise<SavedClip> {
  await requireSignedIn();
  const createdAt = Date.now();
  const filename = `${createdAt}__${Math.max(0, Math.floor(input.durationSec))}s__${safeFile(input.name)}.${input.ext}`;
  const path = `${SHARED_FOLDER}/${filename}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, input.blob, {
    contentType: input.blob.type || (input.ext === "mp4" ? "video/mp4" : "video/webm"),
    upsert: false,
  });
  if (error) throw error;
  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (signErr) throw signErr;
  return {
    id: path,
    createdAt,
    durationSec: input.durationSec,
    ext: input.ext,
    name: input.name,
    size: input.blob.size,
    url: signed.signedUrl,
  };
}

/**
 * List clips. Returns metadata + a signed URL for streaming — does NOT
 * download every blob (previously caused the bank to hang/fail with many
 * clips). Blobs are fetched lazily via `getClipBlob(id)` when needed.
 */
export async function listClips(): Promise<SavedClip[]> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];
  const { data: files, error } = await supabase.storage.from(BUCKET).list(SHARED_FOLDER, {
    limit: 500,
    sortBy: { column: "name", order: "desc" },
  });
  if (error) throw error;
  if (!files) return [];

  const entries: { meta: NonNullable<ReturnType<typeof parseFilename>>; path: string; size: number }[] = [];
  for (const f of files) {
    if (!f.name || f.name === ".emptyFolderPlaceholder") continue;
    const meta = parseFilename(f.name);
    if (!meta) continue;
    entries.push({
      meta,
      path: `${SHARED_FOLDER}/${f.name}`,
      size: (f.metadata as { size?: number } | null)?.size ?? 0,
    });
  }

  // Batch sign for efficiency
  const paths = entries.map((e) => e.path);
  const urlByPath = new Map<string, string>();
  if (paths.length > 0) {
    const { data, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL);
    if (signErr) throw signErr;
    for (const s of data ?? []) {
      if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
    }
  }

  const clips: SavedClip[] = entries.map((e) => ({
    id: e.path,
    createdAt: e.meta.createdAt,
    durationSec: e.meta.durationSec,
    ext: e.meta.ext,
    name: e.meta.name,
    size: e.size,
    url: urlByPath.get(e.path) ?? "",
  }));
  return clips.sort((a, b) => b.createdAt - a.createdAt);
}

/** Download the full clip bytes on demand (for conversion / export). */
export async function getClipBlob(id: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(BUCKET).download(id);
  if (error || !data) throw error ?? new Error("Failed to download clip");
  return data;
}

export async function deleteClip(id: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([id]);
  if (error) throw error;
}
