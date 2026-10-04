"use client";
import Link from "next/link";
import { useI18n } from "@/i18n";
import { useEntitlements } from "@/billing/entitlements";
import type { Feature } from "@/billing/plans";

const TABS: { key: "investor" | "seller" | "buyer" | "owner"; path: (id: string) => string; feature: Feature }[] = [
  { key: "investor", path: (id) => `/project/${id}/report`, feature: "report" },
  { key: "seller", path: (id) => `/project/${id}/for/seller`, feature: "sellerReport" },
  { key: "buyer", path: (id) => `/project/${id}/for/buyer`, feature: "buyerReport" },
  { key: "owner", path: (id) => `/project/${id}/for/owner`, feature: "ownerReport" },
];

/** Switch between the reports made from the same analysis. A lock marks the ones the plan doesn't include. */
export function ReportTabs({ id, current }: { id: string; current: "investor" | "seller" | "buyer" | "owner" }) {
  const { t } = useI18n();
  const ent = useEntitlements();
  return (
    <nav aria-label={t("report.tabs.aria")} className="no-print card flex flex-wrap gap-1 p-1.5">
      {TABS.map((tab) => {
        const active = tab.key === current;
        return (
          <Link
            key={tab.key} href={tab.path(id)} aria-current={active ? "page" : undefined}
            className="rounded-xl px-4 py-2 text-sm font-semibold transition"
            style={active ? { background: "var(--brand)", color: "var(--brand-ink)" } : { color: "var(--muted)" }}
          >
            {!ent.can(tab.feature) && <span aria-hidden>🔒 </span>}{t(`report.tab.${tab.key}`)}
          </Link>
        );
      })}
    </nav>
  );
}
