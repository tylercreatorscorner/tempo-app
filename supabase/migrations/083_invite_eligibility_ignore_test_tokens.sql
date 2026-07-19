-- A test invite (created_by='test-invite') must NOT count as "has an active token"
-- — otherwise testing on yourself would silently exclude that creator from the
-- real blast. Only real 'bulk-invite' tokens gate eligibility.
CREATE OR REPLACE FUNCTION public.get_creators_to_invite(p_limit int DEFAULT 1000)
RETURNS TABLE(creator_id uuid, discord_id text, real_name text)
LANGUAGE sql STABLE AS $$
  SELECT cv.id, cv.discord_id, cv.real_name
  FROM public.creators_v2 cv
  WHERE cv.discord_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.managed_creators mc WHERE mc.creator_id = cv.id)
    AND NOT EXISTS (
      SELECT 1 FROM public.creator_claim_tokens t
      WHERE t.creator_id = cv.id
        AND t.consumed_at IS NULL
        AND t.expires_at > now()
        AND t.created_by = 'bulk-invite'
    )
  ORDER BY cv.id
  LIMIT p_limit;
$$;
