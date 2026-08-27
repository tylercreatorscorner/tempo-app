-- 166 · Client report aggregate: count creators who SOLD, not rows in a file.
--
-- Every creator COUNT in get_brand_client_report_agg was a bare COUNT(*) over
-- the `cur` / `prior` CTEs, which group creator_performance with NO gmv filter.
-- TikTok's creator export emits a row per creator per day whether or not they
-- sold anything, so these counted creators who merely APPEAR in the file.
--
-- Measured on jiyu 2026-08-17..23, ONE WEEK:
--
--                                  before        after
--   totals.active_creators         24,000+       493
--   managed.creators                  247          51
--   new_vs_returning.new_count     10,039          38
--   returning_count                16,535         455
--
-- 10,039 "new creators" who between them produced $1,607 of GMV. The PDF
-- printed that as "10,039 creators (2036% of those who sold)" and an
-- "AVG GMV / CREATOR" of $5 against a true $257.76.
--
-- The GMV and order sums were always correct — a $0 row adds nothing to a sum,
-- which is exactly why this hid. Only the counts were wrong, so this adds
-- FILTER (WHERE gmv > 0) to the counts and touches no sum. After: new (38) +
-- returning (455) = active_creators (493), which is the identity that was
-- previously false.
--
-- ⚠️ This is the SOLD definition. For "creators who POSTED" — the work the
-- agency actually did in the period — use get_brand_client_report_counts'
-- rosterPosted / storeCreatorsPosted (migration 165). The two are different
-- facts and the report prints both.
--
-- Applied by transforming the live definition rather than restating 200 lines,
-- so no other part of the function can drift through transcription.

do $do$
declare
  d text;
  before_len int;
begin
  select pg_get_functiondef(p.oid) into strict d
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_brand_client_report_agg';

  -- Idempotent: a re-run of the migration set must not fail.
  if d like '%''active_creators'', COUNT(*) FILTER (WHERE gmv > 0)%' then
    raise notice 'get_brand_client_report_agg already counts only sellers; skipping';
    return;
  end if;

  before_len := length(d);

  -- Window and prior-window totals.
  d := replace(d, '''active_creators'', COUNT(*)) FROM cur_m)',
                  '''active_creators'', COUNT(*) FILTER (WHERE gmv > 0)) FROM cur_m)');
  d := replace(d, '''active_creators'', COUNT(*)) FROM prior_m)',
                  '''active_creators'', COUNT(*) FILTER (WHERE gmv > 0)) FROM prior_m)');

  -- Managed / organic / managed-prior creator counts.
  d := replace(d, '''creators'', COUNT(*)) FROM cur_m WHERE is_managed)',
                  '''creators'', COUNT(*) FILTER (WHERE gmv > 0)) FROM cur_m WHERE is_managed)');
  d := replace(d, '''creators'', COUNT(*)) FROM cur_m WHERE NOT is_managed)',
                  '''creators'', COUNT(*) FILTER (WHERE gmv > 0)) FROM cur_m WHERE NOT is_managed)');
  d := replace(d, '''creators'', COUNT(*)) FROM prior_m WHERE is_managed)',
                  '''creators'', COUNT(*) FILTER (WHERE gmv > 0)) FROM prior_m WHERE is_managed)');

  -- New vs returning, and newly-activated.
  d := replace(d, 'COUNT(*) FILTER (WHERE p.handle IS NULL)::bigint',
                  'COUNT(*) FILTER (WHERE p.handle IS NULL AND c.gmv > 0)::bigint');
  d := replace(d, 'COUNT(*) FILTER (WHERE p.handle IS NOT NULL)::bigint',
                  'COUNT(*) FILTER (WHERE p.handle IS NOT NULL AND c.gmv > 0)::bigint');
  d := replace(d, 'COUNT(*) FILTER (WHERE c.is_managed AND p.handle IS NULL)::bigint',
                  'COUNT(*) FILTER (WHERE c.is_managed AND p.handle IS NULL AND c.gmv > 0)::bigint');

  -- Daily series: creators per day, same rule.
  d := replace(d,
    'COUNT(DISTINCT lower(btrim(regexp_replace(cp.creator_name, ''^@'', ''''))))::bigint AS creators',
    'COUNT(DISTINCT lower(btrim(regexp_replace(cp.creator_name, ''^@'', '''')))) FILTER (WHERE cp.gmv > 0)::bigint AS creators');

  if length(d) = before_len then
    raise exception 'no replacement applied — the function body has changed shape; patch by hand';
  end if;

  execute d;
end
$do$;

comment on function public.get_brand_client_report_agg(text[], text[], date, date, date, date) is
  'Client report aggregate. Creator COUNTS are filtered to gmv > 0 — they mean "creators who sold", '
  'not "creators present in the TikTok export", which is what they meant before and which read 24,000+ '
  'on a jiyu week against 493 real sellers. For "creators who POSTED", use '
  'get_brand_client_report_counts.';
