-- Thrice monthly: three due dates per month on start day, +10, +20.
-- If +20 does not exist that month, that slot falls on the 1st of the next month.

ALTER TYPE recurrence_frequency ADD VALUE IF NOT EXISTS 'thrice_monthly';
