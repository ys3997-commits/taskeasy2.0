"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { TaskListPage } from "../_components/task-list-page";

export default function AllTasksPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user && user.role !== "admin") {
      router.replace("/dashboard");
    }
  }, [user, loading, router]);

  if (!user || user.role !== "admin") return null;

  return (
    <TaskListPage
      title="All Tasks"
      description="Company-wide task list."
      view="all"
      showSearch
      showPeople
    />
  );
}
