/** Studio plan: your own name and logo on the report. Stored in this browser only. */
export interface Brand { name: string; logo: string | null }

export const BRAND_KEY = "comppilot.brand";
export const MAX_LOGO_BYTES = 200 * 1024;
const LOGO_TYPES = ["image/png", "image/jpeg", "image/svg+xml"];

export function checkLogo(file: { type: string; size: number }): "ok" | "badType" | "tooLarge" {
  if (!LOGO_TYPES.includes(file.type)) return "badType";
  return file.size > MAX_LOGO_BYTES ? "tooLarge" : "ok";
}

/** Only data URLs for the three allowed image types are ever used as a logo source. */
export const isSafeLogo = (v: unknown): v is string => typeof v === "string" && /^data:image\/(png|jpeg|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length < MAX_LOGO_BYTES * 1.4;

export function parseBrand(raw: string | null): Brand {
  try {
    const b = raw ? JSON.parse(raw) : null;
    return { name: typeof b?.name === "string" ? b.name.slice(0, 80) : "", logo: isSafeLogo(b?.logo) ? b.logo : null };
  } catch {
    return { name: "", logo: null };
  }
}
