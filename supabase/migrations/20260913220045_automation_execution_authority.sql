-- Existing manual automations remain runnable by an authorized member.
-- A saved schedule receives an execution owner when an authorized member saves it.
ALTER TABLE public.automations ADD COLUMN IF NOT EXISTS execution_user_id uuid
  REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS automations_execution_user_id_idx ON public.automations(execution_user_id);
-- Preserve the identity after account deletion: NULL is reserved for historical
-- email-only rows and must never cause a deleted owner's job to fall back to email.
ALTER TABLE public.broadcasts ADD COLUMN IF NOT EXISTS execution_user_id uuid;
CREATE INDEX IF NOT EXISTS broadcasts_execution_user_id_idx ON public.broadcasts(execution_user_id);
-- These records are served by authenticated server routes, never direct browser writes.
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_recipients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automations, public.integrations, public.broadcasts, public.broadcast_recipients FROM PUBLIC, anon, authenticated;
DO $$ DECLARE entry record; BEGIN
  FOR entry IN SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name IN ('automations','integrations','broadcasts','broadcast_recipients')
  LOOP
    EXECUTE format('REVOKE SELECT (%I), INSERT (%I), UPDATE (%I), REFERENCES (%I) ON public.%I FROM PUBLIC, anon, authenticated',
      entry.column_name,entry.column_name,entry.column_name,entry.column_name,entry.table_name);
  END LOOP;
END $$;
