import { supabase } from "@/integrations/supabase/client";

export type ScriptRow = {
  id: string;
  title: string;
  content: string;
  updated_at: string;
};

/** Load the user's most-recent script, creating a default one if none exists. */
export async function loadOrCreateScript(userId: string): Promise<ScriptRow> {
  const { data, error } = await supabase
    .from("scripts")
    .select("id,title,content,updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (data) return data;
  const { data: created, error: insErr } = await supabase
    .from("scripts")
    .insert({ user_id: userId, title: "My script", content: "" })
    .select("id,title,content,updated_at")
    .single();
  if (insErr) throw insErr;
  return created;
}

export async function saveScript(id: string, patch: { title?: string; content?: string }) {
  const { error } = await supabase.from("scripts").update(patch).eq("id", id);
  if (error) throw error;
}
