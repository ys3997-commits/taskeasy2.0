"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Notification } from "@rajshree/shared";
import { AppShell } from "@/components/app-shell";
import { Button, EmptyState } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [error, setError] = useState("");

  async function load() {
    const res = await api.notifications();
    setItems(res.data);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message || "Failed to load notifications"));
  }, []);

  return (
    <AppShell>
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink-900">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Assignments, deadlines, and approval updates.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={async () => {
            await api.markAllNotificationsRead();
            await load();
          }}
        >
          Mark all read
        </Button>
      </div>

      {error ? <p className="mb-3 text-sm text-red-700">{error}</p> : null}

      {!items.length ? (
        <EmptyState title="No notifications yet" />
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li
              key={n.id}
              className={`rounded-lg border p-4 ${
                n.read_at
                  ? "border-ink-100 bg-white"
                  : "border-brand-100 bg-brand-50/40"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-ink-900">{n.title}</p>
                  <p className="mt-1 text-sm text-ink-600">{n.body}</p>
                  <p className="mt-2 text-xs text-ink-500">
                    {formatDateTime(n.created_at)}
                  </p>
                </div>
                <div className="flex gap-2">
                  {n.related_task_id ? (
                    <Link href={`/tasks/${n.related_task_id}`}>
                      <Button variant="secondary">Open task</Button>
                    </Link>
                  ) : null}
                  {!n.read_at ? (
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        await api.markNotificationRead(n.id);
                        await load();
                      }}
                    >
                      Mark read
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
