"use client";

import { TaskListPage } from "../_components/task-list-page";

export default function DelegatedTasksPage() {
  return (
    <TaskListPage
      title="My Delegated Tasks"
      description="Tasks you assigned to others."
      view="delegated"
    />
  );
}
