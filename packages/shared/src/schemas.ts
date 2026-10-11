import { z } from "zod";

export const loginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).optional(),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export const createStaffSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  email: z.string().email(),
  role: z.enum(["admin", "staff"]).default("staff"),
});

export const updateStaffSchema = z.object({
  first_name: z.string().min(1).max(100).optional(),
  last_name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  is_active: z.boolean().optional(),
  role: z.enum(["admin", "staff"]).optional(),
});

export const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  receiver_ids: z.array(z.string().uuid()).min(1),
  deadline: z.string().min(1),
  approval_required: z.boolean().default(false),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).optional(),
  receiver_id: z.string().uuid().optional(),
  deadline: z.string().min(1).optional(),
  approval_required: z.boolean().optional(),
});

export const approvalDecisionSchema = z.object({
  comments: z.string().max(2000).optional(),
});

export const rejectTaskSchema = z.object({
  comments: z.string().min(1).max(2000),
});

export const createRecurringSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  receiver_id: z.string().uuid(),
  approval_required: z.boolean().default(false),
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
  interval: z.number().int().min(1).default(1),
  byweekday: z.array(z.number().int().min(0).max(6)).nullable().optional(),
  bymonthday: z.number().int().min(1).max(31).nullable().optional(),
  time_of_day: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/)
    .default("17:00"),
  start_date: z.string().min(1),
  end_date: z.string().nullable().optional(),
});

export const updateRecurringSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).optional(),
  receiver_id: z.string().uuid().optional(),
  approval_required: z.boolean().optional(),
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]).optional(),
  interval: z.number().int().min(1).optional(),
  byweekday: z.array(z.number().int().min(0).max(6)).nullable().optional(),
  bymonthday: z.number().int().min(1).max(31).nullable().optional(),
  time_of_day: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/)
    .optional(),
  end_date: z.string().nullable().optional(),
  is_paused: z.boolean().optional(),
  scope: z.enum(["this", "future"]).optional(),
  occurrence_task_id: z.string().uuid().optional(),
});

export const taskListQuerySchema = z.object({
  view: z.enum(["received", "delegated", "all", "approvals"]).optional(),
  status: z
    .enum(["pending", "completed", "overdue", "sent_for_approval", "cancelled", "all"])
    .optional(),
  task_type: z.enum(["one_time", "recurring_occurrence", "all"]).optional(),
  frequency: z.enum(["daily", "weekly", "monthly", "yearly", "all"]).optional(),
  delegator_id: z.string().uuid().optional(),
  receiver_id: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  q: z.string().optional(),
  sort: z.enum(["deadline", "created_at", "status"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
