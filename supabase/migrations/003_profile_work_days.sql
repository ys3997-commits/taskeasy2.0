-- How many days a week a team member works.
-- 6 means Monday–Saturday (no recurring task on Sunday).
-- 7 means every day, including Sunday.
-- Existing people stay on 7 days until changed on the Team member page.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS work_days SMALLINT NOT NULL DEFAULT 7;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_work_days_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_work_days_check CHECK (work_days IN (6, 7));
