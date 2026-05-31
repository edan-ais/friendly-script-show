// Server-backed clip bank, SHARED across all signed-in users. Clips are
// stored in Supabase Storage under `_shared/prompter-clips/`. Duration and
// display name are encoded in the filename so we don't need an extra DB
// table:
//   `${createdAtMs}__${durationSec}s__${safeName}.${ext}`
import { supabase } from "@/integrations/supabase/client";

const SHARED_FOLDER = "_shared/prompter-clips";

export type SavedClip = {
  id: string; // storage path
  createdAt: number;
  durationSec: number;
  blob: Blob;
  ext: "webm" | "mp4";
  name: string;
};

const BUCKET = "media";

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
  return { id: path, createdAt, durationSec: input.durationSec, blob: input.blob, ext: input.ext, name: input.name };
}

export async function listClips(): Promise<SavedClip[]> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];
  const { data: files, error } = await supabase.storage.from(BUCKET).list(SHARED_FOLDER, {
    limit: 500,
    sortBy: { column: "name", order: "desc" },
  });
  if (error) throw error;
  if (!files) return [];
  const clips: SavedClip[] = [];
  for (const f of files) {
    if (!f.name || f.name === ".emptyFolderPlaceholder") continue;
    const meta = parseFilename(f.name);
    if (!meta) continue;
    const path = `${SHARED_FOLDER}/${f.name}`;
    const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(path);
    if (dlErr || !blob) continue;
    clips.push({
      id: path,
      createdAt: meta.createdAt,
      durationSec: meta.durationSec,
      ext: meta.ext,
      name: meta.name,
      blob,
    });
  }
  return clips.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteClip(id: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([id]);
  if (error) throw error;
}
