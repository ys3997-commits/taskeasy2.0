-- Keep on-time / late totals after Clear Finished Tasks deletes completed rows.
-- The dashboard reads this table and adds it to tasks that are still stored.

CREATE TABLE IF NOT EXISTS punctuality_archive (
  receiver_id UUID PRIMARY KEY REFERENCES profiles (id) ON DELETE CASCADE,
  on_time INTEGER NOT NULL DEFAULT 0 CHECK (on_time >= 0),
  late INTEGER NOT NULL DEFAULT 0 CHECK (late >= 0)
);

CREATE OR REPLACE FUNCTION public.archive_task_punctuality()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.lifecycle = 'completed' AND OLD.completed_at IS NOT NULL THEN
    INSERT INTO public.punctuality_archive (receiver_id, on_time, late)
    VALUES (
      OLD.receiver_id,
      CASE WHEN OLD.completed_at <= OLD.deadline THEN 1 ELSE 0 END,
      CASE WHEN OLD.completed_at > OLD.deadline THEN 1 ELSE 0 END
    )
    ON CONFLICT (receiver_id) DO UPDATE
      SET
        on_time = public.punctuality_archive.on_time + EXCLUDED.on_time,
        late = public.punctuality_archive.late + EXCLUDED.late;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS tasks_archive_punctuality ON tasks;
CREATE TRIGGER tasks_archive_punctuality
  BEFORE DELETE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.archive_task_punctuality();

ALTER TABLE punctuality_archive ENABLE ROW LEVEL SECURITY;

-- Team members can read only their own sign-in history. Admins already can.
DROP POLICY IF EXISTS login_sessions_self_select ON login_sessions;
CREATE POLICY login_sessions_self_select ON login_sessions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

NOTIFY pgrst, 'reload schema';
