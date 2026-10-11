"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DashboardSummary } from "@rajshree/shared";
import { AppShell } from "@/components/app-shell";
import { Button, Card } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { fullName } from "@/lib/utils";

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

  const cards = [
    { key: "pending", label: "Pending", value: summary?.pending ?? "—", href: "/tasks/received?status=pending" },
    { key: "completed", label: "Completed", value: summary?.completed ?? "—", href: "/tasks/received?status=completed" },
    { key: "overdue", label: "Overdue", value: summary?.overdue ?? "—", href: "/tasks/received?status=overdue" },
    { key: "sent_for_approval", label: "Sent for Approval", value: summary?.sent_for_approval ?? "—", href: "/tasks/received?status=sent_for_approval" },
  ];

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink-900">Dashboard</h1>
          <p className="mt-1 text-sm text-ink-500">
            Welcome back{user ? `, ${fullName(user)}` : ""}.{" "}
            {user?.role === "admin"
              ? "Company-wide task overview."
              : "Your assigned task overview."}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/tasks/new">
            <Button>Create task</Button>
          </Link>
          <Link href="/recurring/new">
            <Button variant="secondary">New recurring</Button>
          </Link>
        </div>
      </div>

      {error ? <p className="mb-4 text-sm text-red-700">{error}</p> : null}

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
    </AppShell>
  );
}
