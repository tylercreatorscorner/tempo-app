-- New creators signed, for the client report.
--
-- Brands ask "are you still growing my roster", and until now the report could
-- not answer it. managed_creators.cc_start_date carries the answer and is
-- fully populated (1,935 of 1,935 rows) and agrees with joined_at on
-- effectively every row.
--
-- ⚠️ THREE THINGS MAKE THIS WRONG IF IGNORED.
--
-- 1. 🚨 EVERY BRAND'S FIRST MONTH IS A BULK LOAD, NOT A SIGNING SPREE. Dr. Dent
--    has 85 creators stamped 2026-06-25, the day CC started with them; the
--    whole opening roster shares one date. Reporting that as "85 signed in
--    June" claims a month of recruiting that never happened. `isFirstMonth`
--    marks it and the renderer must suppress the figure rather than print it.
--
-- 2. 🚨 COUNT EVERYONE SIGNED IN THE MONTH, INCLUDING THOSE WHO HAVE SINCE
--    LEFT. Filtering on archived_at is null would shrink every past month as
--    people leave, so last month's number would change every time you looked
--    at it. History has to be fixed. This is the same mutable-history trap that
--    cost $79.8k of June managed GMV elsewhere in this codebase.
--
-- 3. ⚠️ Signing is per BRAND, because managed_creators is per brand. One person
--    signed to three brands is three signings, which is correct: it is three
--    relationships CC built.
--
-- Grain is the calendar MONTH containing p_end, plus the month before it for
-- comparison. Deliberately NOT the report window: Dr. Dent's August signings
-- landed on 8 separate days (2, 7, 1, 2, 1, 7, 41, 2), so a weekly count reads
-- zero most weeks and makes a healthy pipeline look dead.

create or replace function public.get_brand_report_signings(
  p_roster_slugs text[],
  p_end          date
)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with bounds as (
    select date_trunc('month', p_end)::date                     as m_start,
           (date_trunc('month', p_end) - interval '1 month')::date as p_start,
           (date_trunc('month', p_end) - interval '1 day')::date   as p_end_of_prior
  ),
  scoped as (
    -- No archived filter, on purpose. See note 2.
    select mc.cc_start_date, coalesce(mc.retainer, 0) as retainer
    from public.managed_creators mc
    where (p_roster_slugs is null or mc.brand = any(p_roster_slugs))
      and mc.cc_start_date is not null
  ),
  first_month as (
    select date_trunc('month', min(cc_start_date))::date as m from scoped
  )
  select jsonb_build_object(
    'monthLabel',      to_char((select m_start from bounds), 'Mon YYYY'),
    'priorMonthLabel', to_char((select p_start from bounds), 'Mon YYYY'),
    'signed',          (select count(*) from scoped, bounds
                          where cc_start_date >= m_start and cc_start_date <= p_end),
    'signedRetained',  (select count(*) from scoped, bounds
                          where cc_start_date >= m_start and cc_start_date <= p_end
                            and retainer > 0),
    'signedPrior',     (select count(*) from scoped, bounds
                          where cc_start_date >= p_start and cc_start_date <= p_end_of_prior),
    -- The opening bulk load. Renderer suppresses the figure when true.
    'isFirstMonth',    (select (select m from first_month) = (select m_start from bounds)),
    -- Whether a prior-month comparison is meaningful: it is not if the prior
    -- month IS the bulk load, or predates the relationship entirely.
    'priorComparable', (select (select m from first_month) < (select p_start from bounds))
  );
$function$;

comment on function public.get_brand_report_signings(text[], date) is
  'New creators signed per brand for a calendar month + the prior month. Counts everyone signed then, including those since archived, so history cannot shift. isFirstMonth marks the brand''s opening bulk load, which is NOT recruiting.';

revoke all on function public.get_brand_report_signings(text[], date) from public;
grant execute on function public.get_brand_report_signings(text[], date) to authenticated, service_role;
