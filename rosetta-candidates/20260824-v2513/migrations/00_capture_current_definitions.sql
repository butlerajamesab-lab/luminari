-- 00_capture_current_definitions.sql
-- Rosetta 2.5.13 controlled recovery — Phase 0 evidence capture.
-- READ-ONLY. Every statement in this file is a SELECT against pg_catalog or
-- public-schema metadata tables. It issues no DDL, no DML, no LOCK, no LISTEN.
-- Safe to run against production with a read-only role. It modifies nothing.
--
-- Purpose: reproduce every definition, schema fact, registry row, and
-- distribution used by this package, so an independent reviewer can verify
-- that the evidence files under evidence/ match the live database.
--
-- Retrieved facts produced by these queries are preserved under evidence/.
-- Expected verification hashes (captured 2026-08-23):
--   2.5.11 transitive closure (51 members), closure_sha256 ordered by proname:
--     6be3cefe99d91eae22819aa84ff47f1e49be4f85e55a3e70a8b7aa4120c2b294
--   v_civic_genome_law_view_v1_internal pg_get_viewdef md5: 4ea508fc4dde55ab98d4d6bd403763bc
--   v_rosetta_operator_law_view_v1        pg_get_viewdef md5: 49efc0ab12bf34807ffd99c019571203
--   2.5.11 manifest_json::text md5: c0b627297b081393d41b2a9390f1f930
--   registry rule_manifest_hash: 3602eb80fee71a4009bf7a04c521fec62e2d1f17f8ea5b027500905cd8366639

\set QUIET on
\echo '=== 00.1 promoted registry row ==='
SELECT * FROM public.rosetta_current_generation_registry_v1;

\echo '=== 00.2 all extraction rule manifests (inventory) ==='
SELECT manifest_id, engine_version, rule_set_version, manifest_hash,
       md5(manifest_json::text) AS manifest_json_md5,
       char_length(manifest_json::text) AS json_len, created_at
FROM public.extraction_rule_manifest
ORDER BY manifest_id;

\echo '=== 00.3 promoted 2.5.11 manifest body (verbatim) ==='
SELECT manifest_json::text AS manifest_json
FROM public.extraction_rule_manifest
WHERE engine_version = 'rosetta-v3-deterministic-sql-2.5.11';

\echo '=== 00.4 transitive function closure of run_rosetta_v3_extraction ==='
-- Server-side recursive closure: from the dispatcher, follow every
-- rosetta_*/run_rosetta_* identifier referenced in each function body.
WITH RECURSIVE seed AS (
  SELECT p.oid, p.proname
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'run_rosetta_v3_extraction'
),
closure AS (
  SELECT s.oid, s.proname FROM seed s
  UNION
  SELECT p2.oid, p2.proname
  FROM closure c
  JOIN LATERAL regexp_matches(pg_get_functiondef(c.oid),
          '\y(?:rosetta|run_rosetta)_[a-z0-9_]+\y', 'g') AS m(name) ON true
  JOIN pg_proc p2 ON p2.proname = m.name[1]
  JOIN pg_namespace n2 ON n2.oid = p2.pronamespace AND n2.nspname = 'public'
)
SELECT proname,
       md5(pg_get_functiondef(oid))  AS functiondef_md5,
       length(pg_get_functiondef(oid)) AS def_bytes,
       encode(sha256(convert_to(pg_get_functiondef(oid), 'UTF8')), 'hex') AS functiondef_sha256
FROM closure
ORDER BY proname;
-- Expected: 51 rows. Closure SHA-256 = sha256 over the concatenation of
-- pg_get_functiondef output ordered by proname =
-- 6be3cefe99d91eae22819aa84ff47f1e49be4f85e55a3e70a8b7aa4120c2b294

\echo '=== 00.5 publication-path function definitions ==='
SELECT p.proname, md5(pg_get_functiondef(p.oid)) AS functiondef_md5,
       pg_get_functiondef(p.oid) AS def
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('rosetta_is_current_publishable_run_v1',
                    'rosetta_open_structural_repair_count',
                    'rosetta_blocking_structural_repair_count',
                    'rosetta_v25_enrich_objects_with_spans',
                    'rosetta_v25_span_json')
