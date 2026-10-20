import type { Profile } from "@rajshree/shared";

const TTL_MS = 60_000;

type CacheEntry = {
  profile: Profile;
  expiresAt: number;
};

const byToken = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<Profile>>();

/** Short-lived cache so parallel requests do not each hit Supabase Auth. */
export function getCachedAuthProfile(token: string): Profile | null {
  const entry = byToken.get(token);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    byToken.delete(token);
    return null;
  }
  return entry.profile;
}

export function setCachedAuthProfile(token: string, profile: Profile): void {
  byToken.set(token, { profile, expiresAt: Date.now() + TTL_MS });
  if (byToken.size > 500) {
    const now = Date.now();
    for (const [key, value] of byToken) {
      if (value.expiresAt <= now) byToken.delete(key);
    }
  }
}

export function clearCachedAuthProfile(token?: string): void {
  if (token) {
    byToken.delete(token);
    inflight.delete(token);
    return;
  }
  byToken.clear();
  inflight.clear();
}

/** Deduplicate concurrent token validations for the same access token. */
export function coalesceAuthLookup(
  token: string,
  lookup: () => Promise<Profile>
): Promise<Profile> {
  const existing = inflight.get(token);
  if (existing) return existing;
  const pending = lookup().finally(() => {
    inflight.delete(token);
  });
  inflight.set(token, pending);
  return pending;
}
