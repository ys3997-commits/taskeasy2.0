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

export async function notifyUser(params: {
  userId: string;
  type: string;
  title: string;
  body: string;
  relatedTaskId?: string | null;
}): Promise<void> {
  const admin = getAdminClient();
  await admin.from("notifications").insert({
    user_id: params.userId,
    type: params.type,
    title: params.title,
    body: params.body,
    related_task_id: params.relatedTaskId ?? null,
  });
}
