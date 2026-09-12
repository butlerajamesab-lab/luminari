import importlib.util
import unittest
from pathlib import Path

from pglast import parse_sql

spec = importlib.util.spec_from_file_location(
    "reconcile_sais", Path(__file__).with_name("reconcile-sais-source-seed.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SourceSeedTests(unittest.TestCase):
    def value(self, sql):
        return module.literal(parse_sql(f"select {sql}")[0].stmt.targetList[0].val)

    def test_preserves_literal_content_and_empty_arrays(self):
        self.assertEqual(self.value("'JSON :: text; ON CONFLICT -- still data'"),
                         "JSON :: text; ON CONFLICT -- still data")
        self.assertEqual(self.value("ARRAY[]::text[]"), [])
        self.assertEqual(self.value("ARRAY['a,b', 'O''Brien']::text[]"), ["a,b", "O'Brien"])
        self.assertEqual(self.value("$q$line -- one\n/* still data */$q$"),
                         "line -- one\n/* still data */")
        self.assertEqual(self.value("'{\"A B\": [1, null], \"A-B\": false}'::jsonb"),
                         {"A B": [1, None], "A-B": False})

    def test_rejects_expressions_without_evaluating_them(self):
        with self.assertRaises(ValueError):
            self.value("current_setting('server_version')")
        with self.assertRaises(ValueError):
            self.value("'10'::numeric")

    def test_unknown_source_bytes_fail_before_compilation(self):
        with self.assertRaisesRegex(ValueError, "bytes do not match"):
            module.parse_seed(b"delete from sais_import.resource_candidate;")

    def test_generated_transaction_is_parseable_with_quoted_source_text(self):
        rows = [{"candidate_id": "test", "run_id": module.RUN_ID,
                 "title": "O'Brien; $q$ -- quoted", "promotion_status": "staged"}]
        preflight, apply = module.compile_batch("resource_candidate", list(rows[0]), rows)
        self.assertTrue(parse_sql(preflight))
        self.assertTrue(parse_sql(apply))
        self.assertIn("is distinct from", apply)
        self.assertIn('on conflict ("candidate_id") do nothing', apply)
        self.assertNotIn("a.\"promotion_status\"", preflight)
        self.assertNotIn("do update", apply)

    def test_delimiter_collision_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "delimiter"):
            module.compile_batch("source_document", ["document_id"],
                                 [{"document_id": "$sais_reconcile$"}])


if __name__ == "__main__":
    unittest.main()
