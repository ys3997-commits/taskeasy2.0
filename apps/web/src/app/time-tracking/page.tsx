"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IST_TIME_ZONE,
  istDateString,
  todayIst,
  type LoginSession,
  type Profile,
} from "@rajshree/shared";
import { AppShell } from "@/components/app-shell";
import { Alert, Card, EmptyState, Label, Select } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn, formatDate, fullName } from "@/lib/utils";

type Tab = "all" | "member";

type AllMemberRow = {
  id: string;
  name: string;
  loggedInAt: string | null;
};

/** First sign-in clock time in IST, e.g. 03:28 AM. */
function formatClock(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: IST_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const hour = read("hour").padStart(2, "0");
  const minute = read("minute").padStart(2, "0");
  const dayPeriod = read("dayPeriod").toUpperCase();
  return `${hour}:${minute} ${dayPeriod}`;
}

/** Date + AM/PM time in IST, e.g. 17/10/2026, 03:28 AM. */
function formatLoginDateTime(value: string): string {
  return `${formatDate(value)}, ${formatClock(value)}`;
}

export default function TimeTrackingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("all");
  const [staff, setStaff] = useState<Profile[]>([]);
  const [memberId, setMemberId] = useState("");
  const [sessions, setSessions] = useState<LoginSession[]>([]);
  const [error, setError] = useState("");
  const [loadingRows, setLoadingRows] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (user.role !== "admin") router.replace("/dashboard");
  }, [user, loading, router]);

  useEffect(() => {
    if (user?.role !== "admin") return;
    api
      .listStaff()
      .then((res) => setStaff(res.data))
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Failed to load team members")
      );
  }, [user]);

  useEffect(() => {
    if (user?.role !== "admin") return;
    if (tab === "member" && !memberId) {
      setSessions([]);
      setLoadingRows(false);
      return;
    }
    let cancelled = false;
    setLoadingRows(true);
    setError("");
    api
      .loginSessions(tab === "member" ? memberId : undefined)
      .then((res) => {
        if (!cancelled) setSessions(res.data);
      })
      .catch((err) => {
        if (!cancelled) {
          setSessions([]);
          setError(err instanceof ApiError ? err.message : "Failed to load time tracking");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingRows(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, tab, memberId]);

  const members = useMemo(
    () =>
      [...staff].sort((a, b) =>
        fullName(a).localeCompare(fullName(b), undefined, { sensitivity: "base" })
      ),
    [staff]
  );

  const firstLogins = useMemo(() => {
    const earliest = new Map<string, LoginSession>();
    for (const session of sessions) {
      const date = istDateString(new Date(session.logged_in_at));
      const key = `${session.user_id}:${date}`;
      const current = earliest.get(key);
      if (
        !current ||
        new Date(session.logged_in_at).getTime() < new Date(current.logged_in_at).getTime()
      ) {
        earliest.set(key, session);
      }
    }
    return [...earliest.values()];
  }, [sessions]);

  const allRows = useMemo(() => {
    const today = todayIst();
    const loginByUser = new Map<string, string>();
    for (const session of firstLogins) {
      if (istDateString(new Date(session.logged_in_at)) !== today) continue;
      const existing = loginByUser.get(session.user_id);
      if (
        !existing ||
        new Date(session.logged_in_at).getTime() < new Date(existing).getTime()
      ) {
        loginByUser.set(session.user_id, session.logged_in_at);
      }
    }

    return members
      .filter((member) => member.is_active)
      .map(
        (member): AllMemberRow => ({
          id: member.id,
          name: fullName(member),
          loggedInAt: loginByUser.get(member.id) ?? null,
        })
      );
  }, [firstLogins, members]);

  const dayGroups = useMemo(() => {
    const grouped = new Map<string, LoginSession>();
    for (const session of firstLogins) {
      const date = istDateString(new Date(session.logged_in_at));
      const current = grouped.get(date);
      if (
        !current ||
        new Date(session.logged_in_at).getTime() < new Date(current.logged_in_at).getTime()
      ) {
        grouped.set(date, session);
      }
    }
    return [...grouped.entries()]
      .map(([date, session]) => ({ date, session }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [firstLogins]);

  if (loading || !user || user.role !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50 text-ink-500">
        Loading…
      </div>
    );
  }

  return (
    <AppShell>
      <h1 className="font-display text-3xl font-semibold text-ink-900">Time Tracking</h1>
      <p className="mt-1 text-sm text-ink-500">
        All members lists everyone A–Z for today. One member shows every date. Times are shown in
        IST.
      </p>

      <div className="mt-6 inline-flex rounded-md border border-ink-200 bg-white p-1">
        {(
          [
            ["all", "All members"],
            ["member", "One member"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={cn(
              "rounded px-4 py-2 text-sm font-medium",
              tab === value ? "bg-brand-600 text-white" : "text-ink-700 hover:bg-ink-50"
            )}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {tab === "member" ? (
        <div className="mt-4 max-w-sm">
          <Label htmlFor="time-tracking-member">Member</Label>
          <Select
            id="time-tracking-member"
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
          >
            <option value="">Select a member</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {fullName(member)}
                {member.is_active ? "" : " (inactive)"}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      <div className="mt-4">
        {loadingRows ? (
          <p className="text-sm text-ink-500">Loading…</p>
        ) : tab === "member" && !memberId ? (
          <EmptyState
            title="Choose a team member"
            description="Their first sign-in on each date is listed here."
          />
        ) : tab === "all" ? (
          allRows.length === 0 ? (
            <EmptyState
              title="No team members yet"
              description="Add staff to see today’s sign-in times here."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-ink-200 bg-white">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-ink-50 text-ink-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Member</th>
                    <th className="px-4 py-3 font-medium">Login</th>
                  </tr>
                </thead>
                <tbody>
                  {allRows.map((row) => (
                    <tr key={row.id} className="border-t border-ink-100">
                      <td className="px-4 py-3 font-medium text-ink-900">{row.name}</td>
                      <td className="px-4 py-3 text-ink-700">
                        {row.loggedInAt
                          ? formatLoginDateTime(row.loggedInAt)
                          : "Yet to Log In"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : sessions.length === 0 ? (
          <EmptyState
            title="No sign-in activity yet"
            description="Times appear here after someone signs in."
          />
        ) : (
          <div className="space-y-4">
            {dayGroups.map((group) => (
              <Card key={group.date} className="p-0">
                <h2 className="border-b border-ink-100 px-4 py-3 text-base font-semibold text-ink-900">
                  {formatDate(group.date)}
                </h2>
                <p className="border-t border-ink-100 px-4 py-3 text-sm text-ink-700">
                  {formatClock(group.session.logged_in_at)}
                </p>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
