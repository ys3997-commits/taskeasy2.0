import type {
  DashboardSummary,
  Notification,
  Profile,
  RecurringSchedule,
  Task,
  TaskActivityLog,
  TaskApproval,
} from "@rajshree/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

export function setSession(tokens: {
  access_token: string;
  refresh_token?: string;
}) {
  localStorage.setItem("access_token", tokens.access_token);
  if (tokens.refresh_token) {
    localStorage.setItem("refresh_token", tokens.refresh_token);
  }
}

export function clearSession() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("user");
}

export function setCachedUser(user: Profile) {
  localStorage.setItem("user", JSON.stringify(user));
}

export function getCachedUser(): Profile | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Profile;
  } catch {
    return null;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  auth = true
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data.error || "Request failed", data.code);
  }
  return data as T;
}

export const api = {
  login(identifier: string, password: string) {
    return request<{
      access_token: string;
      refresh_token: string;
      user: Profile;
    }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password }),
    }, false);
  },
  me() {
    return request<{ user: Profile }>("/auth/me");
  },
  changePassword(payload: { currentPassword?: string; newPassword: string }) {
    return request<{ ok: boolean }>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  dashboardSummary() {
    return request<DashboardSummary>("/tasks/dashboard/summary");
  },
  listTasks(params: Record<string, string | number | undefined>) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== "" && v !== "all") qs.set(k, String(v));
    });
    return request<{
      data: Task[];
      page: number;
      pageSize: number;
      total: number;
    }>(`/tasks?${qs.toString()}`);
  },
  getTask(id: string) {
    return request<{
      task: Task;
      approvals: TaskApproval[];
      activity: TaskActivityLog[];
    }>(`/tasks/${id}`);
  },
  createTask(body: unknown) {
    return request<{ data: Task[] }>("/tasks", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  updateTask(id: string, body: unknown) {
    return request<{ task: Task }>(`/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  cancelTask(id: string) {
    return request<{ task: Task }>(`/tasks/${id}/cancel`, { method: "POST" });
  },
  completeTask(id: string) {
    return request<{ task: Task }>(`/tasks/${id}/complete`, { method: "POST" });
  },
  approveTask(id: string, comments?: string) {
    return request<{ task: Task }>(`/tasks/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ comments }),
    });
  },
  rejectTask(id: string, comments: string) {
    return request<{ task: Task }>(`/tasks/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ comments }),
    });
  },
  listStaff() {
    return request<{ data: Profile[] }>("/staff");
  },
  listActiveStaff() {
    return request<{ data: Profile[] }>("/staff/active");
  },
  createStaff(body: unknown) {
    return request<{
      user: Profile;
      temporary_password: string;
      login_instructions: string;
    }>("/staff", { method: "POST", body: JSON.stringify(body) });
  },
  updateStaff(id: string, body: unknown) {
    return request<{ user: Profile }>(`/staff/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  staffTasks(id: string) {
    return request<{ data: Task[] }>(`/staff/${id}/tasks`);
  },
  listRecurring() {
    return request<{ data: RecurringSchedule[] }>("/recurring");
  },
  getRecurring(id: string) {
    return request<{ schedule: RecurringSchedule; occurrences: unknown[] }>(
      `/recurring/${id}`
    );
  },
  createRecurring(body: unknown) {
    return request<{ schedule: RecurringSchedule }>("/recurring", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  updateRecurring(id: string, body: unknown) {
    return request<{ schedule: RecurringSchedule }>(`/recurring/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  pauseRecurring(id: string) {
    return request<{ schedule: RecurringSchedule }>(`/recurring/${id}/pause`, {
      method: "POST",
    });
  },
  resumeRecurring(id: string) {
    return request<{ schedule: RecurringSchedule }>(`/recurring/${id}/resume`, {
      method: "POST",
    });
  },
  cancelRecurring(id: string) {
    return request<{ schedule: RecurringSchedule }>(`/recurring/${id}/cancel`, {
      method: "POST",
    });
  },
  notifications() {
    return request<{ data: Notification[] }>("/notifications");
  },
  markNotificationRead(id: string) {
    return request<{ notification: Notification }>(`/notifications/${id}/read`, {
      method: "POST",
    });
  },
  markAllNotificationsRead() {
    return request<{ ok: boolean }>("/notifications/read-all", { method: "POST" });
  },
};
