"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Task } from "@rajshree/shared";
import { AppShell } from "@/components/app-shell";
import { TaskTable } from "@/components/task-table";
import { Button } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { computeDisplayStatus } from "@rajshree/shared";

export default function StaffTasksPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && user && user.role !== "admin") router.replace("/dashboard");
  }, [user, loading, router]);

  useEffect(() => {
    if (user?.role !== "admin") return;
    api
      .staffTasks(params.id)
      .then((res) =>
        setTasks(
          res.data.map((t) => ({
            ...t,
            display_status: computeDisplayStatus(t.lifecycle, t.deadline),
          }))
        )
      )
      .catch((e) => setError(e.message || "Failed to load tasks"));
  }, [user, params.id]);

  if (!user || user.role !== "admin") return null;

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold text-ink-900">
          Staff member tasks
        </h1>
        <Button variant="secondary" onClick={() => router.push("/staff")}>
          Back to staff
        </Button>
      </div>
      {error ? <p className="mb-3 text-sm text-red-700">{error}</p> : null}
      <TaskTable tasks={tasks} />
    </AppShell>
  );
}
