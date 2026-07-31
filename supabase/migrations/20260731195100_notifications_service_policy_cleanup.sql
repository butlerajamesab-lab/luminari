-- service_role already owns explicit table privileges and bypasses RLS.
-- Remove the redundant permissive policy so the server-mediated notification
-- boundary has no PostgREST policy surface.

begin;

drop policy if exists service_role_all_notifications
  on public.notifications;

commit;
