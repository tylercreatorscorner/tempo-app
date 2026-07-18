-- Persist the signed token on the row so a failed DM can be retried without
-- re-minting (the table is service-role-only via RLS, same trust level as the DB).
ALTER TABLE public.creator_claim_tokens
  ADD COLUMN IF NOT EXISTS token text;

-- Managed creators with a discord_id and NO active (unconsumed, unexpired) claim
-- token — i.e. who still needs an invite. Set-returning + LIMIT avoids the
-- PostgREST 1000-row truncation on managed_creators.
CREATE OR REPLACE FUNCTION public.get_creators_to_invite(p_limit int DEFAULT 1000)
RETURNS TABLE(creator_id uuid, discord_id text, real_name text)
LANGUAGE sql STABLE AS $$
  SELECT cv.id, cv.discord_id, cv.real_name
  FROM public.creators_v2 cv
  WHERE cv.discord_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.managed_creators mc WHERE mc.creator_id = cv.id)
    AND NOT EXISTS (
      SELECT 1 FROM public.creator_claim_tokens t
      WHERE t.creator_id = cv.id AND t.consumed_at IS NULL AND t.expires_at > now()
    )
  ORDER BY cv.id
  LIMIT p_limit;
$$;
