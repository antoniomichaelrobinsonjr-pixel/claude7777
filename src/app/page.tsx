"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteProject, listProjects, saveProject } from "@/lib/storage";
import { analyze, newProject, type Project } from "@/lib/comps";
import { supabase } from "@/lib/supabase";
import { useI18n } from "@/i18n";

export default function Home() {
  const router = useRouter();
  const { t, rich, usd } = useI18n();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState("");

  const load = () => listProjects().then(setProjects).catch((e) => setError(String(e.message ?? e)));
  useEffect(() => { load(); }, []);

  async function create() {
    const p = newProject(t("name.untitled"));
    await saveProject(p);
    router.push(`/project/${p.id}`);
  }

  return (
    <div className="space-y-8">
      <section className="card relative overflow-hidden p-8 md:p-12">
        <div className="max-w-2xl space-y-4">
          <span className="inline-block rounded-full px-3 py-1 text-xs font-semibold" style={{ background: "var(--surface-2)", color: "var(--accent)" }}>
            {t("home.badge")}
          </span>
          <h1 className="display text-4xl font-bold md:text-5xl">
            {rich("home.title", {}, { e: (x, i) => <span key={i} className="gold-ink">{x}</span> })}
          </h1>
          <p className="muted text-lg">{t("home.subtitle")}</p>
          <div className="flex flex-wrap gap-3 pt-2">
            <button onClick={create} className="btn btn-primary">{t("home.newAnalysis")}</button>
          </div>
        </div>
        <svg className="pointer-events-none absolute -end-6 -top-6 hidden opacity-25 dark:opacity-[0.12] md:block rtl:-scale-x-100" width="360" height="360" viewBox="0 0 512 512" aria-hidden>
          <path d="M256 66c-92 0-162 68-162 154 0 112 162 232 162 232s162-120 162-232c0-86-70-154-162-154Z" fill="var(--gold-b)" />
          <path d="M256 112 372 214H350V330H162V214H140Z" fill="var(--surface)" stroke="var(--surface)" strokeWidth="10" strokeLinejoin="round" />
          <path d="M256 252 296 322 256 304 216 322Z" fill="var(--gold-b)" />
        </svg>
      </section>

      {!supabase && (
        <p className="card px-4 py-3 text-sm" style={{ color: "var(--warn)" }}>
          {rich("home.localMode", {}, { c: (x, i) => <code key={i} dir="ltr">{x}</code> })}
        </p>
      )}
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      <section className="space-y-3">
        <h2 className="display text-2xl font-semibold">{t("home.yourAnalyses")}</h2>
        {projects?.length === 0 && <div className="card muted p-8 text-center">{t("home.none")}</div>}
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects?.map((p) => {
            const a = analyze(p);
            return (
              <li key={p.id} className="card group flex flex-col justify-between gap-4 p-5 transition hover:-translate-y-0.5">
                <a href={`/project/${p.id}`} className="space-y-1">
                  <div className="font-semibold group-hover:underline">{p.name}</div>
                  <div className="muted truncate text-sm">{p.subject.address || t("home.noAddress")}</div>
                  <div className="pt-2 text-2xl font-bold" style={{ color: a.count ? "var(--ink)" : "var(--muted)" }}>
                    {a.count ? usd(a.weighted) : "—"}
                  </div>
                  <div className="muted text-xs">{t("home.compsUsed", { count: a.count })}</div>
                </a>
                <button
                  className="muted tap -mb-2 -ms-1 self-start text-sm hover:underline"
                  onClick={async () => { if (confirm(t("home.deleteConfirm"))) { await deleteProject(p.id); load(); } }}
                >{t("common.delete")}</button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
