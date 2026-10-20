-- Rajshree Energy Task Platform — initial schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE user_role AS ENUM ('admin', 'staff');
CREATE TYPE task_lifecycle AS ENUM ('active', 'awaiting_approval', 'completed', 'cancelled');
CREATE TYPE recurrence_frequency AS ENUM (
  'daily',
  'weekly',
  'semi_monthly',
  'thrice_monthly',
  'monthly',
  'quarterly',
  'half_yearly',
  'yearly'
);
CREATE TYPE approval_decision AS ENUM ('approved', 'rejected', 'pending');

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  role user_role NOT NULL DEFAULT 'staff',
  work_days SMALLINT NOT NULL DEFAULT 7 CHECK (work_days IN (6, 7)),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT username_format CHECK (username ~ '^[a-z0-9]+(\.[a-z0-9]+)+[0-9]*$')
);

CREATE TABLE recurring_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  delegator_id UUID NOT NULL REFERENCES profiles (id),
  receiver_id UUID NOT NULL REFERENCES profiles (id),
  approval_required BOOLEAN NOT NULL DEFAULT FALSE,
  frequency recurrence_frequency NOT NULL,
  interval INTEGER NOT NULL DEFAULT 1 CHECK (interval >= 1),
  byweekday INTEGER[] NULL,
  bymonthday INTEGER NULL CHECK (bymonthday IS NULL OR (bymonthday BETWEEN 1 AND 31)),
  time_of_day TIME NOT NULL DEFAULT '17:00',
  start_date DATE NOT NULL,
  end_date DATE NULL,
  next_occurrence_at TIMESTAMPTZ NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_paused BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  delegator_id UUID NOT NULL REFERENCES profiles (id),
  receiver_id UUID NOT NULL REFERENCES profiles (id),
  deadline TIMESTAMPTZ NOT NULL,
  lifecycle task_lifecycle NOT NULL DEFAULT 'active',
  approval_required BOOLEAN NOT NULL DEFAULT FALSE,
  recurring_schedule_id UUID NULL REFERENCES recurring_schedules (id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ NULL,
  cancelled_at TIMESTAMPTZ NULL,
  submitted_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE task_occurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_schedule_id UUID NOT NULL REFERENCES recurring_schedules (id) ON DELETE CASCADE,
  task_id UUID NOT NULL UNIQUE REFERENCES tasks (id) ON DELETE CASCADE,
  occurrence_date DATE NOT NULL,
  deadline TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (recurring_schedule_id, occurrence_date)
);

CREATE TABLE task_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL REFERENCES profiles (id),
  approver_id UUID NULL REFERENCES profiles (id),
  decision approval_decision NOT NULL DEFAULT 'pending',
  comments TEXT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ NULL
);

CREATE TABLE task_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  actor_id UUID NULL REFERENCES profiles (id),
  action TEXT NOT NULL,
  previous_value JSONB NULL,
  new_value JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  related_task_id UUID NULL REFERENCES tasks (id) ON DELETE SET NULL,
  read_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_receiver_deadline ON tasks (receiver_id, deadline);
CREATE INDEX idx_tasks_delegator ON tasks (delegator_id);
CREATE INDEX idx_tasks_lifecycle ON tasks (lifecycle);
CREATE INDEX idx_tasks_deadline ON tasks (deadline);
CREATE INDEX idx_tasks_recurring_schedule ON tasks (recurring_schedule_id);
CREATE INDEX idx_recurring_next ON recurring_schedules (next_occurrence_at)
  WHERE is_active = TRUE AND is_paused = FALSE;
CREATE INDEX idx_notifications_user ON notifications (user_id, created_at DESC);
CREATE INDEX idx_approvals_task ON task_approvals (task_id, submitted_at DESC);
CREATE INDEX idx_activity_task ON task_activity_log (task_id, created_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER recurring_schedules_updated_at
  BEFORE UPDATE ON recurring_schedules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Helper: current user's role
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin' AND is_active = TRUE
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY profiles_select ON profiles FOR SELECT TO authenticated
  USING (is_admin() OR id = auth.uid());

CREATE POLICY profiles_update_self ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY profiles_admin_all ON profiles FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Tasks: participants or admin
CREATE POLICY tasks_select ON tasks FOR SELECT TO authenticated
  USING (
    is_admin()
    OR receiver_id = auth.uid()
    OR delegator_id = auth.uid()
  );

CREATE POLICY tasks_insert ON tasks FOR INSERT TO authenticated
  WITH CHECK (
    is_admin()
    OR delegator_id = auth.uid()
  );

CREATE POLICY tasks_update ON tasks FOR UPDATE TO authenticated
  USING (
    is_admin()
    OR delegator_id = auth.uid()
    OR receiver_id = auth.uid()
  )
  WITH CHECK (
    is_admin()
    OR delegator_id = auth.uid()
    OR receiver_id = auth.uid()
  );

-- Recurring schedules
CREATE POLICY recurring_select ON recurring_schedules FOR SELECT TO authenticated
  USING (
    is_admin()
    OR receiver_id = auth.uid()
    OR delegator_id = auth.uid()
  );

CREATE POLICY recurring_insert ON recurring_schedules FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR delegator_id = auth.uid());

CREATE POLICY recurring_update ON recurring_schedules FOR UPDATE TO authenticated
  USING (is_admin() OR delegator_id = auth.uid())
  WITH CHECK (is_admin() OR delegator_id = auth.uid());

-- Occurrences follow parent schedule visibility
CREATE POLICY occurrences_select ON task_occurrences FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recurring_schedules rs
      WHERE rs.id = recurring_schedule_id
        AND (is_admin() OR rs.receiver_id = auth.uid() OR rs.delegator_id = auth.uid())
    )
  );

CREATE POLICY approvals_select ON task_approvals FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_id
        AND (is_admin() OR t.receiver_id = auth.uid() OR t.delegator_id = auth.uid())
    )
  );

CREATE POLICY activity_select ON task_activity_log FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_id
        AND (is_admin() OR t.receiver_id = auth.uid() OR t.delegator_id = auth.uid())
    )
  );

CREATE POLICY notifications_select ON notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin());

CREATE POLICY notifications_update ON notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Auto-create profile stub is not used; backend creates profiles with service role.
