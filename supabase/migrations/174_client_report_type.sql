-- 174 · Client reports get a TYPE.
--
-- Three templates, and they are genuinely three rather than one report with a
-- different window:
--
--   performance  the standing report — what happened in this period, absolute
--                figures with period-over-period deltas as annotations
--   weekly       week over week — the CHANGE is the subject: who moved, who
--                started, who stopped
--   monthly      month in review — what the money bought: contracted posts
--                against delivered, net-new GMV, budget against actual
--
-- monthly is NOT "comparison with a 30-day window". Its content is
-- accountability WITHIN the month, not movement between months, which is why it
-- does not share a template with weekly.
--
-- Defaults to 'performance' so every link already issued keeps rendering
-- exactly as it does now. Additive, no backfill.
alter table public.client_reports
  add column if not exists report_type text not null default 'performance';

alter table public.client_reports
  drop constraint if exists client_reports_report_type_check;
alter table public.client_reports
  add constraint client_reports_report_type_check
  check (report_type in ('performance', 'weekly', 'monthly'));

comment on column public.client_reports.report_type is
  'Which template renders this link: performance (absolute, any window), weekly (week-over-week, the change is the subject), monthly (month in review, contracted vs delivered plus net-new GMV). Defaults to performance so existing links are unaffected.';

create index if not exists idx_client_reports_type
  on public.client_reports (report_type, created_at desc);
