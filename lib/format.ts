const dateTime = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const timeOnly = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
const dateOnlyUtc = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dayUtc = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const rel = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const toDate = (v: string | number) => new Date(v);

export const fmtDateTime = (v: string | number | null | undefined) => (v == null ? "—" : dateTime.format(toDate(v)));
/** Clock time in the user's own time zone ("03:30"). */
export const fmtTime = (v: string | number | null | undefined) => (v == null ? "—" : timeOnly.format(toDate(v)));
export const fmtDateUtc = (v: string | number | null | undefined) => (v == null ? "—" : dateOnlyUtc.format(toDate(v)));
export const fmtDayUtc = (v: string | number) => dayUtc.format(toDate(v));
export const utcDayKey = (v: string | number) => toDate(v).toISOString().slice(0, 10);

export function fmtAgo(v: string | number | null | undefined): string {
  if (v == null) return "—";
  const s = Math.round((toDate(v).getTime() - Date.now()) / 1000);
  const abs = Math.abs(s);
  if (abs < 60) return rel.format(s, "second");
  if (abs < 3600) return rel.format(Math.round(s / 60), "minute");
  if (abs < 86400) return rel.format(Math.round(s / 3600), "hour");
  return rel.format(Math.round(s / 86400), "day");
}

export const shortAddr = (a: string, n = 6) => (a.length > n * 2 + 2 ? `${a.slice(0, n + 2)}…${a.slice(-n)}` : a);

/** First present key from a loosely specified row. */
export function pick<T = unknown>(row: Record<string, unknown> | null | undefined, keys: string[]): T | undefined {
  for (const k of keys) if (row?.[k] != null) return row[k] as T;
  return undefined;
}
