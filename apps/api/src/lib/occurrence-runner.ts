import { generateDueOccurrences } from "../services/recurring";

const MIN_INTERVAL_MS = 30_000;

let lastStartedAt = 0;
let running: Promise<void> | null = null;

/**
 * Kick off due-occurrence generation without blocking the HTTP response.
 * At most one run at a time, and at most once per 30s.
 */
export function scheduleDueOccurrences(limit = 50): void {
  const now = Date.now();
  if (running) return;
  if (now - lastStartedAt < MIN_INTERVAL_MS) return;
  lastStartedAt = now;
  running = generateDueOccurrences(limit)
    .then(() => undefined)
    .catch((err) => {
      console.error("generateDueOccurrences failed", err);
    })
    .finally(() => {
      running = null;
    });
}
