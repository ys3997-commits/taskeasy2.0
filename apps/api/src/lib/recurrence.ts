import type { Frequency } from "@rajshree/shared";
import { config } from "../config";

export interface ScheduleLike {
  frequency: Frequency;
  interval: number;
  byweekday: number[] | null;
  bymonthday: number | null;
  time_of_day: string;
  start_date: string;
  end_date: string | null;
  next_occurrence_at: string | null;
}

function parseTime(timeOfDay: string): { h: number; m: number; s: number } {
  const parts = timeOfDay.split(":").map(Number);
  return { h: parts[0] || 0, m: parts[1] || 0, s: parts[2] || 0 };
}

/** Build a Date in APP_TIMEZONE for a calendar date + time_of_day. */
export function deadlineForDate(dateStr: string, timeOfDay: string): Date {
  const { h, m, s } = parseTime(timeOfDay);
  // Construct as local-like ISO with timezone offset for Asia/Kolkata (+05:30) default
  // Using Intl to get offset for APP_TIMEZONE
  const probe = new Date(`${dateStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: config.appTimezone,
    timeZoneName: "shortOffset",
  });
  const parts = formatter.formatToParts(probe);
  const tzName = parts.find((p) => p.type === "timeZoneName")?.value || "GMT+5:30";
  const match = tzName.match(/GMT([+-])(\d+)(?::(\d+))?/);
  let offset = "+05:30";
  if (match) {
    const sign = match[1];
    const hh = String(match[2]).padStart(2, "0");
    const mm = String(match[3] || "0").padStart(2, "0");
    offset = `${sign}${hh}:${mm}`;
  }
  return new Date(
    `${dateStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}${offset}`
  );
}

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function addYears(date: Date, years: number): Date {
  const next = new Date(date.getTime());
  next.setUTCFullYear(next.getUTCFullYear() + years);
  return next;
}

/** Compute the next occurrence datetime after `from` (exclusive if from is an occurrence). */
export function computeNextOccurrence(
  schedule: ScheduleLike,
  from: Date = new Date()
): Date | null {
  const start = deadlineForDate(schedule.start_date, schedule.time_of_day);
  let cursor = schedule.next_occurrence_at
    ? new Date(schedule.next_occurrence_at)
    : start;

  if (cursor < start) cursor = start;

  // If we have never generated and start is still in the future, return start
  if (!schedule.next_occurrence_at && start >= from) {
    if (schedule.end_date) {
      const endDeadline = deadlineForDate(schedule.end_date, schedule.time_of_day);
      if (start > endDeadline) return null;
    }
    return start;
  }

  // Advance from current next_occurrence_at
  let guard = 0;
  let candidate = cursor;

  while (guard < 500) {
    guard += 1;
    candidate = advanceOnce(schedule, candidate);

    if (schedule.end_date) {
      const endDeadline = deadlineForDate(schedule.end_date, schedule.time_of_day);
      if (candidate > endDeadline) return null;
    }
    if (candidate > from || (!schedule.next_occurrence_at && candidate >= from)) {
      return candidate;
    }
  }
  return null;
}

function advanceOnce(schedule: ScheduleLike, current: Date): Date {
  const { frequency, interval, byweekday, bymonthday, time_of_day } = schedule;

  if (frequency === "daily") {
    const next = addDays(current, interval);
    return deadlineForDate(toDateOnly(next), time_of_day);
  }

  if (frequency === "weekly") {
    const weekdays =
      byweekday && byweekday.length > 0
        ? [...byweekday].sort((a, b) => a - b)
        : [current.getUTCDay()];

    let probe = addDays(current, 1);
    for (let i = 0; i < 14 * interval + 7; i++) {
      const dow = probe.getUTCDay();
      if (weekdays.includes(dow)) {
        // For interval > 1, ensure weeks since start align
        if (interval === 1) {
          return deadlineForDate(toDateOnly(probe), time_of_day);
        }
        const start = new Date(schedule.start_date + "T00:00:00Z");
        const weeks =
          Math.floor((probe.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000));
        if (weeks % interval === 0) {
          return deadlineForDate(toDateOnly(probe), time_of_day);
        }
      }
      probe = addDays(probe, 1);
    }
    return deadlineForDate(toDateOnly(addDays(current, 7 * interval)), time_of_day);
  }

  if (frequency === "monthly") {
    const day = bymonthday || Number(schedule.start_date.slice(8, 10));
    let next = addMonths(current, interval);
    const y = next.getUTCFullYear();
    const m = next.getUTCMonth();
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const useDay = Math.min(day, lastDay);
    const dateStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(useDay).padStart(2, "0")}`;
    return deadlineForDate(dateStr, time_of_day);
  }

  // yearly
  const next = addYears(current, interval);
  const monthDay = schedule.start_date.slice(5); // MM-DD
  const dateStr = `${next.getUTCFullYear()}-${monthDay}`;
  return deadlineForDate(dateStr, time_of_day);
}

export function initialNextOccurrence(schedule: Omit<ScheduleLike, "next_occurrence_at">): Date | null {
  return computeNextOccurrence({ ...schedule, next_occurrence_at: null }, new Date(0));
}
