"use client";
import { useEffect } from "react";
import { useI18n } from "@/i18n";
import { useEntitlements } from "./entitlements";

/**
 * Printing and "Save as PDF" are for paying members. The Print buttons are locked, but a browser's own Ctrl/Cmd+P
 * would bypass them, so when printing isn't allowed the print stylesheet hides the whole app and prints a short notice
 * instead (see globals.css). While billing is off, or on a paid plan, this does nothing.
 *
 * This is a guard, not copy protection: anything shown on a screen can be screenshotted or copied.
 */
export function PrintGuard() {
  const { t } = useI18n();
  const ent = useEntitlements();
  const locked = ent.billingEnabled && !ent.canPrint;
  useEffect(() => {
    const root = document.documentElement;
    if (locked) root.setAttribute("data-print-locked", "true");
    else root.removeAttribute("data-print-locked");
    return () => root.removeAttribute("data-print-locked");
  }, [locked]);
  if (!locked) return null;
  return (
    <div className="print-lock-notice" role="note">
      <p className="display text-3xl font-bold">{t("print.lockedTitle")}</p>
      <p className="mt-3 text-lg">{t("print.lockedBody")}</p>
    </div>
  );
}
