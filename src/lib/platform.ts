export type NativePlatform = "ios" | "android";

interface CapacitorLike { isNativePlatform?: () => boolean; getPlatform?: () => string }

/**
 * Which store app this is running inside, or null in a normal browser or installed web app. The native wrapper
 * (Capacitor) puts `window.Capacitor` on the page; nothing else does.
 */
export function nativePlatform(w: { Capacitor?: CapacitorLike } | undefined = typeof window === "undefined" ? undefined : (window as unknown as { Capacitor?: CapacitorLike })): NativePlatform | null {
  const c = w?.Capacitor;
  if (!c || typeof c.isNativePlatform !== "function" || !c.isNativePlatform()) return null;
  const p = typeof c.getPlatform === "function" ? c.getPlatform() : "";
  return p === "ios" || p === "android" ? p : null;
}
