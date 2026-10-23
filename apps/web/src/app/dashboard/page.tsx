"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DashboardSummary, TaskStatusCounts } from "@rajshree/shared";
import { AppShell } from "@/components/app-shell";
import { PunctualityPanel } from "@/components/punctuality-panel";
import { Button, Card } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const STATUS_CARDS = [
  { key: "pending", label: "Pending" },
  { key: "overdue", label: "Overdue" },
  { key: "sent_for_approval", label: "Sent for Approval" },
  { key: "completed", label: "Completed" },
] as const;

const DELEGATED_STATUS_CARDS = STATUS_CARDS.map((status) =>
  status.key === "sent_for_approval"
    ? { ...status, label: "Received for Approval" }
    : status
);

function statusCards(
  counts: TaskStatusCounts | undefined,
  hrefBase: string,
  cards: readonly { key: keyof TaskStatusCounts; label: string }[] = STATUS_CARDS
) {
  return cards.map((status) => ({
    key: status.key,
    label: status.label,
    value: counts ? counts[status.key] : "—",
    href: `${hrefBase}?status=${status.key}`,
  }));
}

function StatusGrid({
  cards,
}: {
  cards: { key: string; label: string; value: number | string; href: string }[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => {
        const overdue = card.key === "overdue";
        return (
          <Link key={card.key} href={card.href}>
            <Card className="text-center transition hover:border-brand-500">
              <p className={cn("text-sm", overdue ? "text-red-700" : "text-ink-500")}>
                {card.label}
              </p>
              <p
                className={cn(
                  "mt-2 font-display text-3xl font-semibold",
                  overdue ? "text-red-700" : "text-ink-900"
                )}
              >
                {card.value}
              </p>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

const DASHBOARD_CACHE_KEY = "dashboard-summary";

export default function DashboardPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(DASHBOARD_CACHE_KEY);
      if (cached) setSummary(JSON.parse(cached) as DashboardSummary);
    } catch {
      // Ignore a bad cache and load fresh numbers.
    }
    api
      .dashboardSummary()
      .then((next) => {
        setSummary(next);
        sessionStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(next));
      })
      .catch((e) => setError(e.message || "Failed to load summary"));
  }, []);

  const receivedCards = statusCards(summary?.received, "/tasks/received").filter(
    (card) => card.key !== "completed"
  );
  const delegatedCards = statusCards(
    summary?.delegated,
    "/tasks/delegated",
    DELEGATED_STATUS_CARDS
  ).filter((card) => card.key !== "completed");

  return (
    <AppShell>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <h1 className="font-display text-3xl font-semibold text-ink-900">Dashboard</h1>
        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex">
          <Link href="/tasks/new" className="block">
            <Button className="w-full sm:w-auto">One-Time Task</Button>
          </Link>
          {user?.role === "admin" ? (
            <Link href="/recurring/new" className="block">
              <Button className="w-full sm:w-auto">Recurring Task</Button>
            </Link>
          ) : null}
        </div>
      </div>

      {error ? <p className="mb-4 text-sm text-red-700">{error}</p> : null}

      <PunctualityPanel
        stats={summary?.punctuality}
        showCounts={false}
        splitBar
        className="mb-8"
      />

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium text-ink-700">Assigned Task</h2>
        <StatusGrid cards={receivedCards} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-ink-700">Delegated Tasks</h2>
        <StatusGrid cards={delegatedCards} />
      </section>
    </AppShell>
  );
}
