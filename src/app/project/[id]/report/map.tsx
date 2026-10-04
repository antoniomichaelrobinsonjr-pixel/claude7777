"use client";
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GeoPoint } from "@/lib/comps";
import { useI18n } from "@/i18n";
import { n } from "@/i18n/format";

export interface MapComp {
  n: number;
  address: string;
  salePrice: number;
  adjustedPrice: number;
  geo: GeoPoint;
  mapDistanceMi: number | null;
}

const TILE_URL = process.env.NEXT_PUBLIC_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION =
  process.env.NEXT_PUBLIC_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';
const MILE_M = 1609.344;

const pin = (label: string, subject: boolean) =>
  L.divIcon({
    className: "",
    iconSize: subject ? [36, 36] : [30, 30],
    iconAnchor: subject ? [18, 18] : [15, 15],
    popupAnchor: [0, subject ? -18 : -15],
    html: `<div style="width:100%;height:100%;border-radius:50%;display:flex;align-items:center;justify-content:center;font:700 ${subject ? 15 : 13}px system-ui,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.45);${
      subject ? "background:#f0cf7e;color:#1c2754;border:3px solid #1c2754" : "background:#1c2754;color:#f6e7b8;border:2px solid #f0cf7e"
    }">${label}</div>`,
  });

/** Popup content is built from text nodes: addresses are user input and must never be parsed as HTML. */
function popup(lines: { text: string; bold?: boolean; muted?: boolean }[], dir: string) {
  const el = document.createElement("div");
  el.dir = dir;
  el.style.cssText = "font:13px/1.4 system-ui,sans-serif;min-width:160px";
  for (const l of lines) {
    const d = document.createElement("div");
    d.textContent = l.text;
    if (l.bold) d.style.fontWeight = "700";
    if (l.muted) d.style.opacity = "0.7";
    el.appendChild(d);
  }
  return el;
}

export default function MapView({ subject, comps }: { subject: { address: string; geo: GeoPoint } | null; comps: MapComp[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const { t, usd, num, info } = useI18n();

  useEffect(() => {
    if (!ref.current) return;
    const map = L.map(ref.current, { scrollWheelZoom: false, zoomControl: false });
    L.control.zoom({ zoomInTitle: t("map.zoomIn"), zoomOutTitle: t("map.zoomOut") }).addTo(map);
    L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(map);

    const pts: L.LatLngExpression[] = [];
    if (subject) {
      const ll: L.LatLngExpression = [subject.geo.lat, subject.geo.lng];
      pts.push(ll);
      L.circle(ll, { radius: MILE_M, color: "#c9973f", weight: 1.5, fill: false, interactive: false }).addTo(map);
      L.marker(ll, { icon: pin("S", true), title: t("map.subjectTitle", { address: subject.address }), zIndexOffset: 1000 })
        .bindPopup(popup([{ text: t("map.subject"), bold: true }, { text: subject.address }, { text: t("map.matchedLine", { label: subject.geo.label }), muted: true }], info.dir))
        .addTo(map);
    }
    for (const c of comps) {
      const ll: L.LatLngExpression = [c.geo.lat, c.geo.lng];
      pts.push(ll);
      L.marker(ll, { icon: pin(String(c.n), false), title: t("map.compTitle", { n: c.n, address: c.address || t("common.unnamedComp") }) })
        .bindPopup(
          popup(
            [
              { text: t("map.compN", { n: c.n }), bold: true },
              { text: c.address || t("common.unnamedComp") },
              { text: t("map.soldAdj", { sold: usd(c.salePrice), adjusted: usd(c.adjustedPrice) }) },
              ...(c.mapDistanceMi !== null ? [{ text: t("map.distance", { distance: num(n.dec2(c.mapDistanceMi)) }) }] : []),
              { text: t("map.matchedLine", { label: c.geo.label }), muted: true },
            ],
            info.dir,
          ),
        )
        .addTo(map);
    }
    if (pts.length === 1) map.setView(pts[0], 15);
    else map.fitBounds(L.latLngBounds(pts), { padding: [48, 48], maxZoom: 16 });
    return () => { map.remove(); };
  }, [subject, comps, t, usd, num, info.dir]);

  return <div ref={ref} role="region" dir="ltr" aria-label={t("map.aria")} className="h-[380px] w-full overflow-hidden rounded-xl" style={{ isolation: "isolate", background: "var(--surface-2)" }} />;
}
