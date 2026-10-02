"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteProject, listProjects, saveProject } from "@/lib/storage";
import { newProject, type Project } from "@/lib/comps";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState("");

  const load = () => listProjects().then(setProjects).catch((e) => setError(String(e.message ?? e)));
  useEffect(() => { load(); }, []);

  async function create() {
    const p = newProject();
    await saveProject(p);
    router.push(`/project/${p.id}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your analyses</h1>
        <button onClick={create} className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">New analysis</button>
      </div>
      {!supabase && (
        <p className="rounded bg-amber-50 p-3 text-sm text-amber-800">
          Local mode: analyses are saved in this browser only. Set the Supabase variables in <code>.env.local</code> to enable accounts and cloud saving.
        </p>
      )}
      {error && <p className="text-red-600">{error}</p>}
      {projects?.length === 0 && <p className="text-slate-500">No analyses yet.</p>}
      <ul className="divide-y rounded border bg-white">
        {projects?.map((p) => (
          <li key={p.id} className="flex items-center justify-between p-3">
            <a href={`/project/${p.id}`} className="font-medium hover:underline">
              {p.name} <span className="text-sm font-normal text-slate-500">{p.subject.address}</span>
            </a>
            <button
              className="text-sm text-red-600 hover:underline"
              onClick={async () => { if (confirm("Delete this analysis?")) { await deleteProject(p.id); load(); } }}
            >Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
