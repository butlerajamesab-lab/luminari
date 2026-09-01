// Compatibility path for legacy pages. Authentication is canonicalized in the
// Supabase-backed hook; this module must never manufacture a preview identity.
export { useAuth } from "@/core/hooks/useAuth";
