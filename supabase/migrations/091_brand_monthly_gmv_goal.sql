-- Daily Drop pacing goals become DB-driven. The old MONTHLY_GOALS map in
-- discord-posts.ts hardcoded 4 brands (one of them deleted) with a $100k
-- default, so every current brand paced against a fabricated goal. NULL means
-- "no goal set" and the Daily Drop simply omits its GOAL/PROGRESS block.
ALTER TABLE brands_v2 ADD COLUMN IF NOT EXISTS monthly_gmv_goal numeric;
COMMENT ON COLUMN brands_v2.monthly_gmv_goal IS
  'Monthly GMV goal for Daily Drop pacing. NULL = no goal set - reports omit the goal block rather than fabricate one.';
