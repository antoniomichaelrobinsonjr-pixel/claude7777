"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { useI18n } from "@/i18n";
import { requiredPlan, type Feature, type PlanId } from "./plans";

/** The upgrade prompt that replaces a locked section. It never prints, so it can't end up in a customer's PDF. */
export function UpgradeNotice({ feature, compact }: { feature: Feature; compact?: boolean }) {
  const { t } = useI18n();
  const plan: PlanId = requiredPlan(feature);
  return (
    <div
      className={`no-print flex flex-wrap items-center justify-between gap-3 rounded-xl border ${compact ? "p-3" : "p-4"}`}
      style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
      role="note"
    >
      <p className="text-sm"><span aria-hidden>🔒 </span>{t("billing.locked", { feature: t(`feature.${feature}`), plan: t(`plan.${plan}.name`) })}</p>
      <Link href={`/pricing#plan-${plan}`} className="btn !py-1.5 text-sm">{t("billing.seePlans")}</Link>
    </div>
  );
}

/** A button that is a normal button when allowed, and a lock that leads to the pricing page when not. */
export function GatedButton({ allowed, feature, onClick, href, children, className = "btn", disabled, title }: {
  allowed: boolean; feature: Feature; onClick?: () => void; href?: string; children: ReactNode; className?: string; disabled?: boolean; title?: string;
}) {
  const { t } = useI18n();
  if (!allowed) {
    const plan = requiredPlan(feature);
    return (
      <Link href={`/pricing#plan-${plan}`} className={className} title={t("billing.locked", { feature: t(`feature.${feature}`), plan: t(`plan.${plan}.name`) })}>
        <span aria-hidden>🔒</span> {children}
      </Link>
    );
  }
  return href
    ? <Link href={href} className={className} title={title}>{children}</Link>
    : <button onClick={onClick} className={className} disabled={disabled} title={title}>{children}</button>;
}
