"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DashboardSummary, TaskStatusCounts } from "@rajshree/shared";
import { AppShell } from "@/components/app-shell";
import { Button, Card } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { fullName } from "@/lib/utils";

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
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <Link key={card.key} href={card.href}>
          <Card className="transition hover:border-brand-500">
            <p className="text-sm text-ink-500">{card.label}</p>
            <p className="mt-2 font-display text-3xl font-semibold text-ink-900">
              {card.value}
            </p>
          </Card>
        </Link>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .dashboardSummary()
      .then(setSummary)
      .catch((e) => setError(e.message || "Failed to load summary"));
  }, []);

  const receivedCards = statusCards(summary?.received, "/tasks/received");
  const delegatedCards = statusCards(
    summary?.delegated,
    "/tasks/delegated",
    DELEGATED_STATUS_CARDS
  );

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink-900">Dashboard</h1>
          <p className="mt-1 text-sm text-ink-500">
            Welcome back{user ? `, ${fullName(user)}` : ""}.{" "}
            Your assigned and delegated task overview.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/tasks/new">
            <Button>One-Time Task</Button>
          </Link>
          {user?.role === "admin" ? (
            <Link href="/recurring/new">
              <Button>Recurring Task</Button>
            </Link>
          ) : null}
        </div>
      </div>

      {error ? <p className="mb-4 text-sm text-red-700">{error}</p> : null}

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
