/** Speech-to-text through the browser's own recogniser, where it has one. Nothing here sends anything anywhere itself. */

export interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
export type RecognitionCtor = new () => RecognitionLike;

/** The browser's recogniser constructor (Chrome, Edge and Safari have one, under different names), or null. */
export function recognitionCtor(w: unknown = typeof window === "undefined" ? undefined : window): RecognitionCtor | null {
  const x = w as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor } | undefined;
  return x?.SpeechRecognition ?? x?.webkitSpeechRecognition ?? null;
}

export type SpeechProblem = "denied" | "mic" | "none" | "network" | "generic";

/** What the recogniser's error code means for the person. "aborted" is us stopping it, not a problem. */
export function speechProblem(code: string | undefined): SpeechProblem | null {
  switch (code) {
    case "aborted": return null;
    case "not-allowed": case "service-not-allowed": return "denied";
    case "audio-capture": return "mic";
    case "no-speech": return "none";
    case "network": return "network";
    default: return "generic";
  }
}

/** Day-month-year or month-day-year, for reading numeric dates the way this language writes them. */
export function dateOrderFor(intl: string): "mdy" | "dmy" {
  try {
    const parts = new Intl.DateTimeFormat(intl, { day: "numeric", month: "numeric", year: "numeric" }).formatToParts(new Date(2020, 10, 25));
    const names = parts.map((p) => p.type).filter((t) => t === "day" || t === "month");
    return names[0] === "day" ? "dmy" : "mdy";
  } catch { return "mdy"; }
}

/** The language to recognise: reading works in English only, so English, using the reader's own variant when they have one. */
export const recognitionLang = (intl: string) => (/^en-/i.test(intl) ? intl : "en-US");
