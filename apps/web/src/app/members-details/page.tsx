"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { MemberDetailsSummary, TaskStatusCounts } from "@rajshree/shared";
import { AppShell } from "@/components/app-shell";
import { MembersBoxView } from "@/components/members-box-view";
import {
  PunctualityBar,
  PunctualityBoxes,
  PunctualityPanel,
  sumPunctuality,
} from "@/components/punctuality-panel";
import { Alert, Card, EmptyState, Input } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn, fullName } from "@/lib/utils";

const ASSIGNED_CARDS = [
  { key: "pending", label: "Pending" },
  { key: "overdue", label: "Overdue" },
  { key: "sent_for_approval", label: "Sent for Approval" },
] as const;

const DELEGATED_CARDS = [
  { key: "pending", label: "Pending" },
  { key: "overdue", label: "Overdue" },
  { key: "sent_for_approval", label: "Received for Approval" },
] as const;

function emptyCounts(): TaskStatusCounts {
  return { pending: 0, completed: 0, overdue: 0, sent_for_approval: 0 };
}

function sumCounts(
  members: MemberDetailsSummary[],
  side: "received" | "delegated"
): TaskStatusCounts {
  return members.reduce((total, member) => {
    const counts = member[side];
    total.pending += counts.pending;
    total.completed += counts.completed;
    total.overdue += counts.overdue;
    total.sent_for_approval += counts.sent_for_approval;
    return total;
  }, emptyCounts());
}

function boxHref(
  side: "assigned" | "delegated",
  status: string,
  member?: MemberDetailsSummary
) {
  const qs = new URLSearchParams({ side, status });
  if (member) {
    qs.set("member", member.id);
    qs.set("name", fullName(member));
  }
  return `/members-details?${qs.toString()}`;
}

