import type {
  DashboardSummary,
  MemberDetailsSummary,
  Profile,
  RecurringSchedule,
  Task,
  LoginSession,
  TaskAttachment,
} from "@rajshree/shared";

/**
 * Resolve the Express API base URL.
 * - Browser on Vercel: same-origin public rewrite at `/api`
 * - Next.js server (RSC/route handlers): prefer the injected service binding `API_URL`
 * - Local `npm run dev`: `NEXT_PUBLIC_API_URL=http://localhost:4000` (root paths)
 */
function resolveApiBaseUrl(): string {
  if (typeof window === "undefined") {
    const bound = process.env.API_URL?.replace(/\/$/, "");
    if (bound) return bound;
  }

  const configured = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  if (configured) return configured;

  if (typeof window !== "undefined") return "/api";
  return "http://localhost:4000";
}

const API_URL = resolveApiBaseUrl();

const SESSION_KEYS = ["access_token", "refresh_token", "user"] as const;

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type SessionInvalidatedListener = () => void;
let sessionInvalidatedListener: SessionInvalidatedListener | null = null;

/** AuthProvider registers this so auth failures clear in-memory user too. */
export function setSessionInvalidatedListener(
  listener: SessionInvalidatedListener | null
) {
  sessionInvalidatedListener = listener;
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  return sessionStorage;
}

/** Drop any leftover tokens from older builds that used localStorage. */
function purgeLegacyLocalSession() {
  if (typeof window === "undefined") return;
  for (const key of SESSION_KEYS) {
    localStorage.removeItem(key);
  }
}

function getToken(): string | null {
  return storage()?.getItem("access_token") ?? null;
}

function getRefreshToken(): string | null {
  return storage()?.getItem("refresh_token") ?? null;
}

export function setSession(tokens: {
  access_token: string;
  refresh_token?: string;
}) {
  purgeLegacyLocalSession();
  const store = storage();
  if (!store) return;
  store.setItem("access_token", tokens.access_token);
  if (tokens.refresh_token) {
    store.setItem("refresh_token", tokens.refresh_token);
  }
}

export function clearSession() {
  purgeLegacyLocalSession();
  const store = storage();
  if (!store) return;
  for (const key of SESSION_KEYS) {
    store.removeItem(key);
  }
}

function invalidateSession() {
  clearSession();
  sessionInvalidatedListener?.();
}

export function setCachedUser(user: Profile) {
  storage()?.setItem("user", JSON.stringify(user));
}

export function getCachedUser(): Profile | null {
  const raw = storage()?.getItem("user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Profile;
  } catch {
    return null;
  }
}

let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.access_token) return false;
        setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token || refreshToken,
        });
        if (data.user) setCachedUser(data.user as Profile);
        return true;
      } catch {
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }

  return refreshInFlight;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  auth = true,
  didRefresh = false
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(
      0,
      "Connection lost. Check your network and try again.",
      "NETWORK_ERROR"
    );
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (auth && res.status === 401 && !didRefresh) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        return request<T>(path, options, auth, true);
      }
      invalidateSession();
    } else if (auth && res.status === 401) {
      invalidateSession();
    }
    throw new ApiError(res.status, data.error || "Request failed", data.code);
  }
  return data as T;
}

export const api = {
  login(username: string, password: string) {
    return request<{
      access_token: string;
      refresh_token: string;
      user: Profile;
    }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }, false);
  },
  refresh() {
    const refresh_token = getRefreshToken();
    if (!refresh_token) {
      return Promise.reject(new ApiError(401, "No refresh token", "unauthorized"));
    }
    return request<{
      access_token: string;
      refresh_token: string;
      user: Profile;
    }>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token }),
    }, false);
  },
  me() {
    return request<{ user: Profile }>("/auth/me");
  },
  loginSessions(userId?: string) {
    const qs = userId ? `?user_id=${encodeURIComponent(userId)}` : "";
    return request<{ data: LoginSession[] }>(`/time-tracking${qs}`);
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
  overdueTasks() {
    return request<{ data: Task[] }>("/tasks/overdue");
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
  createTask(body: unknown) {
    return request<{ data: Task[] }>("/tasks", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  prepareTaskAttachments(files: { name: string; type: string; size: number }[]) {
    return request<{
      uploads: { path: string; signedUrl: string; contentType: string; fileName: string }[];
    }>("/tasks/attachment-uploads", {
      method: "POST",
      body: JSON.stringify({ files }),
    });
  },
  discardTaskAttachments(paths: string[]) {
    return request<{ ok: boolean }>("/tasks/attachment-uploads/discard", {
      method: "POST",
      body: JSON.stringify({ paths }),
    });
  },
  taskAttachments(ids: string[]) {
    const qs = new URLSearchParams({ ids: ids.join(",") });
    return request<{ data: Record<string, TaskAttachment[]> }>(
      `/tasks/attachments?${qs.toString()}`
    );
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
    return request<{ task: Task }>(`/tasks/${id}/complete`, {
      method: "POST",
      body: JSON.stringify({}),
    });
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
  reopenTask(id: string) {
    return request<{ task: Task }>(`/tasks/${id}/reopen`, { method: "POST" });
  },
  completedTaskCount() {
    return request<{ completed: number; cancelled: number; pendingApproval: number }>(
      "/tasks/completed/count"
    );
  },
  clearCompletedTasks() {
    return request<{ deleted: number; completed: number; cancelled: number }>(
      "/tasks/completed/clear",
      { method: "POST" }
    );
  },
  listStaff() {
    return request<{ data: Profile[] }>("/staff");
  },
  listActiveStaff() {
    return request<{ data: Profile[] }>("/staff/active");
  },
  membersDetailsSummary() {
    return request<{ data: MemberDetailsSummary[] }>("/staff/details-summary");
  },
  createStaff(body: unknown) {
    return request<{
      user: Profile;
      login_instructions: string;
    }>("/staff", { method: "POST", body: JSON.stringify(body) });
  },
  updateStaff(id: string, body: unknown) {
    return request<{ user: Profile }>(`/staff/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  resetStaffPassword(id: string) {
    return request<{ username: string; temporary_password: string }>(
      `/staff/${id}/reset-password`,
      { method: "POST" }
    );
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
  clearCancelledRecurring() {
    return request<{ deleted: number }>("/recurring/cancelled/clear", {
      method: "POST",
    });
  },
  completeRecurring(id: string) {
    return request<{ schedule: RecurringSchedule }>(`/recurring/${id}/complete`, {
      method: "POST",
    });
  },
};
