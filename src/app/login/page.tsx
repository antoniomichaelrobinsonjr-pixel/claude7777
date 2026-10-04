"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    supabase?.auth.getUser().then(({ data }) => setUser(data.user?.email ?? null));
  }, []);

  if (!supabase)
    return (
      <div className="card mx-auto max-w-md space-y-2 p-5">
        <h1 className="text-xl font-bold">Accounts</h1>
        <p className="text-sm" style={{ color: "var(--warn)" }}>Accounts are off: Supabase is not configured. See the README.</p>
      </div>
    );

  async function submit(mode: "in" | "up") {
    const fn = mode === "in" ? supabase!.auth.signInWithPassword : supabase!.auth.signUp;
    const { error } = await fn.call(supabase!.auth, { email, password });
    if (error) return setMsg(error.message);
    if (mode === "up") return setMsg("Check your email to confirm, then sign in.");
    location.href = "/";
  }

  if (user)
    return (
      <div className="card mx-auto max-w-sm space-y-4 p-6">
        <h1 className="text-xl font-bold">Your account</h1>
        <p>Signed in as <strong>{user}</strong></p>
        <button className="btn" onClick={async () => { await supabase!.auth.signOut(); location.href = "/"; }}>Sign out</button>
      </div>
    );

  return (
    <div className="card mx-auto max-w-sm space-y-4 p-6">
      <h1 className="text-xl font-bold">Welcome back</h1>
      <label className="field">Email<input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label className="field">Password<input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <div className="flex gap-2">
        <button className="btn btn-primary" onClick={() => submit("in")}>Sign in</button>
        <button className="btn" onClick={() => submit("up")}>Create account</button>
      </div>
      {msg && <p className="muted text-sm">{msg}</p>}
    </div>
  );
}
