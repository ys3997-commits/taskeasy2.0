-- Add frequencies used by the new recurring schedule form.
-- Safe to run once on a database that already applied 001_initial_schema.sql.

ALTER TYPE recurrence_frequency ADD VALUE IF NOT EXISTS 'semi_monthly';
ALTER TYPE recurrence_frequency ADD VALUE IF NOT EXISTS 'quarterly';
ALTER TYPE recurrence_frequency ADD VALUE IF NOT EXISTS 'half_yearly';
