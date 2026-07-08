-- creators_v2 UNIQUE(discord_id) — one identity per Discord user.
--
-- Applied to prod after the 183 duplicate-Discord identity groups (378 creators_v2
-- rows → 183) were merged by Discord ID. The merge repointed all 8 FK tables
-- (managed_creators, tiktok_accounts, creator_brands, creator_contacts,
-- creator_consent_events, creator_messages, creator_milestones,
-- pending_creator_links) to a canonical id, then retired the redundant rows;
-- active managed rows (1,331) and total retainer ($605,225) were unchanged.
-- Backups: public._discord_merge_map + _discord_merge_bkp_* (167 same-name groups)
-- and _dm2_bkp_* (16 cross-name groups).
--
-- Partial so the ~53% of creators_v2 rows with no Discord ID don't collide on NULL.
create unique index if not exists creators_v2_discord_id_uniq
  on public.creators_v2 (discord_id)
  where discord_id is not null and btrim(discord_id) <> '';
