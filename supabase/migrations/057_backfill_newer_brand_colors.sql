-- Backfill brands_v2.color for the 18 newer brands that had no color set
-- (they rendered a neutral gray everywhere brand color is shown). Distinct
-- palette drawn away from the existing green/teal/blue/purple/pink/yellow hues
-- so brand charts stay legible. Applied to prod via the Supabase MCP
-- (migration: backfill_newer_brand_colors); this file mirrors it for the repo.
--
-- Idempotent: only sets where color is currently null/empty.
update brands_v2 b
set color = c.color
from (values
  ('deos','#E53935'),
  ('dr_dent','#00B8D4'),
  ('earth_breeze','#00897B'),
  ('evil_goods','#B71C1C'),
  ('forchics','#EC407A'),
  ('goli','#F9A825'),
  ('kalshi','#3949AB'),
  ('keeps','#5C6BC0'),
  ('kitsch','#D500F9'),
  ('mary_ruth','#AFB42B'),
  ('microingredients','#F57C00'),
  ('nathan_and_sons','#6D4C41'),
  ('nello','#607D8B'),
  ('neurogum','#8E24AA'),
  ('peach_slices','#FF8A65'),
  ('rosabella','#C2185B'),
  ('serene_herbs','#7E57C2'),
  ('taily','#FF7043')
) as c(slug, color)
where b.slug = c.slug and coalesce(b.color,'') = '';
