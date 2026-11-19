-- An assignment entered in error is different from a real creator departure.
-- Keep its archived row and audit history; the brand-scoped tag excludes it
-- from every report period without inventing a departure date. Monthly tags
-- keep their existing behavior. No roster, report snapshot or source facts
-- are changed by this migration.
DO $migration$
DECLARE
  f record;
  original text;
  updated text;
  matched integer;
  patched integer := 0;
  before_acl aclitem[];
  before_owner oid;
  before_config text[];
  pattern constant text := $pattern$coalesce\((([a-z]+\.)?tags),\s*ARRAY\[\]::text\[\]\)\s*@>\s*ARRAY\['reporting-exclude:'\s*\|\|\s*to_char\((p_end|p_prior_end|p_through),\s*'YYYY-MM'\)\]$pattern$;
  replacement constant text := $replacement$coalesce(\1, ARRAY[]::text[]) && ARRAY['reporting-exclude:all', 'reporting-exclude:' || to_char(\3, 'YYYY-MM')]$replacement$;
BEGIN
  FOR f IN
    SELECT expected.signature, expected.predicates, p.oid, p.prosecdef, p.proacl, p.proowner, p.proconfig
    FROM (VALUES
      ('public.get_brand_client_report_agg_workspace(uuid,text[],text[],date,date,date,date)', 1),
      ('public.get_brand_client_report_counts_workspace(uuid,text[],text[],date,date,date,date)', 1),
      ('public.get_brand_client_report_granular_workspace(uuid,text[],text[],date,date)', 1),
      ('public.get_brand_client_report_managed_split_workspace(uuid,text[],text[],date,date,date,date)', 1),
      ('public.get_brand_client_report_movers_workspace(uuid,text[],text[],date,date,date,date,integer)', 1),
      ('public.get_brand_report_signings_workspace(uuid,text[],date)', 1),
      ('public.get_brand_roster_weekly_workspace(uuid,text[],text[],date)', 1),
      ('public.get_published_video_counts_workspace(uuid,text[],date,date,date,date,text[])', 2),
      ('public.get_report_published_video_evidence_workspace(uuid,text[],text[],date,date,text[])', 1),
      ('public.get_roster_summary_workspace(uuid,text[],text[],date,date)', 1)
    ) AS expected(signature, predicates)
    LEFT JOIN pg_proc p ON p.oid = to_regprocedure(expected.signature)
  LOOP
    IF f.oid IS NULL OR f.prosecdef THEN
      RAISE EXCEPTION 'Missing or unexpectedly privileged reporting function: %', f.signature;
    END IF;
    original := pg_get_functiondef(f.oid);
    SELECT count(*) INTO matched FROM regexp_matches(original, pattern, 'g');
    IF matched <> f.predicates OR position('reporting-exclude:all' IN original) > 0 THEN
      RAISE EXCEPTION 'Reporting exclusion predicate drift in %: expected %, found %', f.signature, f.predicates, matched;
    END IF;
    before_acl := f.proacl;
    before_owner := f.proowner;
    before_config := f.proconfig;
    updated := regexp_replace(original, pattern, replacement, 'g');
    EXECUTE updated;
    IF EXISTS (
      SELECT 1 FROM pg_proc p WHERE p.oid = f.oid AND
        (p.prosecdef OR p.proacl IS DISTINCT FROM before_acl
         OR p.proowner IS DISTINCT FROM before_owner OR p.proconfig IS DISTINCT FROM before_config)
    ) THEN
      RAISE EXCEPTION 'Reporting function security or configuration changed: %', f.signature;
    END IF;
    patched := patched + 1;
  END LOOP;
  IF patched <> 10 THEN
    RAISE EXCEPTION 'Expected 10 reporting functions, found %', patched;
  END IF;
END
$migration$;
