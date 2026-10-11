"use client";

import { TaskListPage } from "../tasks/_components/task-list-page";

export default function ApprovalsPage() {
  return (
    <TaskListPage
      title="Approvals"
      description="Tasks waiting for your approval decision."
      view="approvals"
    />
  );
}
