"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useI18n } from "@/i18n";
import { safeNext } from "@/lib/safe-next";

export default function Login() {
  const { t, rich } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [deleting, setDeleting] = useState<"idle" | "confirm" | "working">("idle");
  const [deleteError, setDeleteError] = useState(false);

  useEffect(() => {
    supabase?.auth.getUser().then(({ data }) => setUser(data.user?.email ?? null));
  }, []);

  if (!supabase)
    return (
      <div className="card mx-auto max-w-md space-y-2 p-5">
        <h1 className="text-xl font-bold">{t("login.accountsTitle")}</h1>
        <p className="text-sm" style={{ color: "var(--warn)" }}>{t("login.accountsOff")}</p>
      </div>
    );

  async function submit(mode: "in" | "up") {
    const fn = mode === "in" ? supabase!.auth.signInWithPassword : supabase!.auth.signUp;
    const { error } = await fn.call(supabase!.auth, { email, password });
    if (error) return setMsg(error.message);
    if (mode === "up") return setMsg(t("login.checkEmail"));
    location.href = safeNext(new URLSearchParams(location.search).get("next"));
  }

  async function deleteAccount() {
    setDeleting("working");
    setDeleteError(false);
    try {
      const token = (await supabase!.auth.getSession()).data.session?.access_token;
      const res = await fetch("/api/account/delete", { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error(String(res.status));
      await supabase!.auth.signOut().catch(() => {});
      location.href = "/";
    } catch {
      setDeleteError(true);
      setDeleting("confirm");
    }
  }

  if (user)
    return (
      <div className="card mx-auto max-w-sm space-y-4 p-6">
        <h1 className="text-xl font-bold">{t("login.yourAccount")}</h1>
        <p>{rich("login.signedInAs", { email: user }, { b: (x, i) => <strong key={i} dir="ltr">{x}</strong> })}</p>
        <button className="btn" onClick={async () => { await supabase!.auth.signOut(); location.href = "/"; }}>{t("login.signOut")}</button>
        <section className="space-y-3 border-t pt-4" style={{ borderColor: "var(--border)" }} aria-labelledby="delete-title">
          <h2 id="delete-title" className="font-semibold">{t("account.delete.title")}</h2>
          <p className="muted text-sm">{t("account.delete.body")}</p>
          {deleting === "idle" ? (
            <button className="btn" onClick={() => setDeleting("confirm")}>{t("account.delete.button")}</button>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button className="btn" style={{ borderColor: "var(--danger)", color: "var(--danger)" }} disabled={deleting === "working"} onClick={deleteAccount}>{t("account.delete.confirm")}</button>
              <button className="btn" disabled={deleting === "working"} onClick={() => { setDeleting("idle"); setDeleteError(false); }}>{t("account.delete.cancel")}</button>
            </div>
          )}
          {deleteError && <p className="text-sm" role="alert" style={{ color: "var(--danger)" }}>{t("account.delete.failed")}</p>}
        </section>
      </div>
    );

  return (
    <div className="card mx-auto max-w-sm space-y-4 p-6">
      <h1 className="text-xl font-bold">{t("login.welcome")}</h1>
      <label className="field">{t("login.email")}<input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label className="field">{t("login.password")}<input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <div className="flex gap-2">
        <button className="btn btn-primary" onClick={() => submit("in")}>{t("login.signIn")}</button>
        <button className="btn" onClick={() => submit("up")}>{t("login.createAccount")}</button>
      </div>
      {msg && <p className="muted text-sm">{msg}</p>}
    </div>
  );
}