function StatusGrid({
  hrefFor,
  counts,
  cards,
}: {
  hrefFor: (status: string) => string;
  counts: TaskStatusCounts;
  cards: readonly { key: keyof TaskStatusCounts; label: string }[];
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
      {cards.map((card) => {
        const value = counts[card.key];
        const overdue = card.key === "overdue";
        return (
          <Link key={card.key} href={hrefFor(card.key)}>
            <Card className="flex h-full items-center justify-between gap-3 px-3 py-3 text-left transition hover:border-brand-500 sm:block sm:px-3 sm:py-3.5 sm:text-center">
              <p
                className={cn(
                  "text-sm font-medium leading-snug",
                  overdue ? "text-red-700" : "text-ink-500"
                )}
              >
                {card.label}
              </p>
              <p
                className={cn(
                  "font-display text-2xl font-semibold tabular-nums sm:mt-1.5 sm:text-3xl",
                  overdue ? "text-red-700" : "text-ink-900"
                )}
              >
                {value}
              </p>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

function TaskSides({
  member,
  assignedCounts,
  delegatedCounts,
}: {
  member?: MemberDetailsSummary;
  assignedCounts: TaskStatusCounts;
  delegatedCounts: TaskStatusCounts;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-2 lg:gap-6">
      <div className="rounded-lg border border-ink-100 bg-ink-50/40 p-4">
        <h3 className="mb-3 text-sm font-semibold tracking-wide text-ink-700">
          Assigned Tasks
        </h3>
        <StatusGrid
          hrefFor={(status) => boxHref("assigned", status, member)}
          counts={assignedCounts}
          cards={ASSIGNED_CARDS}
        />
      </div>
      <div className="rounded-lg border border-ink-100 bg-ink-50/40 p-4">
        <h3 className="mb-3 text-sm font-semibold tracking-wide text-ink-700">
          Delegated Tasks
        </h3>
        <StatusGrid
          hrefFor={(status) => boxHref("delegated", status, member)}
          counts={delegatedCounts}
          cards={DELEGATED_CARDS}
        />
      </div>
    </div>
  );
}

function MembersDetailsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const side = searchParams.get("side");
  const status = searchParams.get("status");
  const memberId = searchParams.get("member") || undefined;
  const memberName = searchParams.get("name") || undefined;
  const boxOpen =
    (side === "assigned" || side === "delegated") &&
    (status === "pending" || status === "overdue" || status === "sent_for_approval");
  const [members, setMembers] = useState<MemberDetailsSummary[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loadingRows, setLoadingRows] = useState(true);

  useEffect(() => {
    if (!loading && user && user.role !== "admin") router.replace("/dashboard");
  }, [user, loading, router]);

  useEffect(() => {
    if (boxOpen || user?.role !== "admin" || members.length > 0) return;
    setLoadingRows(true);
    api
      .membersDetailsSummary()
      .then((res) => {
        setMembers(
          [...res.data].sort((a, b) => {
            const roleOrder = Number(a.role !== "admin") - Number(b.role !== "admin");
            if (roleOrder !== 0) return roleOrder;
            return fullName(a).localeCompare(fullName(b), undefined, {
              sensitivity: "base",
            });
          })
        );
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Failed to load members")
      )
      .finally(() => setLoadingRows(false));
  }, [user, boxOpen, members.length]);

  const companyAssigned = useMemo(() => sumCounts(members, "received"), [members]);
  const companyDelegated = useMemo(() => sumCounts(members, "delegated"), [members]);
  const companyPunctuality = useMemo(
    () => sumPunctuality(members.map((member) => member.punctuality)),
    [members]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((member) => {
      const name = fullName(member).toLowerCase();
      return (
        name.includes(q) ||
        member.username.toLowerCase().includes(q) ||
        member.role.toLowerCase().includes(q)
      );
    });
  }, [members, query]);

  if (!user || user.role !== "admin") return null;

  if (
    boxOpen &&
    (side === "assigned" || side === "delegated") &&
    (status === "pending" || status === "overdue" || status === "sent_for_approval")
  ) {
    return (
      <AppShell>
        <MembersBoxView
          side={side}
          status={status}
          memberId={memberId}
          memberName={memberName}
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-3xl font-semibold text-ink-900">
          Members Details
        </h1>
        <div className="w-full sm:max-w-xs">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or username"
            aria-label="Search members"
          />
        </div>
      </div>

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {loadingRows ? (
        <p className="text-sm text-ink-500">Loading members…</p>
      ) : (
        <div className="space-y-8">
          <section className="rounded-xl border border-brand-200 bg-gradient-to-b from-white to-brand-50/40 p-4 shadow-sm sm:p-5">
            <div className="mb-5">
              <h2 className="break-words font-display text-xl font-semibold text-brand-800 sm:text-2xl">
                Rajshree Energy
              </h2>
            </div>

            <PunctualityPanel
              stats={companyPunctuality}
              audience="company"
              showNarrative={false}
              showCounts={false}
              splitBar
              className="mb-5"
            />

            <TaskSides
              assignedCounts={companyAssigned}
              delegatedCounts={companyDelegated}
            />
          </section>

          {filtered.length === 0 ? (
            <EmptyState
              title={query ? "No members match your search" : "No members found"}
              description={
                query
                  ? "Try a different name or username."
                  : "Add team members from the Team member page."
              }
            />
          ) : (
            filtered.map((member) => (
              <section
                id={member.id}
                key={member.id}
                className="scroll-mt-24 rounded-xl border border-ink-200 bg-white/80 p-4 shadow-sm sm:p-5"
              >
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="break-words font-display text-xl font-semibold text-ink-900 sm:text-2xl">
                      {fullName(member)}
                    </h2>
                    <span
                      className={cn(
                        "rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                        member.role === "admin"
                          ? "bg-brand-50 text-brand-800 ring-brand-200"
                          : "bg-ink-50 text-ink-700 ring-ink-200"
                      )}
                    >
                      {member.role === "admin" ? "Admin" : "Team"}
                    </span>
                    {!member.is_active ? (
                      <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900 ring-1 ring-inset ring-amber-200">
                        Inactive
                      </span>
                    ) : null}
                  </div>
                  <PunctualityBoxes stats={member.punctuality} compact />
                </div>

                <PunctualityBar stats={member.punctuality} className="mb-5" />

                <TaskSides
                  member={member}
                  assignedCounts={member.received}
                  delegatedCounts={member.delegated}
                />
              </section>
            ))
          )}
        </div>
      )}
    </AppShell>
  );
}

export default function MembersDetailsRoute() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-ink-50 text-sm text-ink-500">
          Loading…
        </div>
      }
    >
      <MembersDetailsPage />
    </Suspense>
  );
}
