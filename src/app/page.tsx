"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteProject, listProjects, saveProject } from "@/lib/storage";
import { analyze, newProject, usd, type Project } from "@/lib/comps";
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
    <div className="space-y-8">
      <section className="card relative overflow-hidden p-8 md:p-12">
        <div className="max-w-2xl space-y-4">
          <span className="inline-block rounded-full px-3 py-1 text-xs font-semibold" style={{ background: "var(--surface-2)", color: "var(--brand)" }}>
            Comparative market analysis
          </span>
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
            Price any property with <span style={{ color: "var(--brand)" }}>confidence</span>.
          </h1>
          <p className="muted text-lg">
            Enter your subject property and comparable sales, tune the adjustments, and get a clear, defensible value range in minutes.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <button onClick={create} className="btn btn-primary">+ New analysis</button>
          </div>
        </div>
        <svg className="pointer-events-none absolute -right-6 -top-6 hidden opacity-20 md:block" width="360" height="360" viewBox="0 0 512 512" aria-hidden>
          <path d="M256 66c-92 0-162 68-162 154 0 112 162 232 162 232s162-120 162-232c0-86-70-154-162-154Z" fill="var(--brand)" />
          <path d="M256 112 372 214H350V330H162V214H140Z" fill="var(--surface)" stroke="var(--surface)" strokeWidth="10" strokeLinejoin="round" />
          <path d="M256 252 296 322 256 304 216 322Z" fill="var(--brand)" />
        </svg>
      </section>

      {!supabase && (
        <p className="card px-4 py-3 text-sm" style={{ color: "var(--warn)" }}>
          Local mode: analyses are saved in this browser only. Add Supabase keys in <code>.env.local</code> to enable accounts and cloud saving.
        </p>
      )}
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Your analyses</h2>
        {projects?.length === 0 && (
          <div className="card muted p-8 text-center">No analyses yet. Start your first one above.</div>
        )}
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects?.map((p) => {
            const a = analyze(p);
            return (
              <li key={p.id} className="card group flex flex-col justify-between gap-4 p-5 transition hover:-translate-y-0.5">
                <a href={`/project/${p.id}`} className="space-y-1">
                  <div className="font-semibold group-hover:underline">{p.name}</div>
                  <div className="muted truncate text-sm">{p.subject.address || "No address yet"}</div>
                  <div className="pt-2 text-2xl font-bold" style={{ color: a.count ? "var(--ink)" : "var(--muted)" }}>
                    {a.count ? usd(a.weighted) : "—"}
                  </div>
                  <div className="muted text-xs">{a.count} comp{a.count === 1 ? "" : "s"} used</div>
                </a>
                <button
                  className="muted self-start text-xs hover:underline"
                  onClick={async () => { if (confirm("Delete this analysis?")) { await deleteProject(p.id); load(); } }}
                >Delete</button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
