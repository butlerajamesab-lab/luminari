"""Verify immutable executed SQL and its explicit canonical empty-state replay pin."""
import ast
import hashlib
import os
from pathlib import Path
import tempfile
import unittest

module = ast.parse(Path("scripts/audit-supabase-migration-ledger-parity.py").read_text())
definitions = [n for n in module.body if isinstance(n, ast.FunctionDef) and n.name in {"git_blob_sha1", "verify_verbatim_production_receipts"}]
scope = {"Path": Path, "hashlib": hashlib}
exec(compile(ast.Module(body=definitions, type_ignores=[]), "<ledger-verification-functions>", "exec"), scope)
verify = scope["verify_verbatim_production_receipts"]
git_blob = scope["git_blob_sha1"]

class ProductionReplayReceipt(unittest.TestCase):
    def setUp(self):
        self.old_cwd = Path.cwd()
        self.tmp = tempfile.TemporaryDirectory()
        os.chdir(self.tmp.name)
        self.version = "20261017021051"
        self.archive = Path("supabase/verification/applied/20261017021051_trait.sql")
        self.canonical = Path("supabase/migrations/20261017021051_trait.sql")
        for p in (self.archive, self.canonical):
            p.parent.mkdir(parents=True, exist_ok=True)
        self.archive.write_text("select 'executed production SQL';\n")
        self.canonical.write_text("select 'explicit empty-state replay';\n")
        self.md5 = hashlib.md5(self.archive.read_bytes()).hexdigest()
        self.entries = {self.version: (str(self.archive), self.md5, git_blob(self.archive))}
        self.receipts = {self.version: [{"statements_md5": self.md5}]}
        self.aliases = {self.version: (self.md5, git_blob(self.canonical))}

    def tearDown(self):
        os.chdir(self.old_cwd)
        self.tmp.cleanup()

    def result(self):
        return verify(self.entries, self.receipts, self.aliases)

    def test_exact_executed_archive_and_distinct_replay_pass(self):
        self.assertEqual(self.result(), [])

    def test_changed_executed_bytes_fail(self):
        self.archive.write_text("select 'modified production SQL';\n")
        self.assertIn((self.version, "archive_bytes_changed"), self.result())

    def test_missing_executed_archive_fails(self):
        self.archive.unlink()
        self.assertIn((self.version, "archive_missing"), self.result())

    def test_wrong_production_receipt_fails(self):
        self.receipts[self.version][0]["statements_md5"] = "0" * 32
        self.assertIn((self.version, "production_receipt_mismatch"), self.result())

    def test_duplicate_production_receipt_fails(self):
        self.receipts[self.version].append(self.receipts[self.version][0])
        self.assertIn((self.version, "production_receipt_mismatch"), self.result())

    def test_changed_replay_source_fails_even_if_it_matches_production(self):
        self.canonical.write_bytes(self.archive.read_bytes())
        self.assertIn((self.version, "replay_source_changed"), self.result())

    def test_missing_or_wrong_replay_alias_fails(self):
        self.aliases.clear()
        self.assertIn((self.version, "replay_alias_missing_or_mismatched"), self.result())

if __name__ == "__main__":
    unittest.main()
