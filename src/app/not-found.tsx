"use client";
import Link from "next/link";
import { useI18n } from "@/i18n";

export default function NotFound() {
  const { t } = useI18n();
  return (
    <div className="card mx-auto mt-10 max-w-lg p-8 text-center">
      <h1 className="display text-2xl font-semibold">{t("notfound.title")}</h1>
      <p className="muted mt-2 text-sm">{t("notfound.body")}</p>
      <Link href="/" className="btn btn-primary mt-6 justify-center">{t("missing.back")}</Link>
    </div>
  );
}
