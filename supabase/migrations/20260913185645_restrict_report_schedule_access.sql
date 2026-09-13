-- Schedule reads and writes belong to the permission-checked server API only.
ALTER TABLE public.report_schedules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.report_schedules FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.report_schedules TO service_role;
