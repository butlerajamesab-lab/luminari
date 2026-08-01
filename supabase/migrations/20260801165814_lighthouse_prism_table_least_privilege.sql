revoke all on table public.lighthouse_prism_verification_requests from service_role;
revoke all on table public.lighthouse_prism_verification_attempts from service_role;
revoke all on table public.lighthouse_prism_verification_receipts from service_role;

grant select, insert, update on table public.lighthouse_prism_verification_requests to service_role;
grant select, insert on table public.lighthouse_prism_verification_attempts to service_role;
grant select, insert on table public.lighthouse_prism_verification_receipts to service_role;

revoke all on table public.lighthouse_prism_verification_requests from public, anon, authenticated;
revoke all on table public.lighthouse_prism_verification_attempts from public, anon, authenticated;
revoke all on table public.lighthouse_prism_verification_receipts from public, anon, authenticated;
