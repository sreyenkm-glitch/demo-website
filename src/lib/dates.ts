/** Date helpers. Calendar dates are stored as YYYY-MM-DD strings; instants as ISO strings. */

export function toYmd(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function parseYmd(s: string) {
  return new Date(`${s}T00:00:00Z`);
}

export function addDays(ymd: string, days: number) {
  const d = parseYmd(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return toYmd(d);
}

/** ISO-8601 week number + ISO year for a calendar date. */
export function isoWeek(ymd: string) {
  const d = parseYmd(ymd);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 864e5 + 1) / 7);
  return { week, year: d.getUTCFullYear() };
}

/** Most recent date (on or before `ymd`) that falls on `weekStartDay`. */
export function startOfWeek(ymd: string, weekStartDay: number) {
  const d = parseYmd(ymd);
  const diff = (d.getUTCDay() - weekStartDay + 7) % 7;
  return addDays(ymd, -diff);
}

/** Convert a wall-clock date+time in a timezone to an ISO instant. */
export function zonedToIso(ymd: string, hhmm: string, timeZone: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const guess = new Date(`${ymd}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);
  const offset = tzOffsetMinutes(guess, timeZone);
  return new Date(guess.getTime() - offset * 60_000).toISOString();
}

function tzOffsetMinutes(date: Date, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(date);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    return Math.round((asUtc - date.getTime()) / 60_000);
  } catch {
    return 0;
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtShort(ymd: string) {
  const d = parseYmd(ymd);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function fmtRange(start: string, end: string) {
  return `${fmtShort(start)} – ${fmtShort(end)}`;
}

export function fmtDateTime(iso: string, timeZone = "UTC") {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** "due in 2 days", "due in 5 hours", "overdue by 1 day" */
export function dueIn(deadlineIso: string, now = new Date()) {
  const ms = new Date(deadlineIso).getTime() - now.getTime();
  const abs = Math.abs(ms);
  const hours = Math.round(abs / 36e5);
  const days = Math.round(abs / 864e5);
  const unit = hours < 36 ? `${Math.max(hours, 1)} hour${hours === 1 ? "" : "s"}` : `${days} day${days === 1 ? "" : "s"}`;
  return { overdue: ms < 0, label: ms < 0 ? `overdue by ${unit}` : `due in ${unit}`, ms };
}

export function timeAgo(iso: string, now = new Date()) {
  const s = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
