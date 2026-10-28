-- Brand-scoped roster tags opt a creator out of reports ending in one month.
-- Example: reporting-exclude:2026-10. Source facts and other report months remain intact.
DO $migration$
DECLARE f record; original text; updated text; report_end text;
BEGIN
 FOR f IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN (
 'get_brand_client_report_agg_workspace','get_brand_client_report_counts_workspace',
 'get_brand_client_report_granular_workspace','get_brand_client_report_managed_split_workspace',
 'get_brand_client_report_movers_workspace','get_brand_report_signings_workspace',
 'get_brand_roster_weekly_workspace')
 LOOP
  original:=pg_get_functiondef(f.oid);
  report_end:=CASE WHEN f.proname='get_brand_roster_weekly_workspace' THEN 'p_through' ELSE 'p_end' END;
  updated:=replace(original,
   'scoped_managed_creators AS NOT MATERIALIZED (SELECT * FROM public.managed_creators WHERE tenant_id = p_tenant_id)',
   'scoped_managed_creators AS NOT MATERIALIZED (SELECT * FROM public.managed_creators WHERE tenant_id = p_tenant_id AND NOT coalesce(tags, ARRAY[]::text[]) @> ARRAY[''reporting-exclude:'' || to_char(' || report_end || ',''YYYY-MM'')])');
  IF updated=original THEN RAISE EXCEPTION 'Report exclusion patch did not match %',f.proname; END IF;
  EXECUTE updated;
 END LOOP;
END $migration$;

-- Keep original sent snapshots private when an explicitly requested exclusion
-- updates their existing share links. This is not a publicly exposed archive.
CREATE TABLE IF NOT EXISTS repair_archive.client_report_exclusion_backups (
 report_id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL,
 original_report jsonb NOT NULL,
 reason text NOT NULL,
 backed_up_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE repair_archive.client_report_exclusion_backups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON repair_archive.client_report_exclusion_backups FROM PUBLIC,anon,authenticated;
