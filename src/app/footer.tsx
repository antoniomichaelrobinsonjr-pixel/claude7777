"use client";
import { useI18n } from "@/i18n";

export default function Footer() {
  const { t } = useI18n();
  return (
    <footer className="no-print mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-6 gap-y-1 px-4 pb-8 text-sm" style={{ color: "var(--muted)" }}>
      <a href="/privacy" className="tap underline-offset-2 hover:underline">{t("footer.privacy")}</a>
      <a href="/support" className="tap underline-offset-2 hover:underline">{t("footer.support")}</a>
    </footer>
  );
}
