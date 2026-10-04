"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

const KEY = "cp-scroll:";

/** Restores scroll position on Back/Forward (Next's client router resets it to the top). */
export default function ScrollKeeper() {
  const pathname = usePathname();

  useEffect(() => {
    let popped = false;
    let lockUntil = 0; // the router's own jump to the top must not overwrite the saved spot
    const lock = () => { lockUntil = Date.now() + 2500; };
    const onPop = () => { popped = true; lock(); };
    const save = () => {
      if (Date.now() < lockUntil) return;
      try { sessionStorage.setItem(KEY + location.pathname, String(window.scrollY)); } catch {}
    };
    window.addEventListener("popstate", onPop);
    const onClick = (e: MouseEvent) => { if ((e.target as Element | null)?.closest?.("a[href]")) { save(); lock(); } };
    document.addEventListener("click", onClick, true);
    window.addEventListener("scroll", save, { passive: true });
    window.addEventListener("pagehide", save);
    (window as unknown as { __cpPopped?: () => boolean }).__cpPopped = () => popped;
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("scroll", save);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("pagehide", save);
    };
  }, []);

  useEffect(() => {
    const w = window as unknown as { __cpPopped?: () => boolean };
    if (!w.__cpPopped?.()) return;
    let y = 0;
    try { y = Number(sessionStorage.getItem(KEY + pathname) || 0); } catch {}
    if (!y) return;
    // Content may still be loading: retry briefly until the page is tall enough.
    let tries = 0;
    const t = setInterval(() => {
      window.scrollTo(0, y);
      if (Math.abs(window.scrollY - y) < 4 || ++tries > 20) clearInterval(t);
    }, 50);
    return () => clearInterval(t);
  }, [pathname]);

  return null;
}
