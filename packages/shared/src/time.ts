/** Indian Standard Time. India does not observe daylight saving, so the offset is fixed. */
export const IST_TIME_ZONE = "Asia/Kolkata";
export const IST_OFFSET = "+05:30";

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function istParts(date: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: IST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(date);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  let hour = Number(read("hour"));
  if (hour === 24) hour = 0;
  return {
    year: Number(read("year")),
    month: Number(read("month")),
    day: Number(read("day")),
    hour,
    minute: Number(read("minute")),
    second: Number(read("second")),
    weekday: WEEKDAY_INDEX[read("weekday")] ?? 0,
  };
}

/** Calendar date in IST as YYYY-MM-DD. */
export function istDateString(date: Date): string {
  const parts = istParts(date);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function parseClock(timeOfDay: string): { h: number; m: number; s: number } {
  const [h, m, s] = timeOfDay.split(":").map(Number);
  return { h: h || 0, m: m || 0, s: s || 0 };
}

/** A calendar date and clock time, read as Indian Standard Time. */
export function istInstant(dateStr: string, timeOfDay = "00:00:00"): Date {
  const { h, m, s } = parseClock(timeOfDay);
  return new Date(
    `${dateStr.slice(0, 10)}T${pad(h)}:${pad(m)}:${pad(s)}${IST_OFFSET}`
  );
}

/**
 * Accept an ISO instant, or a zoneless date/time and treat the zoneless value as IST.
 */
export function parseAsIst(value: string): Date {
  const trimmed = value.trim();
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(trimmed)) return new Date(trimmed);
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return istInstant(trimmed, "00:00:00");
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)/);
  if (match) return istInstant(match[1], match[2]);
  return new Date(trimmed);
}

/** Value for an input that should show the IST wall clock, without a zone suffix. */
export function toIstDatetimeLocal(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = istParts(date);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function formatIstDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return String(value);
  const parts = istParts(date);
  return `${pad(parts.day)}/${pad(parts.month)}/${parts.year}`;
}

/** IST calendar day as YYYY-MM-DD. Date-only strings keep their calendar day. */
export function istCalendarDay(value: string | Date): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value.trim())) {
    return value.trim().slice(0, 10);
  }
  const date = typeof value === "string" ? parseAsIst(value) : value;
  return istDateString(date);
}

export function todayIst(): string {
  return istDateString(new Date());
}

export function isBeforeTodayIst(value: string | Date): boolean {
  if (typeof value === "string" && !value.trim()) return false;
  const day = istCalendarDay(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  return day < todayIst();
}

export function formatIstDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return String(value);
  const parts = istParts(date);
  return `${pad(parts.day)}/${pad(parts.month)}/${parts.year}, ${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function addCalendarDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.slice(0, 10).split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

export function addCalendarMonths(
  dateStr: string,
  months: number,
  dayOfMonth?: number
): string {
  const [year, month, day] = dateStr.slice(0, 10).split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const nextYear = target.getUTCFullYear();
  const nextMonth = target.getUTCMonth();
  const lastDay = new Date(Date.UTC(nextYear, nextMonth + 1, 0)).getUTCDate();
  const useDay = Math.min(dayOfMonth ?? day, lastDay);
  return `${nextYear}-${pad(nextMonth + 1)}-${pad(useDay)}`;
}

export function weekdayOfCalendarDate(dateStr: string): number {
  const [year, month, day] = dateStr.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function calendarDaysBetween(startDate: string, endDate: string): number {
  const [startYear, startMonth, startDay] = startDate.slice(0, 10).split("-").map(Number);
  const [endYear, endMonth, endDay] = endDate.slice(0, 10).split("-").map(Number);
  const start = Date.UTC(startYear, startMonth - 1, startDay);
  const end = Date.UTC(endYear, endMonth - 1, endDay);
  return Math.floor((end - start) / 86400000);
}
