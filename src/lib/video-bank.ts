import { get, set, del, keys } from "idb-keyval";

export type SavedClip = {
  id: string;
  createdAt: number;
  durationSec: number;
  blob: Blob;
  ext: "webm" | "mp4";
  name: string;
};

const PREFIX = "clip:";

export async function saveClip(clip: Omit<SavedClip, "id" | "createdAt"> & { id?: string; createdAt?: number }): Promise<SavedClip> {
  const id = clip.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = clip.createdAt ?? Date.now();
  const full: SavedClip = { ...clip, id, createdAt };
  await set(PREFIX + id, full);
  return full;
}

export async function listClips(): Promise<SavedClip[]> {
  const allKeys = (await keys()).filter((k): k is string => typeof k === "string" && k.startsWith(PREFIX));
  const items = await Promise.all(allKeys.map((k) => get<SavedClip>(k)));
  return items.filter((x): x is SavedClip => !!x).sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteClip(id: string): Promise<void> {
  await del(PREFIX + id);
}

export async function updateClip(clip: SavedClip): Promise<void> {
  await set(PREFIX + clip.id, clip);
}
