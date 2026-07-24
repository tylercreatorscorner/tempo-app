-- Scheduled Who's Cooking posts can choose their board format. NULL =
-- 'highlights' (current behavior), so existing rows and the deployed runner
-- are untouched; only whos-cooking schedules ever set it.
ALTER TABLE report_schedules ADD COLUMN IF NOT EXISTS format text;
