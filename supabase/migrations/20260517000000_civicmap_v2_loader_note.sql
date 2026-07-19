-- CivicMap V2 historical loader note.
--
-- The original note documented that CivicMap V2 still loaded
-- normalized_civic_resource and identified v_unified_civic_infrastructure as
-- the intended replacement. Production now has an evolved unified civic
-- infrastructure view and later runtime wiring. This migration remains a
-- documentation-only checkpoint and performs no schema or data mutation.

select 1;
