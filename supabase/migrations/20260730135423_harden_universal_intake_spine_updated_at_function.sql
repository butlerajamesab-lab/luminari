-- Harden trigger function search path.
-- Live Supabase migration: 20260730135423_harden_universal_intake_spine_updated_at_function

alter function public.luminari_set_updated_at()
  set search_path = public, pg_temp;