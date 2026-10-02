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
    return <p className="rounded bg-amber-50 p-3 text-sm text-amber-800">Accounts are off: Supabase is not configured. See README.</p>;

  async function submit(mode: "in" | "up") {
    const fn = mode === "in" ? supabase!.auth.signInWithPassword : supabase!.auth.signUp;
    const { error } = await fn.call(supabase!.auth, { email, password });
    if (error) return setMsg(error.message);
    if (mode === "up") return setMsg("Check your email to confirm, then sign in.");
    location.href = "/";
  }

  if (user)
    return (
      <div className="space-y-3">
        <p>Signed in as {user}</p>
        <button className="rounded border px-3 py-1" onClick={async () => { await supabase!.auth.signOut(); location.href = "/"; }}>Sign out</button>
      </div>
    );

  return (
    <div className="mx-auto max-w-sm space-y-3">
      <h1 className="text-xl font-semibold">Sign in</h1>
      <input className="w-full rounded border p-2" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className="w-full rounded border p-2" placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <div className="flex gap-2">
        <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={() => submit("in")}>Sign in</button>
        <button className="rounded border px-4 py-2" onClick={() => submit("up")}>Create account</button>
      </div>
      {msg && <p className="text-sm text-slate-600">{msg}</p>}
    </div>
  );
}
