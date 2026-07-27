-- 127_rookies_and_milestones.sql
--
-- Two more Discord formats: ROOKIE WATCH and MILESTONES. Both exist to change
-- WHO can win — the flagship formats rank by absolute GMV, so the same ten
-- creators take every board. Rookies can only be won by someone new; milestones
-- eventually reach most of the roster.
--
-- ⚠️ SCOPED TO THE MANAGED ROSTER. roster_creator_daily carries the entire
-- affiliate universe — 402,061 handles — of which ~1,066 are people under
-- contract. Congratulating an affiliate who has never been in the server, and
-- whom nobody at the agency has spoken to, is worse than posting nothing.
--
-- ⚠️ "Since we started tracking", NOT lifetime. roster_creator_daily begins
-- 2025-05-01. Copy must never say "all time".

-- ── Rookie Watch ────────────────────────────────────────────────────────────
-- The list form of get_roster_rookie (mig 097), which returns exactly one row
-- and is NOT roster-scoped. Applied separately as roster_rookies_list.

-- ── Milestones ──────────────────────────────────────────────────────────────
--
-- creator_milestones ALREADY EXISTS (mig 035) and is deliberately reused rather
-- than duplicated: it was built for the old Netlify dashboard's Discord bot,
-- which has not run since March 2026, but its shape is right and it already
-- holds 1,054 rows — all marked announced by 035's backfill, which pre-marked
-- every historical crossing so the bot would not flood #wins on first run.
-- Building a second, handle-keyed milestones table would give this concept two
-- sources of truth, which is precisely how the brand registries drifted.
--
-- Its schema: (creator_id uuid, brand_id uuid, threshold, cumulative_gmv,
-- achieved_at, announced_at), UNIQUE (creator_id, brand_id, threshold).
--
-- ⚠️ 035 stamped achieved_at = now() for every backfilled row, so for those
-- rows it records WHEN THE SEED RAN, not when the creator actually crossed.
-- The detector below records the REAL crossing date for everything new, which
-- is what makes an "achieved this week" window mean anything.

create or replace function public.detect_creator_milestones(p_brand_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '120s'
as $function$
declare
  v_inserted integer;
begin
  with thresholds(t) as (
    values (1000::numeric), (5000), (10000), (25000), (50000),
           (100000), (250000), (500000), (1000000)
  ),
  -- Same identity bridge 035 used: daily_creator_stats -> tiktok_accounts ->
  -- creators_v2. Creators with no v2 identity are skipped, as they were then.
  cume as (
    select ta.creator_id, dcs.brand_id, dcs.report_date,
           sum(sum(dcs.gmv)) over (partition by ta.creator_id, dcs.brand_id
                                   order by dcs.report_date
                                   rows between unbounded preceding and current row) as running
    from daily_creator_stats dcs
    join tiktok_accounts ta
      on ta.tiktok_username = dcs.tiktok_username
     and ta.brand_id = dcs.brand_id
    where ta.creator_id is not null
      and (p_brand_ids is null or dcs.brand_id = any(p_brand_ids))
    group by ta.creator_id, dcs.brand_id, dcs.report_date
  ),
  crossings as (
    select c.creator_id, c.brand_id, th.t as threshold,
           min(c.report_date) as crossed_on,
           min(c.running) filter (where c.running >= th.t) as value_at
    from cume c
    cross join thresholds th
    where c.running >= th.t
    group by c.creator_id, c.brand_id, th.t
  )
  insert into creator_milestones
    (creator_id, brand_id, threshold, cumulative_gmv, achieved_at, announced_at)
  select creator_id, brand_id, threshold, value_at,
         crossed_on::timestamptz,   -- the REAL crossing day, not now()
         null                       -- unannounced: this is what a post picks up
  from crossings
  on conflict (creator_id, brand_id, threshold) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$function$;

-- Read milestones for a post: unannounced AND recent.
--
-- Both conditions on purpose. announced_at is the table's own design (035 built
-- idx_cm_unannounced for it) and keeps the 1,054 historical rows out. The
-- achieved_at window then bounds the list so that, with posting still manual and
-- nothing marking rows announced, a milestone surfaces for a few days and then
-- ages out instead of accumulating forever. When the drop gets scheduled, switch
-- to marking announced_at on send and drop the window.
create or replace function public.get_creator_milestones(
  p_brand_ids  uuid[]  default null,
  p_end        date    default current_date,
  p_since_days integer default 10,
  p_limit      integer default 12
)
returns json
language sql
stable
security definer
set search_path to 'public'
as $function$
  select json_build_object(
    'milestones', coalesce((select json_agg(m) from (
        select coalesce(ta.tiktok_username, c.tiktok_handle, c.real_name) as handle,
               b.slug        as "brandSlug",
               cm.threshold,
               cm.cumulative_gmv as "valueAt",
               cm.achieved_at::date as "achievedOn"
        from creator_milestones cm
        join brands_v2 b on b.id = cm.brand_id
        left join creators_v2 c on c.id = cm.creator_id
        left join lateral (
          select tiktok_username from tiktok_accounts
          where creator_id = cm.creator_id and brand_id = cm.brand_id
          order by id limit 1
        ) ta on true
        where cm.announced_at is null
          and cm.achieved_at::date >  p_end - p_since_days
          and cm.achieved_at::date <= p_end
          and (p_brand_ids is null or cm.brand_id = any(p_brand_ids))
        order by cm.threshold desc, cm.achieved_at desc
        limit p_limit) m), '[]'::json),
    'sinceDays', p_since_days
  );
$function$;

revoke all on function public.detect_creator_milestones(uuid[]) from public, anon, authenticated;
revoke all on function public.get_creator_milestones(uuid[], date, integer, integer) from public, anon, authenticated;
grant execute on function public.detect_creator_milestones(uuid[]) to service_role;
grant execute on function public.get_creator_milestones(uuid[], date, integer, integer) to service_role;
