import importlib.util
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location(
    "ownership_audit", Path(__file__).with_name("audit-rosetta-ownership-boundary.py")
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class OwnershipBoundaryTest(unittest.TestCase):
    def test_candidate_packages_are_rejected_regardless_of_file_type_or_depth(self):
        for path in (
            "rosetta-candidates/replay/tools/generate.py",
            "archive/rosetta-owner/README.md",
            "rosetta-candidates/manifest.json",
            "lib/semantic-clause-universal-v026.js",
        ):
            with self.subTest(path=path):
                self.assertTrue(MODULE.ownership_violations(Path(path)))

    def test_producer_ddl_is_rejected_outside_the_migration_directory(self):
        for sql in (
            "create function public.run_rosetta_v3_extraction() returns void;",
            'create or replace function "public"."rosetta_v2511_extract"() returns void;',
            "create table if not exists rosetta_canonical_clause (id int);",
            "create view private.rosetta_semantic_shadow_consumable as select 1;",
            "create schema if not exists rosetta_v2513;",
            "create table public.workflow_step (id text);",
            "create temp table rosetta_canonical_clause (id int);",
            'create temporary table "rosetta_canonical_clause" (id int);',
            'create global temporary table if not exists "rosetta_workflow" (id int);',
            "create local temp table workflow_step (id text);",
            "create unlogged table public.rosetta_canonical_clause (id int);",
        ):
            with self.subTest(sql=sql):
                self.assertTrue(MODULE.ownership_violations(Path("staging/repair.sql"), sql))

    def test_consumer_contracts_and_retired_history_remain_allowed(self):
        for path, content in (
            ("server/civic-genome-rosetta-contract.ts", ""),
            ("server/prism-rosetta-worker.ts", ""),
            ("supabase/migrations/binding.sql", "create table public.civic_genome_rosetta_source_binding (id int);"),
            ("supabase/migrations/retired.sql", "-- create function public.run_rosetta_v3_extraction()\nbegin; commit;"),
            ("supabase/migrations/retired.sql", "/* create table rosetta_canonical_clause(id int); */ begin; commit;"),
            ("supabase/verification/binding.sql", "select public.run_rosetta_v3_extraction;"),
        ):
            with self.subTest(path=path):
                self.assertEqual(MODULE.ownership_violations(Path(path), content), [])


if __name__ == "__main__":
    unittest.main()
