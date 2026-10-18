-- Remove task_type; one-time vs recurring is implied by recurring_schedule_id.

ALTER TABLE tasks DROP COLUMN IF EXISTS task_type;
DROP TYPE IF EXISTS task_type;

NOTIFY pgrst, 'reload schema';
