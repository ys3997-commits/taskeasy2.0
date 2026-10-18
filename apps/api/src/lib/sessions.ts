import { getAdminClient } from "./supabase";

export async function recordLogin(userId: string): Promise<void> {
  const admin = getAdminClient();
  const { error } = await admin.from("login_sessions").insert({ user_id: userId });
  if (error) console.error("Failed to record login", error.message);
}
