-- This indexed, interactive aggregate is cheaper to execute than to JIT compile.
-- Scope the setting to this function; retain its body, invoker security and grants.
ALTER FUNCTION public.get_creator_video_history(text[]) SET jit = off;
