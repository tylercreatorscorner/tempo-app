-- Duplicate guardrails (2026-07-07). Applied to prod via the Supabase MCP; this
-- file mirrors it for the repo / fresh environments.
--
-- Context: a managed creator re-added under a different one of their handles
-- minted a duplicate roster row (the old UNIQUE(brand, lower(account_1)) index
-- only guards the PRIMARY handle, and a person has many handles). PR #114 fixed
-- the add-flow to dedup by creator_id; these indexes are the DB-level backstop.
--
-- Prereq done out-of-band before this ran: the only active (creator_id, brand)
-- duplicate — the Terme/Tawny identity conflation on physicians_choice — was
-- split (row 861 repointed to Tawny's canonical creator_id; backup in
-- public._terme_tawny_split_backup).

-- Backstop: at most one ACTIVE managed_creators row per (person, brand). creator_id
-- is ~97% populated and is the canonical person id, so a duplicate roster row is
-- now impossible at the DB level even if the add-flow logic ever regresses.
-- Partial (archived_at is null) so soft-removed rows don't block a legit re-add /
-- un-archive, which reuses the existing row in place.
create unique index if not exists managed_creators_creator_brand_active_uniq
  on public.managed_creators (creator_id, brand)
  where archived_at is null and creator_id is not null and brand is not null;

-- One person per phone / per email (case-insensitive) in creators_v2. Both columns
-- are ~empty today (future-proofing for portal onboarding); partial so null/blank
-- values never collide.
create unique index if not exists creators_v2_phone_uniq
  on public.creators_v2 (phone)
  where phone is not null and btrim(phone) <> '';

create unique index if not exists creators_v2_email_lower_uniq
  on public.creators_v2 (lower(email))
  where email is not null and btrim(email) <> '';

-- NOT YET: a UNIQUE(discord_id) on creators_v2. Blocked by 183 discord_ids
-- currently shared across multiple creators_v2 rows (the same-person-many-ids
-- tangle). Those must be merged by discord_id first; add the unique index after.
