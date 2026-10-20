import {
  addCalendarDays,
  addCalendarMonths,
  calendarDaysBetween,
  istDateString,
  istInstant,
  istParts,
  type Frequency,
} from "@rajshree/shared";

export interface ScheduleLike {
  frequency: Frequency;
  interval: number;
  byweekday: number[] | null;
  bymonthday: number | null;
  time_of_day: string;
  start_date: string;
  end_date: string | null;
  next_occurrence_at: string | null;
  /** 6 skips Sunday. 7 includes every day. */
  work_days?: 6 | 7;
}

export function isWorkingDay(date: Date, workDays: 6 | 7 = 7): boolean {
  if (workDays !== 6) return true;
  return istParts(date).weekday !== 0;
}

/**
 * A 6-day week has no Sunday. That occurrence moves to the next working day
 * (Monday) instead of being dropped. Later dates still follow the original rule.
 */
export function nextWorkingInstant(date: Date, workDays: 6 | 7, timeOfDay: string): Date {
  if (isWorkingDay(date, workDays)) return date;
  let day = istDateString(date);
  for (let step = 0; step < 7; step += 1) {
    day = addCalendarDays(day, 1);
    const shifted = deadlineForDate(day, timeOfDay);
    if (isWorkingDay(shifted, workDays)) return shifted;
  }
  return date;
}

/** Build a Date for a calendar date and clock time in Indian Standard Time. */
export function deadlineForDate(dateStr: string, timeOfDay: string): Date {
  return istInstant(dateStr.slice(0, 10), timeOfDay);
}

export interface OccurrenceWindow {
  start_date: string;
  end_date: string;
}

/**
 * Start date is when this occurrence can begin. End date is its deadline.
 * The next occurrence keeps that same gap and moves forward by one frequency step.
 * Weekly 20/10–22/10 becomes 27/10–29/10.
 */
export function nextOccurrenceWindow(
  startDate: string,
  endDate: string | null,
  frequency: Frequency,
  interval: number,
  bymonthday?: number | null
): OccurrenceWindow {
  const start = startDate.slice(0, 10);
  const end = (endDate || start).slice(0, 10);
  const span = Math.max(0, calendarDaysBetween(start, end));
  const nextStart = shiftByPeriod(start, frequency, interval, bymonthday);
  return { start_date: nextStart, end_date: addCalendarDays(nextStart, span) };
}

/** Move forward at least once. Windows whose deadline is already past are skipped. */
export function rollWindowForward(
  startDate: string,
  endDate: string | null,
  frequency: Frequency,
  interval: number,
  today: string,
  bymonthday?: number | null
): OccurrenceWindow {
  let window = nextOccurrenceWindow(startDate, endDate, frequency, interval, bymonthday);
  for (let guard = 0; guard < 500 && window.end_date < today; guard += 1) {
    window = nextOccurrenceWindow(
      window.start_date,
      window.end_date,
      frequency,
      interval,
      bymonthday
    );
  }
  return window;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Anchor day for thrice-monthly (A, A+10, A+20). Stored on the schedule as bymonthday. */
function thriceAnchor(date: string, bymonthday?: number | null): number {
  if (typeof bymonthday === "number" && bymonthday >= 1 && bymonthday <= 31) {
    return bymonthday;
  }
  const day = Number(date.slice(8, 10));
  if (day === 1) return 1;
  if (day > 20) return day - 20;
  if (day > 10) return day - 10;
  return day;
}

/**
 * Thrice monthly: due on A, A+10, A+20 each month.
 * If A+20 does not exist (e.g. 29 in a 28-day month), that slot is the 1st of the next month,
 * then the cycle continues with A in that month.
 * Example start 9 Feb (28 days): 9 → 19 → 1 Mar → 9 Mar → 19 Mar → 29 Mar → …
 */
function shiftThriceMonthly(date: string, bymonthday?: number | null): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const anchor = thriceAnchor(date, bymonthday);
  const last = daysInMonth(year, month);
  const second = anchor + 10;
  const third = anchor + 20;
  const ym = `${year}-${pad2(month)}`;

  // 1st stands in for a missing A+20 from the previous month — next is A this month.
  if (day === 1 && anchor !== 1) {
    return `${ym}-${pad2(Math.min(anchor, last))}`;
  }

  if (day < second) {
    if (second <= last) return `${ym}-${pad2(second)}`;
    return addCalendarMonths(`${ym}-01`, 1, 1);
  }

  if (third <= last) {
    if (day < third) return `${ym}-${pad2(third)}`;
    return addCalendarMonths(`${ym}-01`, 1, anchor);
  }

  // A+20 missing this month → 1st of next month.
  return addCalendarMonths(`${ym}-01`, 1, 1);
}

function shiftByPeriod(
  date: string,
  frequency: Frequency,
  interval: number,
  bymonthday?: number | null
): string {
  const step = Math.max(1, interval || 1);
  if (frequency === "daily") return addCalendarDays(date, step);
  if (frequency === "weekly") return addCalendarDays(date, 7 * step);
  if (frequency === "semi_monthly") {
    let cursor = date.slice(0, 10);
    for (let count = 0; count < step; count += 1) {
      const year = Number(cursor.slice(0, 4));
      const month = Number(cursor.slice(5, 7));
      const day = Number(cursor.slice(8, 10));
      cursor =
        day < 15
          ? `${year}-${String(month).padStart(2, "0")}-15`
          : addCalendarMonths(`${year}-${String(month).padStart(2, "0")}-01`, 1, 1);
    }
    return cursor;
  }
  if (frequency === "thrice_monthly") {
    let cursor = date.slice(0, 10);
    for (let count = 0; count < step; count += 1) {
      cursor = shiftThriceMonthly(cursor, bymonthday);
    }
    return cursor;
  }
  if (frequency === "monthly") return addCalendarMonths(date, step);
  if (frequency === "quarterly") return addCalendarMonths(date, 3 * step);
  if (frequency === "half_yearly") return addCalendarMonths(date, 6 * step);
  return addCalendarMonths(date, 12 * step);
}
