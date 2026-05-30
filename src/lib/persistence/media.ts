import { supabase } from "@/integrations/supabase/client";

const BUCKET = "media";

export async function uploadMedia(userId: string, folder: string, file: Blob, filename: string): Promise<string> {
  const safe = filename.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const path = `${userId}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safe}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function signMedia(path: string, expiresSec = 60 * 60 * 6): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresSec);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteMedia(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

export async function downloadMedia(path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) throw error;
  return data;
}

export type StoredClipRow = {
  name: string;
  path: string;
  created_at: string;
  size: number;
  mime: string;
};

/** List clips in the user's prompter-clips folder. */
export async function listClipsForUser(userId: string): Promise<StoredClipRow[]> {
  const folder = `${userId}/prompter-clips`;
  const { data, error } = await supabase.storage.from(BUCKET).list(folder, {
    limit: 200,
    sortBy: { column: "created_at", order: "desc" },
  });
  if (error) throw error;
  return (data ?? []).map((f) => ({
    name: f.name,
    path: `${folder}/${f.name}`,
    created_at: f.created_at ?? new Date().toISOString(),
    size: (f.metadata as { size?: number })?.size ?? 0,
    mime: (f.metadata as { mimetype?: string })?.mimetype ?? "video/webm",
  }));
}
