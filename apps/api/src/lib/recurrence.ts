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
  interval: number
): OccurrenceWindow {
  const start = startDate.slice(0, 10);
  const end = (endDate || start).slice(0, 10);
  const span = Math.max(0, calendarDaysBetween(start, end));
  const nextStart = shiftByPeriod(start, frequency, interval);
  return { start_date: nextStart, end_date: addCalendarDays(nextStart, span) };
}

/** Move forward at least once. Windows whose deadline is already past are skipped. */
export function rollWindowForward(
  startDate: string,
  endDate: string | null,
  frequency: Frequency,
  interval: number,
  today: string
): OccurrenceWindow {
  let window = nextOccurrenceWindow(startDate, endDate, frequency, interval);
  for (let guard = 0; guard < 500 && window.end_date < today; guard += 1) {
    window = nextOccurrenceWindow(window.start_date, window.end_date, frequency, interval);
  }
  return window;
}

function shiftByPeriod(date: string, frequency: Frequency, interval: number): string {
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
  if (frequency === "monthly") return addCalendarMonths(date, step);
  if (frequency === "quarterly") return addCalendarMonths(date, 3 * step);
  if (frequency === "half_yearly") return addCalendarMonths(date, 6 * step);
  return addCalendarMonths(date, 12 * step);
}
