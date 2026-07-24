-- Reporting rebuild: the outbox + share-link client reports + the Discord
-- game mechanics (approved mockup v3, 2026-07-23).
--
-- 1) client_reports: a client report is a FROZEN SNAPSHOT (the mig-096
--    aggregate jsonb) behind a private token link. Numbers can never shift
--    after sending; first open stamps viewed_at (the outbox shows
--    "Viewed 1h ago"); links are revocable. Token pattern copies the invoice
--    public links. RLS enabled with NO policies: service-role only - the
--    public /r/[token] page and the admin APIs both go through server code.
-- 2) report_log: one row per creator post generated/sent, so Daily Drops and
--    Who's Cooking posts appear in the outbox feed beside client links.
-- 3) get_daily_drop_extras: milestones (lifetime-GMV threshold crossings),
--    posting streaks, first sales, and the biggest rank climber - all from
--    the ROSTER ROLLUPS (roster_creator_daily/posts, the pg_cron-refreshed
--    summaries), so the whole game costs one cheap RPC. Roster-scoped by
--    construction: celebrations target roster members (the people actually
--    in the Discord).
-- 4) get_roster_rookie: best window GMV among roster creators whose first
--    tracked activity is within p_max_age_days - "Rookie of the Week".

CREATE TABLE IF NOT EXISTS client_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(12), 'hex'),
  brand_slug text NOT NULL,          -- 'all' allowed (internal all-brands link)
  brand_name text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  period_label text NOT NULL,
  snapshot jsonb NOT NULL,           -- the full mig-096 aggregate + derived fields
  notes text,                        -- account-lead notes shown on the page
  created_by text,                   -- name/email for the outbox
  created_at timestamptz NOT NULL DEFAULT now(),
  viewed_at timestamptz,             -- first client open
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_client_reports_created ON client_reports (created_at DESC);
ALTER TABLE client_reports ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS report_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type text NOT NULL,         -- 'daily-drop' | 'whos-cooking' | 'whats-cooking' | ...
  format text,                       -- 'highlights' | 'classic' | null
  brand_slug text NOT NULL,          -- 'all' allowed
  period_label text,
  destination text NOT NULL,         -- 'manual' (copied) | 'discord' | 'slack'
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_report_log_created ON report_log (created_at DESC);
ALTER TABLE report_log ENABLE ROW LEVEL SECURITY;

