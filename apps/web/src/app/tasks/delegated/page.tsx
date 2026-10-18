"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { TaskListPage } from "../_components/task-list-page";

function DelegatedInner() {
  const searchParams = useSearchParams();
  return (
    <TaskListPage
      title="Delegated Tasks"
      description="Tasks you assigned to others."
      view="delegated"
      initialStatus={searchParams.get("status") || "pending"}
    />
  );
}

export default function DelegatedTasksPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-ink-500">Loading…</div>}>
      <DelegatedInner />
    </Suspense>
  );
}
