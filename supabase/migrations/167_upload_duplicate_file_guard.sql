-- 167 · Third upload guard: is this file a COPY of another brand's file?
--
-- See the function comment for the full rationale. Short version: on
-- 2026-08-09 dr_dent's creator file was loaded into serene_herbs as well. All
-- 16,834 rows byte-identical. Both existing brand-match rules scored 100%,
-- because the two brands share their creator pool almost entirely, so neither
-- could see it. serene_herbs' own day was overwritten, store GMV read $54,490
-- against a typical $17,308, and a weekly client report went out 22%
-- overstated.
--
-- Two brands can share a creator. They cannot share that creator's exact daily
-- revenue, and they certainly cannot share several hundred of them.
--
-- Replayed against real files:
--     serene_herbs 2026-08-09 (the bad one)   100% match vs dr_dent
--     dr_dent      2026-08-09 (rightful)      100% match vs serene_herbs
--     catakor      2026-08-21 (legit)           0%
--     jiyu         2026-08-21 (legit)           0%
--     serene_herbs 2026-08-10 (legit)           0%
--
-- 0% against 100%, with nothing in between to tune around.
--
-- ⚠️ Symmetric by nature: it cannot tell the original from the copy, only that
-- a duplicate exists. Whichever file is uploaded SECOND gets refused, which is
-- the right way round.
create or replace function public.check_upload_duplicate_of_other_brand(
  p_brand   text,
  p_date    date,
  p_handles text[],
  p_gmvs    numeric[]
)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
set statement_timeout to '20s'
as $function$
  with incoming as (
    select lower(btrim(regexp_replace(h, '^@', ''))) as handle,
           g as gmv
    from unnest(p_handles, p_gmvs) as t(h, g)
    -- ⚠️ gmv > 0 ONLY. Zero rows match across brands constantly (the export
    -- lists every creator, most of whom sold nothing), so including them would
    -- flag every legitimate upload.
    where g is not null and g > 0
  ),
  n as (select count(*)::int as sampled from incoming),
  matches as (
    select cp.brand, count(*)::int as exact_rows
    from incoming i
    join public.creator_performance cp
      on cp.period_type = 'daily'
     and cp.report_date = p_date
     and cp.brand <> p_brand
     and lower(btrim(regexp_replace(cp.creator_name, '^@', ''))) = i.handle
     and cp.gmv = i.gmv          -- exact, to the cent
    group by cp.brand
    order by 2 desc
    limit 1
  )
  select jsonb_build_object(
    'sampled',        (select sampled from n),
    'bestOtherBrand', (select brand from matches),
    'exactRows',      coalesce((select exact_rows from matches), 0),
    'exactMatchPct',  case when (select sampled from n) > 0
                        then round(100.0 * coalesce((select exact_rows from matches), 0)
                                   / (select sampled from n), 1)
                        else 0 end
  );
$function$;

revoke execute on function public.check_upload_duplicate_of_other_brand(text, date, text[], numeric[]) from public;
revoke execute on function public.check_upload_duplicate_of_other_brand(text, date, text[], numeric[]) from anon;
grant  execute on function public.check_upload_duplicate_of_other_brand(text, date, text[], numeric[]) to authenticated, service_role;

comment on function public.check_upload_duplicate_of_other_brand(text, date, text[], numeric[]) is
  'Detects a file loaded under two brands for the same day by matching creator GMV EXACTLY. Catches the '
  'case the brand-match rules cannot: two brands that share a creator pool, where a copied file scores '
  '100% on both. Compares gmv > 0 rows only.';