-- ── Daily Drop game mechanics, one call. p_brand_slugs filters the rollups
--    (umbrella-grain slugs as stored in roster tables); NULL = whole roster.
CREATE OR REPLACE FUNCTION public.get_daily_drop_extras(
  p_brand_slugs text[],
  p_yesterday date,
  p_day_before date
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public'
SET statement_timeout = '30s'
AS $$
  WITH scoped AS MATERIALIZED (
    SELECT rd.handle, rd.stat_date, SUM(rd.gmv)::numeric AS gmv
    FROM roster_creator_daily rd
    WHERE (p_brand_slugs IS NULL OR rd.brand_slug = ANY(p_brand_slugs))
    GROUP BY rd.handle, rd.stat_date
  ),
  -- Lifetime GMV through day-before vs through yesterday, for handles that
  -- earned yesterday (only they can cross a threshold).
  life AS MATERIALIZED (
    SELECT s.handle,
           COALESCE(SUM(s.gmv) FILTER (WHERE s.stat_date <= p_day_before), 0) AS before_gmv,
           COALESCE(SUM(s.gmv) FILTER (WHERE s.stat_date <= p_yesterday), 0)  AS after_gmv,
           COALESCE(SUM(s.gmv) FILTER (WHERE s.stat_date = p_yesterday), 0)   AS yday_gmv
    FROM scoped s
    GROUP BY s.handle
  ),
  milestones AS (
    SELECT l.handle, t.threshold
    FROM life l
    CROSS JOIN LATERAL (
      SELECT MAX(x) AS threshold FROM unnest(ARRAY[1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000]) AS x
      WHERE l.before_gmv < x AND l.after_gmv >= x
    ) t
    WHERE l.yday_gmv > 0 AND t.threshold IS NOT NULL
    ORDER BY t.threshold DESC, l.after_gmv DESC
    LIMIT 3
  ),
  first_sales AS (
    SELECT l.handle, l.yday_gmv
    FROM life l
    WHERE l.yday_gmv > 0 AND l.before_gmv = 0
    ORDER BY l.yday_gmv DESC
    LIMIT 5
  ),
  -- Longest posting streak ENDING yesterday (gaps-and-islands over distinct
  -- post days in the last 60).
  post_days AS (
    SELECT DISTINCT rp.handle, rp.post_date
    FROM roster_creator_posts rp
    WHERE rp.post_date > p_yesterday - 60 AND rp.post_date <= p_yesterday
      AND (p_brand_slugs IS NULL OR rp.brand_slug = ANY(p_brand_slugs))
  ),
  runs AS (
    SELECT g.handle, COUNT(*) AS len, MAX(g.post_date) AS last_day
    FROM (
      SELECT pd.handle, pd.post_date,
             pd.post_date - (ROW_NUMBER() OVER (PARTITION BY pd.handle ORDER BY pd.post_date))::int AS grp
      FROM post_days pd
    ) g
    GROUP BY g.handle, g.grp
  ),
  streak AS (
    SELECT r.handle, r.len FROM runs r
    WHERE r.last_day = p_yesterday AND r.len >= 3
    ORDER BY r.len DESC
    LIMIT 1
  ),
  -- Biggest climber: daily-GMV rank yesterday vs day-before, among handles
  -- present both days with a meaningful day ($50+).
  ranks AS (
    SELECT s.handle,
           RANK() OVER (PARTITION BY s.stat_date ORDER BY s.gmv DESC) AS rnk,
           s.stat_date, s.gmv
    FROM scoped s
    WHERE s.stat_date IN (p_yesterday, p_day_before) AND s.gmv > 0
  ),
  climber AS (
    SELECT y.handle, y.rnk AS cur_rank, (d.rnk - y.rnk)::int AS delta, y.gmv
    FROM ranks y
    JOIN ranks d ON d.handle = y.handle AND d.stat_date = p_day_before
    -- Landing in the top 50 keeps the callout meaningful: rank churn deep in
    -- the tail produces thousand-place "jumps" nobody can feel.
    WHERE y.stat_date = p_yesterday AND y.gmv >= 50 AND d.rnk > y.rnk AND y.rnk <= 50
    ORDER BY (d.rnk - y.rnk) DESC, y.gmv DESC
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'milestones', COALESCE((SELECT jsonb_agg(jsonb_build_object('handle', m.handle, 'threshold', m.threshold)) FROM milestones m), '[]'::jsonb),
    'first_sales', COALESCE((SELECT jsonb_agg(jsonb_build_object('handle', f.handle, 'gmv', f.yday_gmv)) FROM first_sales f), '[]'::jsonb),
    'streak', (SELECT jsonb_build_object('handle', st.handle, 'days', st.len) FROM streak st),
    'climber', (SELECT jsonb_build_object('handle', c.handle, 'rank', c.cur_rank, 'delta', c.delta, 'gmv', c.gmv) FROM climber c)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_daily_drop_extras(text[], date, date) TO authenticated, service_role;

-- ── Rookie of the Week: best window GMV among roster creators whose FIRST
--    tracked activity is within p_max_age_days of the window end.
CREATE OR REPLACE FUNCTION public.get_roster_rookie(
  p_brand_slugs text[],
  p_start date,
  p_end date,
  p_max_age_days int DEFAULT 21
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public'
SET statement_timeout = '30s'
AS $$
  WITH per AS (
    SELECT rd.handle,
           MIN(rd.stat_date) AS first_active,
           SUM(rd.gmv) FILTER (WHERE rd.stat_date BETWEEN p_start AND p_end) AS window_gmv
    FROM roster_creator_daily rd
    WHERE (p_brand_slugs IS NULL OR rd.brand_slug = ANY(p_brand_slugs))
    GROUP BY rd.handle
  )
  SELECT jsonb_build_object('handle', p.handle, 'gmv', p.window_gmv, 'first_active', p.first_active)
  FROM per p
  WHERE p.first_active >= p_end - p_max_age_days
    AND COALESCE(p.window_gmv, 0) > 0
  ORDER BY p.window_gmv DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_roster_rookie(text[], date, date, int) TO authenticated, service_role;
