export type UserRole = "admin" | "staff";

export type TaskLifecycle =
  | "active"
  | "awaiting_approval"
  | "completed"
  | "cancelled";

export type DisplayStatus =
  | "pending"
  | "completed"
  | "overdue"
  | "sent_for_approval"
  | "cancelled";

export type Frequency =
  | "daily"
  | "weekly"
  | "semi_monthly"
  | "thrice_monthly"
  | "monthly"
  | "quarterly"
  | "half_yearly"
  | "yearly";

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  semi_monthly: "Semi-monthly",
  thrice_monthly: "Thrice Monthly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  half_yearly: "Half-yearly",
  yearly: "Yearly",
};

export type ApprovalDecision = "approved" | "rejected" | "pending";

export interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
  email: string;
  role: UserRole;
  work_days: 6 | 7;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  delegator_id: string;
  receiver_id: string;
  deadline: string;
  lifecycle: TaskLifecycle;
  approval_required: boolean;
  recurring_schedule_id: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  display_status?: DisplayStatus;
  delegator?: Pick<Profile, "id" | "first_name" | "last_name" | "username">;
  receiver?: Pick<Profile, "id" | "first_name" | "last_name" | "username">;
  recurring_schedules?:
    | { frequency: Frequency; start_date?: string }
    | { frequency: Frequency; start_date?: string }[]
    | null;
  task_occurrences?:
    | { occurrence_date: string }
    | { occurrence_date: string }[]
    | null;
}

export interface RecurringSchedule {
  id: string;
  title: string;
  description: string;
  delegator_id: string;
  receiver_id: string;
  approval_required: boolean;
  frequency: Frequency;
  interval: number;
  byweekday: number[] | null;
  bymonthday: number | null;
  time_of_day: string;
  start_date: string;
  end_date: string | null;
  next_occurrence_at: string | null;
  is_active: boolean;
  is_paused: boolean;
  /** True when the occurrence at next_occurrence_at was already finished. */
  current_occurrence_completed?: boolean;
  created_at: string;
  updated_at: string;
  receiver?: Pick<Profile, "id" | "first_name" | "last_name" | "username"> | null;
  delegator?: Pick<Profile, "id" | "first_name" | "last_name" | "username"> | null;
}

export interface TaskAttachment {
  id: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  url: string;
}

export interface TaskApproval {
  id: string;
  task_id: string;
  submitted_by: string;
  approver_id: string | null;
  decision: ApprovalDecision;
  comments: string | null;
  submitted_at: string;
  decided_at: string | null;
}

export interface TaskActivityLog {
  id: string;
  task_id: string;
  actor_id: string | null;
  action: string;
  previous_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
}

export interface LoginSession {
  id: string;
  user_id: string;
  logged_in_at: string;
  user?: Pick<Profile, "id" | "first_name" | "last_name" | "username"> | null;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  related_task_id: string | null;
  read_at: string | null;
  created_at: string;
}

export interface TaskStatusCounts {
  pending: number;
  completed: number;
  overdue: number;
  sent_for_approval: number;
}

/** Completion timing for tasks the user finished as receiver. */
export interface PunctualityStats {
  completed: number;
  on_time: number;
  late: number;
  on_time_percent: number;
  late_percent: number;
}

export interface DashboardSummary {
  received: TaskStatusCounts;
  delegated: TaskStatusCounts;
  punctuality: PunctualityStats;
}

export interface MemberDetailsSummary {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
  role: UserRole;
  is_active: boolean;
  work_days: 6 | 7;
  received: TaskStatusCounts;
  delegated: TaskStatusCounts;
  punctuality: PunctualityStats;
}

export interface PaginatedResult<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}
