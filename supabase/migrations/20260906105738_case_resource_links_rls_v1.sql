-- Close the RLS hole on public.case_resource_links (the only non-RLS table
-- in the Lighthouse public schema). House pattern per case_collaborators:
-- RLS enabled + service_role ALL policy; fail-closed to anon/authenticated.

ALTER TABLE public.case_resource_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all_case_resource_links_v1
  ON public.case_resource_links
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
