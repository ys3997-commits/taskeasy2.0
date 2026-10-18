"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { TaskListPage } from "../_components/task-list-page";

function ReceivedInner() {
  const searchParams = useSearchParams();
  return (
    <TaskListPage
      title="Assigned Task"
      description="Tasks assigned to you."
      view="received"
      initialStatus={searchParams.get("status") || "pending"}
    />
  );
}

export default function ReceivedTasksPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-ink-500">Loading…</div>}>
      <ReceivedInner />
    </Suspense>
  );
}
