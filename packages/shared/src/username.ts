/** Special staff account that only receives system-generated schedule work — never user-assigned tasks. */
export const SCHEDULE_TASKS_USERNAME = "schedule.tasks";

export function canReceiveAssignedTasks(user: {
  username?: string;
  first_name?: string;
  last_name?: string;
}): boolean {
  if (user.username?.toLowerCase() === SCHEDULE_TASKS_USERNAME) return false;
  const name = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim().toLowerCase();
  return name !== "schedule tasks";
}

export function capitalizeName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function normalizeNamePart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function baseUsername(firstName: string, lastName: string): string {
  const first = normalizeNamePart(firstName);
  const last = normalizeNamePart(lastName);
  if (!first || !last) {
    throw new Error("First name and last name are required to generate a username");
  }
  return `${first}.${last}`;
}

/** Given existing usernames that collide with base, return next unique username. */
export function nextUniqueUsername(base: string, existing: string[]): string {
  const set = new Set(existing.map((u) => u.toLowerCase()));
  if (!set.has(base.toLowerCase())) return base;
  let n = 2;
  while (set.has(`${base}${n}`.toLowerCase())) n += 1;
  return `${base}${n}`;
}
