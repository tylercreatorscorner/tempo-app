-- creator_milestones: tracks when a creator crosses a GMV threshold for a brand,
-- and whether the bot has already celebrated it. Each row = one threshold crossing.

CREATE TABLE IF NOT EXISTS creator_milestones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id      UUID NOT NULL REFERENCES creators_v2(id),
  brand_id        UUID NOT NULL REFERENCES brands_v2(id),
  threshold       NUMERIC NOT NULL,        -- e.g. 1000, 5000, 10000...
  cumulative_gmv  NUMERIC NOT NULL,        -- creator's all-time GMV when this row was created
  achieved_at     TIMESTAMPTZ DEFAULT now(),
  announced_at    TIMESTAMPTZ,             -- NULL = bot hasn't celebrated yet
  UNIQUE (creator_id, brand_id, threshold)
);

CREATE INDEX IF NOT EXISTS idx_cm_unannounced
  ON creator_milestones(brand_id) WHERE announced_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cm_creator
  ON creator_milestones(creator_id, brand_id);

ALTER TABLE creator_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON creator_milestones FOR ALL USING (true);

-- Backfill: pre-mark all currently-crossed thresholds as announced so the bot
-- doesn't flood every brand's #wins channel with hundreds of past celebrations
-- on first run. Forward-only celebrations from here on.
INSERT INTO creator_milestones (
  creator_id, brand_id, threshold, cumulative_gmv, achieved_at, announced_at
)
SELECT
  cumulative.creator_id,
  cumulative.brand_id,
  threshold.value,
  cumulative.gmv,
  now(),
  now()
FROM (
  SELECT
    dcs.brand_id AS brand_id,
    ta.creator_id AS creator_id,
    SUM(dcs.gmv) AS gmv
  FROM daily_creator_stats dcs
  JOIN tiktok_accounts ta
    ON dcs.tiktok_username = ta.tiktok_username
    AND dcs.brand_id = ta.brand_id
  WHERE ta.creator_id IS NOT NULL
  GROUP BY dcs.brand_id, ta.creator_id
) cumulative
CROSS JOIN (
  VALUES
    (1000::NUMERIC),
    (5000::NUMERIC),
    (10000::NUMERIC),
    (25000::NUMERIC),
    (50000::NUMERIC),
    (100000::NUMERIC),
    (250000::NUMERIC),
    (500000::NUMERIC),
    (1000000::NUMERIC)
) threshold(value)
WHERE cumulative.gmv >= threshold.value
ON CONFLICT (creator_id, brand_id, threshold) DO NOTHING;
