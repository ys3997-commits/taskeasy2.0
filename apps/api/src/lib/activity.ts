import { getAdminClient } from "./supabase";

export async function logActivity(params: {
  taskId: string;
  actorId: string | null;
  action: string;
  previousValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
}): Promise<void> {
  const admin = getAdminClient();
  await admin.from("task_activity_log").insert({
    task_id: params.taskId,
    actor_id: params.actorId,
    action: params.action,
    previous_value: params.previousValue ?? null,
    new_value: params.newValue ?? null,
  });
}

/** Task notifications are disabled — keep call sites, do not write rows. */
export async function notifyUser(_params: {
  userId: string;
  type: string;
  title: string;
  body: string;
  relatedTaskId?: string | null;
}): Promise<void> {
  return;
}

/** Delete every notification row (batched). */
export async function clearAllNotifications(): Promise<number> {
  const admin = getAdminClient();
  let deleted = 0;
  for (let batch = 0; batch < 100; batch += 1) {
    const { data, error } = await admin
      .from("notifications")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000")
      .select("id");
    if (error) throw error;
    const rows = data || [];
    if (!rows.length) break;
    deleted += rows.length;
  }
  return deleted;
}
