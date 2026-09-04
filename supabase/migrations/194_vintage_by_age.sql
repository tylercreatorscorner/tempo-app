-- Bucket video GMV by AGE, not by calendar month.
--
-- ── What was wrong ──────────────────────────────────────────────────────────
--
-- "Where our sales came from" bucketed video GMV by CALENDAR MONTH and showed
-- the three most recent, so an August report read "AUG / JUL / EARLIER POSTS".
-- Two problems:
--
--   * It stops after two named months and dumps the rest into one bucket, so a
--     brand cannot tell whether "earlier" is three months old or eighteen. On
--     Cata-Kor that bucket was 58.6% of the period: the single largest figure
--     in the section, and it said nothing.
--   * A calendar month is not an age. On any window that is not a whole month
--     the newest bucket is a PARTIAL month labelled as a whole one.
--
-- Age answers what a brand deciding whether to keep paying actually asks: how
-- long does a post keep earning? Measured on Cata-Kor August:
--
--     0-30d    $107,444  17.5%
--     30-60d   $145,884  23.8%
--     60-90d    $39,838   6.5%
--     90d+     $317,325  51.7%
--     no date    $3,049   0.5%
--     ----------------------------
--     total    $613,540  == newVideo.totalGmv, to the cent
--
-- ⚠️ AGE IS MEASURED BACK FROM THE WINDOW END, never from now(). A frozen
-- report has to give the same answer forever; anchoring on today would make
-- every old report drift the moment it was reopened.
--
-- ⚠️ VIDEO GMV ONLY, and that is not a footnote. Live and product-card GMV
-- carry no post date at all and are NEVER apportioned across these buckets.
-- On Cata-Kor August that is $613,540 of video against $624,235 of roster GMV;
-- the $10,694 difference is live ($8,854) plus product card ($1,840). The
-- renderer states it on its own line rather than hiding it in the oldest
-- bucket.
--
-- ── Why this is a patch and not a full CREATE OR REPLACE ────────────────────
--
-- Same convention as migration 191: the body is long and has been amended by
-- 157, 165, 173 and 191, so restating it here would mean maintaining a second
-- copy that goes stale. 🚨 THE FIRST ATTEMPT DID EXACTLY THAT AND WOULD HAVE
-- REGRESSED THE FUNCTION: rebuilding from migration 157's text silently
-- dropped migration 191's `role` and `roleCoverage`, because 157 predates
-- them. Read the LIVE definition, patch it, put it back.
--
-- Guarded so a replay is a no-op rather than an error, and it raises if either
-- anchor is missing rather than writing a half-patched function.
--
-- Rides the granular RPC the report already calls, so no extra round trip.

do $mig$
declare
  def        text;
  cte_anchor text := '  top3 as (';
  out_anchor text := '    ''creators'', coalesce((';
  cte_add    text;
  out_add    text;
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_brand_client_report_granular';

  if def is null then
    raise exception 'get_brand_client_report_granular not found';
  end if;

  -- Already applied: nothing to do.
  if def like '%vintage_age%' then
    return;
  end if;

  if position(cte_anchor in def) = 0 then
    raise exception 'CTE anchor missing; refusing to write a half-patched function';
  end if;
  if position(out_anchor in def) = 0 then
    raise exception 'output anchor missing; refusing to write a half-patched function';
  end if;

  cte_add :=
'  /* Video GMV bucketed by AGE, not calendar month. Age is measured back from
     the window END, never from today: a frozen report must give the same
     answer forever. VIDEO GMV ONLY -- live and product-card GMV carry no post
     date and are never apportioned across these buckets. */
  vintage_age as (
    select case
             when post_date is null             then ''unknown''
             when post_date::date >  p_end - 30 then ''d0_30''
             when post_date::date >  p_end - 60 then ''d30_60''
             when post_date::date >  p_end - 90 then ''d60_90''
             else                                    ''d90_plus''
           end                      as bucket,
           count(distinct video_id) as videos,
           sum(gmv)                 as gmv
    from roster_facts
    group by 1
  ),
';

  out_add :=
'    /* All five keys always, so the renderer never has to guess whether a
       missing key means zero or means "not computed". */
    ''vintageAge'', (
      select jsonb_build_object(
        ''d0_30'',    jsonb_build_object(''videos'', coalesce(sum(videos) filter (where bucket = ''d0_30''),    0), ''gmv'', coalesce(sum(gmv) filter (where bucket = ''d0_30''),    0)),
        ''d30_60'',   jsonb_build_object(''videos'', coalesce(sum(videos) filter (where bucket = ''d30_60''),   0), ''gmv'', coalesce(sum(gmv) filter (where bucket = ''d30_60''),   0)),
        ''d60_90'',   jsonb_build_object(''videos'', coalesce(sum(videos) filter (where bucket = ''d60_90''),   0), ''gmv'', coalesce(sum(gmv) filter (where bucket = ''d60_90''),   0)),
        ''d90_plus'', jsonb_build_object(''videos'', coalesce(sum(videos) filter (where bucket = ''d90_plus''), 0), ''gmv'', coalesce(sum(gmv) filter (where bucket = ''d90_plus''), 0)),
        ''unknown'',  jsonb_build_object(''videos'', coalesce(sum(videos) filter (where bucket = ''unknown''),  0), ''gmv'', coalesce(sum(gmv) filter (where bucket = ''unknown''),  0))
      )
      from vintage_age
    ),

';

  def := replace(def, cte_anchor, cte_add || cte_anchor);
  def := replace(def, out_anchor, out_add || out_anchor);
  execute def;
end
$mig$;