ORDER BY p.proname;

\echo '=== 00.6 publication views (verbatim definitions) ==='
SELECT c.relname AS view_name, md5(pg_get_viewdef(c.oid)) AS viewdef_md5,
       pg_get_viewdef(c.oid) AS def
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('v','m')
ORDER BY 1;

\echo '=== 00.7 table columns ==='
SELECT c.table_name, c.column_name, c.data_type, c.is_nullable, c.column_default
FROM information_schema.columns c
WHERE c.table_schema = 'public'
ORDER BY c.table_name, c.ordinal_position;

\echo '=== 00.8 constraints ==='
SELECT c.conrelid::regclass::text AS table_name, c.conname, c.contype,
       pg_get_constraintdef(c.oid) AS def
FROM pg_constraint c
JOIN pg_class r ON r.oid = c.conrelid
JOIN pg_namespace n ON n.oid = r.relnamespace
WHERE n.nspname = 'public'
ORDER BY 1, 2;

\echo '=== 00.9 indexes ==='
SELECT t.relname AS table_name, i.relname AS index_name,
       ix.indisunique, ix.indisprimary, pg_get_indexdef(ix.indexrelid) AS def
FROM pg_index ix
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_class t ON t.oid = ix.indrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
ORDER BY 1, 2;

\echo '=== 00.10 triggers (user-defined) ==='
SELECT t.relname AS table_name, tg.tgname, pg_get_triggerdef(tg.oid) AS def
FROM pg_trigger tg
JOIN pg_class t ON t.oid = tg.tgrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public' AND NOT tg.tgisinternal
ORDER BY 1, 2;

\echo '=== 00.11 RLS status and policies ==='
SELECT c.relname AS table_name, c.relrowsecurity, p.polname,
       (SELECT string_agg(r.rolname, ',') FROM pg_roles r WHERE r.oid = ANY (p.polroles)) AS roles,
       p.polcmd, pg_get_expr(p.polqual, p.polrelid) AS using_expr,
       pg_get_expr(p.polwithcheck, p.polrelid) AS check_expr
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY 1, 3;

\echo '=== 00.12 grants to anon/authenticated ==='
SELECT c.relname AS object_name, c.relkind,
       (SELECT string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ';' ORDER BY 1)
        FROM aclexplode(c.relacl) a
        WHERE a.grantee::regrole::text IN ('anon','authenticated')) AS anon_auth_privs,
       c.relacl IS NULL AS null_acl
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r','v','S')
ORDER BY 1;

\echo '=== 00.13 corpus counts (point in time) ==='
SELECT (SELECT count(*) FROM public.source_document_content) AS source_contents,
       (SELECT count(*) FROM public.source_document)        AS source_documents,
       (SELECT count(*) FROM public.extraction_run)         AS extraction_runs_total,
       (SELECT count(*) FROM public.extraction_run
         WHERE engine_version = 'rosetta-v3-deterministic-sql-2.5.11') AS v2511_runs,
       (SELECT count(*) FROM public.extraction_run
         WHERE engine_version = 'rosetta-v3-deterministic-sql-2.5.11'
           AND run_status IN ('completed','validated')
           AND admissibility_state = 'admissible')          AS v2511_admissible,
       (SELECT min(created_at) FROM public.source_document_content) AS content_earliest,
       (SELECT max(created_at) FROM public.source_document_content) AS content_latest,
       (SELECT count(*) FROM public.rosetta_structural_repair_queue
         WHERE repair_state IN ('open','in_review'))        AS open_repairs;

\echo '=== 00.14 distribution evidence for C1 limit justification (raw actor text length) ==='
-- Measurement only; does not presume any specific limit value.
SELECT percentile_cont(ARRAY[0.5,0.9,0.99,0.999]) WITHIN GROUP (ORDER BY char_length(actor_text)) AS pct_char_len,
       max(char_length(actor_text)) AS max_char_len,
       count(*) AS n
FROM public.rosetta_clause_ir
WHERE actor_text IS NOT NULL;

\echo '=== end capture ==='
