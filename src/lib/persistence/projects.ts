import { supabase } from "@/integrations/supabase/client";
import { emptyProject, type Project } from "@/lib/studio/types";

export type ProjectRow = {
  id: string;
  name: string;
  data: Project;
  updated_at: string;
};

export async function loadOrCreateProject(userId: string): Promise<ProjectRow> {
  const { data, error } = await supabase
    .from("studio_projects")
    .select("id,name,data,updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (data) {
    const merged = { ...emptyProject(), ...(data.data as Partial<Project>) } as Project;
    return { ...data, data: merged };
  }
  const fresh = emptyProject();
  const { data: created, error: insErr } = await supabase
    .from("studio_projects")
    .insert({ user_id: userId, name: fresh.name, data: fresh })
    .select("id,name,data,updated_at")
    .single();
  if (insErr) throw insErr;
  return { ...created, data: fresh };
}

export async function saveProject(id: string, project: Project) {
  const { error } = await supabase
    .from("studio_projects")
    .update({ name: project.name, data: project })
    .eq("id", id);
  if (error) throw error;
}
