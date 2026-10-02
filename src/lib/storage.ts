import type { Project } from "./comps";
import { supabase } from "./supabase";

const LS_KEY = "comppilot.projects";

function readLocal(): Project[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]");
  } catch {
    return [];
  }
}
const writeLocal = (p: Project[]) => localStorage.setItem(LS_KEY, JSON.stringify(p));

/** Uses Supabase when configured and signed in, otherwise the browser's localStorage. */
async function useCloud(): Promise<boolean> {
  if (!supabase) return false;
  const { data } = await supabase.auth.getSession();
  return !!data.session;
}

export async function listProjects(): Promise<Project[]> {
  if (await useCloud()) {
    const { data, error } = await supabase!.from("projects").select("data").order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => r.data as Project);
  }
  return readLocal().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getProject(id: string): Promise<Project | null> {
  if (await useCloud()) {
    const { data, error } = await supabase!.from("projects").select("data").eq("id", id).maybeSingle();
    if (error) throw error;
    return (data?.data as Project) ?? null;
  }
  return readLocal().find((p) => p.id === id) ?? null;
}

export async function saveProject(project: Project): Promise<void> {
  const p = { ...project, updatedAt: new Date().toISOString() };
  if (await useCloud()) {
    const { error } = await supabase!
      .from("projects")
      .upsert({ id: p.id, name: p.name, data: p, updated_at: p.updatedAt });
    if (error) throw error;
    return;
  }
  const all = readLocal().filter((x) => x.id !== p.id);
  writeLocal([p, ...all]);
}

export async function deleteProject(id: string): Promise<void> {
  if (await useCloud()) {
    const { error } = await supabase!.from("projects").delete().eq("id", id);
    if (error) throw error;
    return;
  }
  writeLocal(readLocal().filter((x) => x.id !== id));
}
