-- Sign-in times for the admin Time Tracking page.

CREATE TABLE IF NOT EXISTS login_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  logged_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE login_sessions DROP COLUMN IF EXISTS logged_out_at;

CREATE INDEX IF NOT EXISTS idx_login_sessions_user_time
  ON login_sessions (user_id, logged_in_at DESC);

CREATE INDEX IF NOT EXISTS idx_login_sessions_time
  ON login_sessions (logged_in_at DESC);

ALTER TABLE login_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS login_sessions_admin_select ON login_sessions;
CREATE POLICY login_sessions_admin_select ON login_sessions
  FOR SELECT TO authenticated
  USING (public.is_admin());

NOTIFY pgrst, 'reload schema';
