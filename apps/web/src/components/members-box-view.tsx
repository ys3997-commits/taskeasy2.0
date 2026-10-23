"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { RecurringSchedule, Task } from "@rajshree/shared";
import { TaskTable } from "@/components/task-table";
import { Alert, Button, EmptyState } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { fullName } from "@/lib/utils";

const STATUS_LABELS: Record<string, { assigned: string; delegated: string }> = {
  pending: { assigned: "Pending", delegated: "Pending" },
  overdue: { assigned: "Overdue", delegated: "Overdue" },
  sent_for_approval: {
    assigned: "Sent for Approval",
    delegated: "Received for Approval",
  },
};

export function MembersBoxView({
  side,
  status,
  memberId,
  memberName,
}: {
  side: "assigned" | "delegated";
  status: "pending" | "overdue" | "sent_for_approval";
  memberId?: string;
  memberName?: string;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [schedules, setSchedules] = useState<RecurringSchedule[]>([]);
  const [resolvedName, setResolvedName] = useState(memberName || "");
  const [error, setError] = useState("");
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading && user && user.role !== "admin") router.replace("/dashboard");
  }, [user, loading, router]);

  useEffect(() => {
    if (user?.role !== "admin") return;
    setLoadingData(true);
    setError("");
    api
      .boxTasks({
        side,
        status,
        member_id: memberId,
      })
      .then((res) => {
        setTasks(res.tasks);
        setSchedules(res.schedules);
        if (res.member) setResolvedName(fullName(res.member));
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Failed to load tasks")
      )
      .finally(() => setLoadingData(false));
  }, [user, side, status, memberId]);

  if (!user || user.role !== "admin") return null;

  const statusLabel = STATUS_LABELS[status][side];
  const viewTitle = side === "assigned" ? "Assigned Tasks" : "Delegated Tasks";
  const title = memberId ? resolvedName || "Member" : "Rajshree Energy";

  return (
    <>
      <div className="mb-6">
        <Button
          variant="ghost"
          className="-ml-2 mb-2 px-2"
          onClick={() => router.push("/members-details")}
        >
          ← Back to Members Details
        </Button>
        <h1 className="font-display text-3xl font-semibold text-ink-900">{title}</h1>
        <p className="mt-1 text-sm text-ink-500">
          {viewTitle} · {statusLabel}
          {memberId ? "" : " · All members"}
        </p>
      </div>

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {loadingData ? (
        <p className="text-sm text-ink-500">Loading tasks…</p>
      ) : tasks.length === 0 && schedules.length === 0 ? (
        <EmptyState
          title={`No ${statusLabel.toLowerCase()} tasks`}
          description={
            memberId
              ? `${title} has no ${viewTitle.toLowerCase()} in this status.`
              : `No members have ${viewTitle.toLowerCase()} in this status.`
          }
        />
      ) : (
        <TaskTable
          tasks={tasks}
          schedules={schedules}
          variant={side === "assigned" ? "assigned" : "delegated"}
          showBothPeople={!memberId}
        />
      )}
    </>
  );
}
