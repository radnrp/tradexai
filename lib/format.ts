import { getLang, type Lang } from "./i18n/index.ts";

function build(date: string, relative: string) {
  return {
    dateTime: new Intl.DateTimeFormat(date, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
    timeOnly: new Intl.DateTimeFormat(date, { hour: "2-digit", minute: "2-digit", hour12: false }),
    dateOnlyUtc: new Intl.DateTimeFormat(date, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
    dayUtc: new Intl.DateTimeFormat(date, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }),
    chartUtc: new Intl.DateTimeFormat(date, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }),
    rel: new Intl.RelativeTimeFormat(relative, { numeric: "auto" }),
  };
}

const LOCALES: Record<Lang, [string, string]> = { en: ["en-GB", "en"], fa: ["fa-IR", "fa"] }; // fa-IR's calendar is Jalali
const built: Partial<Record<Lang, ReturnType<typeof build>>> = {};
const f = () => (built[getLang()] ??= build(...LOCALES[getLang()]));

const toDate = (v: string | number) => new Date(v);

export const fmtDateTime = (v: string | number | null | undefined) => (v == null ? "—" : f().dateTime.format(toDate(v)));
/** Clock time in the user's own time zone ("03:30"). */
export const fmtTime = (v: string | number | null | undefined) => (v == null ? "—" : f().timeOnly.format(toDate(v)));
export const fmtDateUtc = (v: string | number | null | undefined) => (v == null ? "—" : f().dateOnlyUtc.format(toDate(v)));
export const fmtDayUtc = (v: string | number) => f().dayUtc.format(toDate(v));
/** Date and time for a chart's crosshair, in UTC like the chart's own axis. */
export const fmtChartTime = (epochSeconds: number) => f().chartUtc.format(epochSeconds * 1000);
export const utcDayKey = (v: string | number) => toDate(v).toISOString().slice(0, 10);

export function fmtAgo(v: string | number | null | undefined): string {
  if (v == null) return "—";
  const { rel } = f();
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
