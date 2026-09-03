"""Pure behavioral tests for the truth-first sealed-corpus worker."""
from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import os
import subprocess
import sys
import unittest
from dataclasses import replace
from pathlib import Path
from unittest import mock


WORKER_PATH = Path(__file__).resolve().parents[1] / "tools" / "replay_manifest_worker.py"
SPEC = importlib.util.spec_from_file_location("replay_manifest_worker", WORKER_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("could not load replay_manifest_worker")
worker = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = worker
SPEC.loader.exec_module(worker)

MANIFEST_ID = "10000000-0000-4000-8000-000000000001"
HASH_A = "a" * 64
HASH_B = "b" * 64


def source(number: int) -> str:
    return f"20000000-0000-4000-8000-{number:012d}"


def attempt(number: int) -> str:
    return f"30000000-0000-4000-8000-{number:012d}"


def member(
    number: int,
    *,
    expected: str = "completed",
    failure_code: str | None = None,
    prior: str = "none",
) -> worker.Member:
    return worker.Member(number, source(number), expected, failure_code, prior)


CONFIG = worker.WorkerConfig(
    MANIFEST_ID,
    "v2513_",
    "rosetta-v3-deterministic-sql-2.5.13",
    "rosetta-five-layer-structural-correctness-2.5.13",
    "unit-worker",
)


class FakeStore:
    """Stateful semantic fake; it does not parse or execute SQL."""

    def __init__(
        self,
        members: list[worker.Member],
        *,
        attempts: dict[str, worker.AttemptSnapshot] | None = None,
        execute_outcomes: dict[str, tuple[str, str | None]] | None = None,
        bindings: set[str] | None = None,
        terminal_receipts: dict[str, str] | None = None,
        manifest_snapshots: list[worker.ManifestSnapshot] | None = None,
        closure_hashes: list[str] | None = None,
        configuration_lock_hashes: list[str] | None = None,
        configuration_errors: set[str] | None = None,
        diff_errors: set[str] | None = None,
        contract_error: bool = False,
    ) -> None:
        self._members = members
        self._source_attempt = dict(attempts or {})
        self._attempts = {
            snapshot.attempt_id: snapshot
            for snapshot in self._source_attempt.values()
        }
        self._execute_outcomes = execute_outcomes or {}
        self._bindings = set(bindings or set())
        if terminal_receipts is None:
            terminal_receipts = {
                snapshot.attempt_id: (
                    "timeout"
                    if snapshot.attempt_state == "timed_out"
                    else "terminal_failure"
                )
                for snapshot in self._source_attempt.values()
                if snapshot.attempt_state in ("timed_out", "failed_terminal")
            }
        self._terminal_receipts = dict(terminal_receipts)
        self._manifest_snapshots = manifest_snapshots or [
            worker.ManifestSnapshot(len(members), 100, HASH_A),
            worker.ManifestSnapshot(len(members), 100, HASH_A),
        ]
        self._closure_hashes = closure_hashes or [HASH_B, HASH_B]
        self._configuration_lock_hashes = configuration_lock_hashes or [
            "d" * 64,
            "d" * 64,
        ]
        self._configuration_errors = configuration_errors or set()
        self._diff_errors = diff_errors or set()
        self._contract_error = contract_error
        self.contract_calls = 0
        self.manifest_calls = 0
        self.closure_calls = 0
        self.configuration_lock_calls = 0
        self.claim_calls: list[str] = []
        self.execute_calls: list[str] = []
        self.finalize_calls: list[str] = []
        self.finalize_interrupted_calls: list[str] = []
        self.diff_calls: list[str] = []

    def assert_truth_observation_contract(self) -> None:
        self.contract_calls += 1
        if self._contract_error:
            raise worker.ReplayIntegrityError("truth-observation contract unavailable")

    def manifest_snapshot(self, manifest_id: str) -> worker.ManifestSnapshot:
        self.assert_manifest(manifest_id)
        position = min(self.manifest_calls, len(self._manifest_snapshots) - 1)
        self.manifest_calls += 1
        return self._manifest_snapshots[position]

    def members(self, manifest_id: str) -> list[worker.Member]:
        self.assert_manifest(manifest_id)
        return self._members

    def closure_hash(self, prefix: str) -> str:
        if prefix != CONFIG.closure_prefix:
            raise AssertionError(prefix)
        position = min(self.closure_calls, len(self._closure_hashes) - 1)
        self.closure_calls += 1
        return self._closure_hashes[position]

    def configuration_hash(self, source_id: str, prefix: str) -> str:
        if source_id in self._configuration_errors:
            raise RuntimeError("simulated connection loss")
        if prefix != CONFIG.closure_prefix:
            raise AssertionError(prefix)
        return "c" * 64

    def configuration_lock_hash(self, manifest_id: str, prefix: str) -> str:
        self.assert_manifest(manifest_id)
        if prefix != CONFIG.closure_prefix:
            raise AssertionError(prefix)
        position = min(
            self.configuration_lock_calls,
            len(self._configuration_lock_hashes) - 1,
        )
        self.configuration_lock_calls += 1
        return self._configuration_lock_hashes[position]

    def latest_attempt(
        self,
        source_id: str,
        config_hash: str,
        closure_hash: str,
        config: worker.WorkerConfig,
    ) -> worker.AttemptSnapshot | None:
        if config != CONFIG or config_hash != "c" * 64 or closure_hash != HASH_B:
            raise AssertionError("unexpected replay identity")
        return self._source_attempt.get(source_id)

    def claim(
        self,
        source_id: str,
        config_hash: str,
        closure_hash: str,
        config: worker.WorkerConfig,
    ) -> worker.ClaimSnapshot:
        self.claim_calls.append(source_id)
        existing = self._source_attempt.get(source_id)
        if existing is not None:
            return worker.ClaimSnapshot(existing.attempt_id, False)
        attempt_id = attempt(len(self._attempts) + 1)
        snapshot = worker.AttemptSnapshot(attempt_id, "running", None, None)
        self._source_attempt[source_id] = snapshot
        self._attempts[attempt_id] = snapshot
        return worker.ClaimSnapshot(attempt_id, True)

    def attempt(self, attempt_id: str) -> worker.AttemptSnapshot:
        return self._attempts[attempt_id]

    def defer(self, attempt_id: str) -> None:
        self._attempts[attempt_id] = replace(
            self._attempts[attempt_id],
            pending_outcome="deferred",
            pending_sqlstate=None,
        )
        self._sync_source(attempt_id)

    def finalize_interrupted(
        self, attempt_id: str, manifest_id: str, worker_identity: str
    ) -> None:
        self.assert_manifest(manifest_id)
        self.finalize_interrupted_calls.append(attempt_id)
        snapshot = self._attempts[attempt_id]
        if not snapshot.lease_expired or snapshot.pending_outcome is not None:
            raise RuntimeError("attempt is not an expired interrupted execution")
        self._attempts[attempt_id] = replace(
            snapshot,
            attempt_state="failed_terminal",
            pending_outcome=None,
            pending_sqlstate=None,
        )
        self._terminal_receipts[attempt_id] = "terminal_failure"
        self._sync_source(attempt_id)

    def execute(self, attempt_id: str, manifest_id: str, prefix: str) -> None:
        self.assert_manifest(manifest_id)
        self.execute_calls.append(attempt_id)
        source_id = self._source_for_attempt(attempt_id)
        pending, sqlstate = self._execute_outcomes.get(source_id, ("success", None))
        self._attempts[attempt_id] = replace(
            self._attempts[attempt_id],
            pending_outcome=pending,
            pending_sqlstate=sqlstate,
        )
        self._sync_source(attempt_id)

    def finalize(
        self, attempt_id: str, manifest_id: str, worker_identity: str
    ) -> None:
        self.assert_manifest(manifest_id)
        self.finalize_calls.append(attempt_id)
        if (
            self._attempts[attempt_id].attempt_state == "failed_retryable"
            and self._attempts[attempt_id].pending_outcome is None
        ):
            self._attempts[attempt_id] = replace(
                self._attempts[attempt_id],
                attempt_state="failed_terminal",
                pending_outcome=None,
                pending_sqlstate=None,
            )
            self._terminal_receipts[attempt_id] = "terminal_failure"
            self._sync_source(attempt_id)
            return
        self._finalize(attempt_id)

    def has_terminal_binding(self, attempt_id: str, outcome: str) -> bool:
        return attempt_id in self._bindings

    def diff_member(
        self, manifest_id: str, source_id: str, attempt_id: str
    ) -> None:
        self.assert_manifest(manifest_id)
        self.diff_calls.append(source_id)
        if source_id in self._diff_errors:
            raise RuntimeError("simulated diff ledger failure")

    def _finalize(self, attempt_id: str) -> None:
        snapshot = self._attempts[attempt_id]
        if snapshot.pending_outcome is None:
            raise AssertionError("finalized without a pending outcome")
        final_state = worker.FINAL_STATE_FOR_PENDING[snapshot.pending_outcome]
        self._attempts[attempt_id] = replace(
            snapshot,
            attempt_state=final_state,
            pending_outcome=None,
            pending_sqlstate=None,
        )
        self._sync_source(attempt_id)
        if final_state in (
            "succeeded",
            "rejected",
            "deferred_oversized",
        ):
            self._bindings.add(attempt_id)
        elif final_state == "timed_out":
            self._terminal_receipts[attempt_id] = "timeout"
        elif final_state == "failed_terminal":
            self._terminal_receipts[attempt_id] = "terminal_failure"

    def has_terminal_receipt(self, attempt_id: str, outcome: str) -> bool:
        expected = {
            "timed_out": "timeout",
            "failed_terminal": "terminal_failure",
        }.get(outcome)
        if expected is None:
            raise worker.ReplayIntegrityError("unsupported receipt-only outcome")
        return (
            self._terminal_receipts.get(attempt_id) == expected
            and attempt_id not in self._bindings
        )

    def _source_for_attempt(self, attempt_id: str) -> str:
        return next(
            source_id
            for source_id, snapshot in self._source_attempt.items()
            if snapshot.attempt_id == attempt_id
        )

    def _sync_source(self, attempt_id: str) -> None:
        source_id = self._source_for_attempt(attempt_id)
        self._source_attempt[source_id] = self._attempts[attempt_id]

    @staticmethod
    def assert_manifest(manifest_id: str) -> None:
        if manifest_id != MANIFEST_ID:
            raise AssertionError(manifest_id)


class TruthFirstWorkerTests(unittest.TestCase):
    def test_rejected_regression_is_quarantined_and_next_member_runs(self) -> None:
        first_attempt = worker.AttemptSnapshot(
            attempt(1), "running", "rejection", "P1A03"
        )
        members = [member(1, prior="admissible"), member(2)]
        store = FakeStore(
            members,
            attempts={source(1): first_attempt},
            execute_outcomes={source(2): ("success", None)},
        )

        result = worker.run_replay(store, CONFIG)

        # Expectation is audit metadata. The observed rejection binds, enters
        # quarantine, and does not prevent the next member from running.
        self.assertEqual(result.exit_code, 0)
        self.assertEqual(
            {
                key: result.report[key]
                for key in (
                    "source_total",
                    "accounted",
                    "unaccounted",
                    "success",
                    "non_success",
                )
            },
            {
                "source_total": 2,
                "accounted": 2,
                "unaccounted": 0,
                "success": 1,
                "non_success": 1,
            },
        )
        self.assertEqual(result.report["terminal_tallies"], {
            "completed": 1,
            "rejected": 1,
        })
        self.assertEqual(result.report["expectation_mismatches"], 1)
        self.assertEqual(result.report["prior_admissible_regressions"], 1)
        self.assertEqual(result.report["ledger_integrity_errors"], 0)
        self.assertEqual(result.report["quarantine_warning_10_percent"], 1)
        self.assertEqual(result.report["quarantine_review_15_percent"], 1)
        self.assertEqual(store.execute_calls, [store._source_attempt[source(2)].attempt_id])
        self.assertEqual(store.finalize_calls, [attempt(1), attempt(2)])
        self.assertIn(attempt(1), store._bindings)
        self.assertEqual(store.diff_calls, [])

    def test_historical_deferral_expectation_does_not_skip_parser(self) -> None:
        source_id = source(1)
        store = FakeStore(
            [member(1, expected="deferred_oversized")],
            execute_outcomes={source_id: ("success", None)},
        )

        result = worker.run_replay(store, CONFIG)

        self.assertEqual(result.exit_code, 0)
        self.assertEqual(len(store.execute_calls), 1)
        self.assertEqual(result.report["terminal_tallies"], {
            "completed": 1,
        })
        self.assertEqual(result.report["expectation_mismatches"], 1)
        self.assertEqual(result.report["ledger_integrity_errors"], 0)

    def test_existing_retryable_observation_is_quarantined_without_retry(self) -> None:
        legacy = worker.AttemptSnapshot(
            attempt(1), "failed_retryable", None, "40P01"
        )
        store = FakeStore(
            [member(1), member(2)],
            attempts={source(1): legacy},
            execute_outcomes={source(2): ("success", None)},
        )

        result = worker.run_replay(store, CONFIG)

        self.assertEqual(result.exit_code, 0)
        self.assertEqual(store.claim_calls, [source(1), source(2)])
        self.assertEqual(len(store.execute_calls), 1)
        self.assertNotIn(attempt(1), store.execute_calls)
        self.assertIn(attempt(1), store.finalize_calls)
        self.assertEqual(
            result.report["terminal_tallies"],
            {"completed": 1, "failed_terminal": 1},
        )
        self.assertEqual(result.report["infrastructure_errors"], 0)

    def test_legacy_retry_chain_is_disclosed_and_never_executed(self) -> None:
        retried = worker.AttemptSnapshot(
            attempt(2),
            "succeeded",
            None,
            None,
            retry_seq=1,
            identity_attempt_count=2,
        )
        store = FakeStore([member(1)], attempts={source(1): retried})

        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            result = worker.run_replay(store, CONFIG)

        self.assertEqual(result.exit_code, 1)
        self.assertEqual(result.report["accounted"], 0)
        self.assertEqual(result.report["unaccounted"], 1)
        self.assertEqual(result.report["ledger_integrity_errors"], 1)
        self.assertIn("legacy retry chain", stderr.getvalue())
        self.assertEqual(store.claim_calls, [])
        self.assertEqual(store.execute_calls, [])
        self.assertEqual(store.finalize_calls, [])

    def test_live_preexisting_attempt_is_not_reexecuted_and_later_member_runs(
        self,
    ) -> None:
        interrupted = worker.AttemptSnapshot(
            attempt(1), "running", None, None, lease_expired=False
        )
        store = FakeStore(
            [member(1), member(2)],
            attempts={source(1): interrupted},
            execute_outcomes={source(2): ("success", None)},
        )

        with contextlib.redirect_stderr(io.StringIO()):
            result = worker.run_replay(store, CONFIG)

        self.assertEqual(result.exit_code, 1)
        self.assertEqual(result.report["accounted"], 1)
        self.assertEqual(result.report["unaccounted"], 1)
        self.assertNotIn(attempt(1), store.execute_calls)
        self.assertEqual(len(store.execute_calls), 1)

    def test_expired_preexisting_attempt_becomes_ambiguous_quarantine_without_rerun(
        self,
    ) -> None:
        interrupted = worker.AttemptSnapshot(
            attempt(1), "running", None, None, lease_expired=True
        )
        store = FakeStore([member(1)], attempts={source(1): interrupted})

        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            result = worker.run_replay(store, CONFIG)

        self.assertEqual(result.exit_code, 0)
        self.assertEqual(store.execute_calls, [])
        self.assertEqual(store.finalize_interrupted_calls, [attempt(1)])
        self.assertEqual(result.report["terminal_tallies"], {"failed_terminal": 1})
        self.assertEqual(
            [event["checkpoint"] for event in result.report["checkpoint_events"]],
            ["warning_10_percent", "generalized_review_15_percent"],
        )
        emitted = [json.loads(line) for line in stderr.getvalue().splitlines()]
        self.assertEqual(
            [event["checkpoint"] for event in emitted],
            ["warning_10_percent", "generalized_review_15_percent"],
        )
        self.assertTrue(all(event["processing_continues"] for event in emitted))
        self.assertEqual(emitted[1]["review_scope"], "entire_quarantine_stack")
        self.assertEqual(
            emitted[1]["pattern_dimensions"],
            [
                "failure_class",
                "document_class",
                "provider_family",
                "media_type",
            ],
        )

    def test_pending_outcome_finalizes_without_second_execution(self) -> None:
        staged = worker.AttemptSnapshot(attempt(1), "running", "rejection", "P1A03")
        store = FakeStore(
            [member(1, expected="rejected", failure_code="P1A03")],
            attempts={source(1): staged},
        )

        result = worker.run_replay(store, CONFIG)

        self.assertEqual(result.exit_code, 0)
        self.assertEqual(store.execute_calls, [])
        self.assertEqual(store.finalize_calls, [attempt(1)])
        self.assertEqual(result.report["terminal_tallies"], {"rejected": 1})

    def test_existing_timeout_is_counted_without_reclaim_or_retry(self) -> None:
        timed_out = worker.AttemptSnapshot(attempt(1), "timed_out", None, None)
        store = FakeStore(
            [member(1)],
            attempts={source(1): timed_out},
        )

        result = worker.run_replay(store, CONFIG)

        self.assertEqual(result.exit_code, 0)
        self.assertEqual(store.claim_calls, [source(1)])
        self.assertEqual(store.execute_calls, [])
        self.assertEqual(result.report["terminal_tallies"], {"timed_out": 1})
        self.assertEqual(result.report["expectation_mismatches"], 1)

    def test_infrastructure_error_continues_but_leaves_unaccounted(self) -> None:
        members = [member(1), member(2)]
        store = FakeStore(
            members,
            execute_outcomes={source(2): ("success", None)},
            configuration_errors={source(1)},
        )

        with contextlib.redirect_stderr(io.StringIO()):
            result = worker.run_replay(store, CONFIG)

        self.assertEqual(result.exit_code, 1)
        self.assertEqual(result.report["source_total"], 2)
        self.assertEqual(result.report["accounted"], 1)
        self.assertEqual(result.report["unaccounted"], 1)
        self.assertEqual(result.report["infrastructure_errors"], 1)
        self.assertEqual(len(store.execute_calls), 1)

    def test_manifest_drift_after_sweep_is_integrity_failure(self) -> None:
        snapshots = [
            worker.ManifestSnapshot(1, 100, HASH_A),
            worker.ManifestSnapshot(1, 100, HASH_B),
        ]
        terminal = worker.AttemptSnapshot(attempt(1), "timed_out", None, None)
        store = FakeStore(
            [member(1)],
            attempts={source(1): terminal},
            manifest_snapshots=snapshots,
        )

        result = worker.run_replay(store, CONFIG)

        self.assertEqual(result.exit_code, 1)
        self.assertFalse(result.report["manifest_verified_after"])
        self.assertEqual(result.report["ledger_integrity_errors"], 1)

    def test_manifest_header_count_mismatch_blocks_before_any_claim(self) -> None:
        snapshots = [
            worker.ManifestSnapshot(2, 100, HASH_A),
            worker.ManifestSnapshot(2, 100, HASH_A),
        ]
        store = FakeStore([member(1)], manifest_snapshots=snapshots)

        with self.assertRaisesRegex(
            worker.ReplayIntegrityError, "member rows do not match"
        ):
            worker.run_replay(store, CONFIG)

        self.assertEqual(store.claim_calls, [])
        self.assertEqual(store.execute_calls, [])

    def test_missing_truth_observation_contract_blocks_before_manifest_read(self) -> None:
        store = FakeStore([member(1)], contract_error=True)

        with self.assertRaisesRegex(
            worker.ReplayIntegrityError, "truth-observation contract unavailable"
        ):
            worker.run_replay(store, CONFIG)

        self.assertEqual(store.contract_calls, 1)
        self.assertEqual(store.manifest_calls, 0)
        self.assertEqual(store.claim_calls, [])
        self.assertEqual(store.execute_calls, [])

    def test_configuration_source_lock_drift_fails_after_complete_sweep(self) -> None:
        terminal = worker.AttemptSnapshot(attempt(1), "timed_out", None, None)
        store = FakeStore(
            [member(1)],
            attempts={source(1): terminal},
            configuration_lock_hashes=["d" * 64, "e" * 64],
        )

        result = worker.run_replay(store, CONFIG)

        self.assertEqual(result.exit_code, 1)
        self.assertTrue(result.report["complete_accounting"])
        self.assertFalse(result.report["source_lock_stable"])

    def test_completed_member_without_binding_fails_ledger_integrity(self) -> None:
        terminal = worker.AttemptSnapshot(attempt(1), "succeeded", None, None)
        store = FakeStore(
            [member(1), member(2)],
            attempts={source(1): terminal},
            execute_outcomes={source(2): ("success", None)},
        )

        result = worker.run_replay(store, CONFIG)

        self.assertEqual(result.exit_code, 1)
        self.assertEqual(result.report["accounted"], 1)
        self.assertEqual(result.report["unaccounted"], 1)
        self.assertFalse(result.report["complete_accounting"])
        self.assertEqual(result.report["terminal_tallies"], {"completed": 1})
        self.assertEqual(result.report["ledger_integrity_errors"], 1)
        self.assertEqual(len(store.execute_calls), 1)

    def test_failure_state_without_exact_receipt_is_unaccounted_but_sweep_continues(
        self,
    ) -> None:
        cases = (
            ("timed_out", {attempt(1): "terminal_failure"}),
            ("failed_terminal", {}),
        )
        for state, receipts in cases:
            with self.subTest(state=state):
                terminal = worker.AttemptSnapshot(attempt(1), state, None, None)
                store = FakeStore(
                    [member(1), member(2)],
                    attempts={source(1): terminal},
                    execute_outcomes={source(2): ("success", None)},
                    terminal_receipts=receipts,
                )

                with contextlib.redirect_stderr(io.StringIO()):
                    result = worker.run_replay(store, CONFIG)

                self.assertEqual(result.exit_code, 1)
                self.assertEqual(result.report["accounted"], 1)
                self.assertEqual(result.report["unaccounted"], 1)
                self.assertFalse(result.report["complete_accounting"])
                self.assertEqual(result.report["terminal_tallies"], {"completed": 1})
                self.assertEqual(result.report["ledger_integrity_errors"], 1)
                self.assertEqual(len(store.execute_calls), 1)

    def test_diff_failure_keeps_later_members_running_and_fails_evidence(self) -> None:
        members = [member(1, prior="admissible"), member(2)]
        store = FakeStore(
            members,
            execute_outcomes={
                source(1): ("success", None),
                source(2): ("success", None),
            },
            diff_errors={source(1)},
        )

        with contextlib.redirect_stderr(io.StringIO()):
            result = worker.run_replay(store, CONFIG)

        self.assertEqual(result.exit_code, 1)
        self.assertEqual(result.report["accounted"], 2)
        self.assertEqual(result.report["success"], 2)
        self.assertEqual(result.report["ledger_integrity_errors"], 1)
        self.assertEqual(len(store.execute_calls), 2)

    def test_thresholds_use_exact_whole_corpus_denominator(self) -> None:
        cases = (
            (999, 10_000, (0, 0)),
            (1_000, 10_000, (1, 0)),
            (1_499, 10_000, (1, 0)),
            (1_500, 10_000, (1, 1)),
        )
        for non_success, source_total, expected in cases:
            with self.subTest(non_success=non_success):
                self.assertEqual(
                    worker.quarantine_threshold_flags(non_success, source_total),
                    expected,
                )

    def test_psql_keeps_database_url_out_of_process_arguments(self) -> None:
        database_url = "postgresql://truth:do-not-leak@example.invalid/rosetta"
        completed = subprocess.CompletedProcess([], 0, stdout=b"1\n", stderr=b"")
        with mock.patch.dict(
            os.environ,
            {"ROSETTA_REPLAY_DATABASE_URL": database_url},
            clear=False,
        ), mock.patch.object(worker.subprocess, "run", return_value=completed) as run:
            result = worker.Psql(database_url, "psql17").tx("select 1;")

        self.assertEqual(result, "1")
        args = run.call_args.args[0]
        environment = run.call_args.kwargs["env"]
        self.assertNotIn(database_url, args)
        self.assertEqual(
            args, ["psql17", "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", "select 1;"]
        )
        self.assertEqual(environment["PGDATABASE"], database_url)
        self.assertNotIn("ROSETTA_REPLAY_DATABASE_URL", environment)

    def test_sql_claim_uses_only_truth_observation_contract(self) -> None:
        class RecordingPsql:
            def __init__(self) -> None:
                self.sql = ""

            def tx(self, sql: str) -> str:
                self.sql = sql
                return (
                    '{"attempt_id":"' + attempt(1)
                    + '","created":true,"attempt_state":"running"}'
                )

        database = RecordingPsql()
        store = worker.SqlReplayStore(database)

        claimed = store.claim(source(1), "c" * 64, HASH_B, CONFIG)

        self.assertEqual(claimed, worker.ClaimSnapshot(attempt(1), True))
        self.assertIn("truth_observation_claim", database.sql)
        self.assertIn(MANIFEST_ID, database.sql)
        self.assertNotIn("replay_claim(", database.sql)

    def test_sql_execute_and_finalize_use_only_truth_observation_contract(self) -> None:
        class RecordingPsql:
            def __init__(self) -> None:
                self.sql: list[str] = []

            def tx(self, sql: str) -> str:
                self.sql.append(sql)
                return "00000000-0000-4000-8000-000000000001"

        database = RecordingPsql()
        store = worker.SqlReplayStore(database)

        store.execute(attempt(1), MANIFEST_ID, CONFIG.closure_prefix)
        store.finalize(attempt(1), MANIFEST_ID, CONFIG.worker_identity)

        combined = "\n".join(database.sql)
        self.assertIn("truth_observation_execute", combined)
        self.assertIn("truth_observation_finalize", combined)
        self.assertNotIn("rosetta_replay.replay_execute(", combined)
        self.assertNotIn("rosetta_replay.finalize_attempt(", combined)

    def test_sql_rejected_binding_accepts_runless_or_exact_failed_run(self) -> None:
        class RecordingPsql:
            def __init__(self) -> None:
                self.sql = ""

            def tx(self, sql: str) -> str:
                self.sql = sql
                return "true"

        database = RecordingPsql()
        store = worker.SqlReplayStore(database)

        self.assertTrue(store.has_terminal_binding(attempt(1), "rejected"))

        self.assertIn("and nullif(b.failure_code,'') is not null", database.sql)
        self.assertIn("and ((b.extraction_run_id is null", database.sql)
        self.assertIn("and b.output_content_hash is null", database.sql)
        self.assertIn("and b.rule_manifest_hash is null", database.sql)
        self.assertIn("or (b.extraction_run_id is not null", database.sql)
        self.assertIn("and b.extraction_run_id=er.id", database.sql)
        self.assertIn(
            "and b.output_content_hash is not distinct from er.output_content_hash",
            database.sql,
        )
        self.assertIn(
            "and b.rule_manifest_hash is not distinct from er.rule_manifest_hash",
            database.sql,
        )
        self.assertIn("and er.run_status='failed'", database.sql)
        self.assertIn("and er.admissibility_state='rejected'", database.sql)

    def test_sql_deferred_binding_requires_no_extraction_run(self) -> None:
        class RecordingPsql:
            def __init__(self) -> None:
                self.sql = ""

            def tx(self, sql: str) -> str:
                self.sql = sql
                return "true"

        database = RecordingPsql()
        store = worker.SqlReplayStore(database)

        self.assertTrue(
            store.has_terminal_binding(attempt(1), "deferred_oversized")
        )

        self.assertIn("and b.extraction_run_id is null", database.sql)
        self.assertIn("and b.output_content_hash is null", database.sql)
        self.assertIn("and b.rule_manifest_hash is null", database.sql)
        self.assertIn("and b.failure_code is null", database.sql)
        self.assertNotIn("and er.run_status='failed'", database.sql)

    def test_sql_failure_receipts_are_exact_and_have_no_run_binding(self) -> None:
        class RecordingPsql:
            def __init__(self) -> None:
                self.sql: list[str] = []

            def tx(self, sql: str) -> str:
                self.sql.append(sql)
                return "true"

        database = RecordingPsql()
        store = worker.SqlReplayStore(database)

        self.assertTrue(store.has_terminal_receipt(attempt(1), "timed_out"))
        self.assertTrue(store.has_terminal_receipt(attempt(2), "failed_terminal"))

        timeout_sql, terminal_sql = database.sql
        self.assertIn("attempt.attempt_state='timed_out'", timeout_sql)
        self.assertIn("receipt.receipt_kind='timeout'", timeout_sql)
        self.assertIn("receipt.failure_class='timeout'", timeout_sql)
        self.assertIn("attempt.attempt_state='failed_terminal'", terminal_sql)
        self.assertIn("receipt.receipt_kind='terminal_failure'", terminal_sql)
        self.assertIn("receipt.failure_class is not null", terminal_sql)
        for sql in database.sql:
            self.assertIn("nullif(receipt.sqlstate,'') is not null", sql)
            self.assertIn("receipt.is_retryable is false", sql)
            self.assertIn("from rosetta_replay.replay_run_binding binding", sql)
            self.assertIn("where binding.attempt_id=attempt.attempt_id", sql)

    def test_latest_attempt_excludes_campaign_attempts(self) -> None:
        class RecordingPsql:
            def __init__(self) -> None:
                self.sql = ""

            def tx(self, sql: str) -> str:
                self.sql = sql
                return ""

        database = RecordingPsql()
        store = worker.SqlReplayStore(database)

        self.assertIsNone(store.latest_attempt(source(1), "c" * 64, HASH_B, CONFIG))
        self.assertIn("campaign_id is null", database.sql)

    def test_legacy_positional_database_url_is_rejected_without_echo(self) -> None:
        secrets = (
            "postgresql://truth:secret@example.invalid/rosetta",
            "user=truth password=TOPSECRET host=example.invalid dbname=rosetta",
        )
        for secret in secrets:
            for legacy_manifest in (MANIFEST_ID, "malformed-manifest"):
                with self.subTest(secret=secret.split("=")[0], manifest=legacy_manifest):
                    argv = [
                        "worker.py",
                        secret,
                        legacy_manifest,
                        CONFIG.closure_prefix,
                        CONFIG.engine_version,
                        CONFIG.rule_set_version,
                        CONFIG.worker_identity,
                    ]
                    stderr = io.StringIO()

                    with contextlib.redirect_stderr(stderr):
                        try:
                            parsed = worker.parse_config(argv)
                        except worker.ReplayIntegrityError as exc:
                            parsed = None
                            print(exc, file=sys.stderr)

                    self.assertIsNone(parsed)
                    self.assertNotIn(secret, stderr.getvalue())
                    self.assertNotIn("TOPSECRET", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
