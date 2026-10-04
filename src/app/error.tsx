"use client";
import Link from "next/link";
import { useI18n } from "@/i18n";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const { t } = useI18n();
  return (
    <div className="card mx-auto mt-10 max-w-lg p-8 text-center" role="alert">
      <h1 className="display text-2xl font-semibold">{t("error.title")}</h1>
      <p className="muted mt-2 text-sm">{t("error.body")}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button className="btn btn-primary" onClick={reset}>{t("error.retry")}</button>
        <Link href="/" className="btn">{t("missing.back")}</Link>
      </div>
    </div>
  );
}
