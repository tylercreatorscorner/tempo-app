-- "What we're doing next", separate from the account-lead notes.
--
-- WHY A SECOND COLUMN RATHER THAN LONGER NOTES. `notes` is commentary ABOUT
-- the period that just closed and is drafted for the operator to edit. This is
-- a forward commitment, and it has to survive into the NEXT report so the two
-- can be read against each other. Merged into notes, a commitment made in one
-- week is indistinguishable from a description of that week, and nothing can
-- ever check whether it happened.
--
-- Nullable and rendered as absence: a report with nothing to promise says
-- nothing rather than printing an empty heading.
alter table public.client_reports
  add column if not exists plan text;

comment on column public.client_reports.plan is
  'Forward-looking "what we are doing next", hand-written by the account lead. Distinct from notes, which describe the period just closed. Preserved across refresh like notes.';
