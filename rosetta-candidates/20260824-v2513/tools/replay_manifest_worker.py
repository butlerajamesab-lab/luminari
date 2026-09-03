#!/usr/bin/env python3
"""Replay every member of a sealed corpus without hiding non-successes.

Each database operation is a distinct psql process and committed transaction:
  truth-observation claim -> execute -> observed finalize -> optional member diff.

An observed rejection, deferral, timeout, or deterministic terminal failure is
an honest corpus disposition. It is counted and the sweep continues. The
worker exits nonzero only when the corpus is not fully accounted for, the
sealed inputs drift, or infrastructure/ledger integrity fails.

Usage:
  ROSETTA_REPLAY_DATABASE_URL=... python tools/replay_manifest_worker.py \
    MANIFEST_UUID v2513_ rosetta-v3-deterministic-sql-2.5.13 \
    rosetta-five-layer-structural-correctness-2.5.13 worker-name [PSQL_BIN]

Database credentials are intentionally accepted only through
``ROSETTA_REPLAY_DATABASE_URL`` and are passed to psql through libpq's
environment, never as a process argument.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from typing import Protocol


UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.I,
)
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
PREFIX_RE = re.compile(r"^v2513_$")
IDENTITY_RE = re.compile(r"^[A-Za-z0-9_.:-]+$")

TERMINAL_STATE_OUTCOME = {
    "succeeded": "completed",
    "rejected": "rejected",
    "deferred_oversized": "deferred_oversized",
    "timed_out": "timed_out",
    "failed_terminal": "failed_terminal",
}
PENDING_OUTCOME = {
    "success": "completed",
    "rejection": "rejected",
    "deferred": "deferred_oversized",
    "timeout": "timed_out",
    "terminal_failure": "failed_terminal",
    "retryable_failure": "retry_exhausted",
}
FINAL_STATE_FOR_PENDING = {
    "success": "succeeded",
    "rejection": "rejected",
    "deferred": "deferred_oversized",
    "timeout": "timed_out",
    "terminal_failure": "failed_terminal",
    # truth_observation_finalize converts an old staged retryable outcome into
    # a terminal quarantine before sealing it.
    "retryable_failure": "failed_terminal",
}


class ReplayIntegrityError(RuntimeError):
    """Raised when source-locked replay evidence is missing or contradictory."""


def literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def validate(label: str, value: str, pattern: re.Pattern[str]) -> str:
    if not pattern.fullmatch(value):
        # Command-line values can be misplaced legacy connection strings.
        # Never reflect a rejected value because it may contain credentials.
        raise ReplayIntegrityError(f"invalid {label}")
    return value


def _json_object(label: str, raw: str) -> dict[str, object]:
    lines = raw.splitlines()
    if not lines:
        raise ReplayIntegrityError(f"{label} was not found")
    try:
        value = json.loads(lines[-1])
    except json.JSONDecodeError as exc:
        raise ReplayIntegrityError(f"{label} is not valid JSON") from exc
    if not isinstance(value, dict):
        raise ReplayIntegrityError(f"{label} is not a JSON object")
    return value


def _required_string(value: dict[str, object], key: str, *, label: str) -> str:
    item = value.get(key)
    if not isinstance(item, str) or not item:
        raise ReplayIntegrityError(f"{label} has invalid {key}")
    return item


@dataclass(frozen=True, repr=False)
class Psql:
    database_url: str
    binary: str = "psql"

    def tx(self, sql: str) -> str:
        environment = os.environ.copy()
        # Do not forward the application-specific secret name to the child.
        # PGDATABASE accepts a libpq connection URI/conninfo string.
        environment.pop("ROSETTA_REPLAY_DATABASE_URL", None)
        environment["PGDATABASE"] = self.database_url
        proc = subprocess.run(
            [self.binary, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            env=environment,
        )
        if proc.returncode:
            raise RuntimeError(proc.stderr.decode("utf-8", "replace")[:4000])
        return proc.stdout.decode("utf-8", "strict").strip()


@dataclass(frozen=True)
class WorkerConfig:
    manifest_id: str
    closure_prefix: str
    engine_version: str
    rule_set_version: str
    worker_identity: str


@dataclass(frozen=True)
class ManifestSnapshot:
    member_count: int
    total_bytes: int
    manifest_sha256: str


@dataclass(frozen=True)
class Member:
    ordinal: int
    source_registry_id: str
    expected_terminal_outcome: str
    expected_failure_code: str | None
    prior_output_state: str


@dataclass(frozen=True)
class AttemptSnapshot:
    attempt_id: str
    attempt_state: str
    pending_outcome: str | None
    pending_sqlstate: str | None
    lease_expired: bool = False
    retry_seq: int = 0
    identity_attempt_count: int = 1


@dataclass(frozen=True)
class ClaimSnapshot:
    attempt_id: str
    created: bool


class ReplayStore(Protocol):
    def assert_truth_observation_contract(self) -> None: ...

    def manifest_snapshot(self, manifest_id: str) -> ManifestSnapshot: ...

    def members(self, manifest_id: str) -> list[Member]: ...

    def closure_hash(self, prefix: str) -> str: ...

    def configuration_lock_hash(self, manifest_id: str, prefix: str) -> str: ...

    def configuration_hash(self, source: str, prefix: str) -> str: ...

    def latest_attempt(
        self, source: str, config_hash: str, closure_hash: str, config: WorkerConfig
    ) -> AttemptSnapshot | None: ...

    def claim(
        self, source: str, config_hash: str, closure_hash: str, config: WorkerConfig
    ) -> ClaimSnapshot: ...

    def attempt(self, attempt_id: str) -> AttemptSnapshot: ...

    def execute(self, attempt_id: str, manifest_id: str, prefix: str) -> None: ...

    def finalize_interrupted(
        self, attempt_id: str, manifest_id: str, worker: str
    ) -> None: ...

    def finalize(self, attempt_id: str, manifest_id: str, worker: str) -> None: ...

    def has_terminal_binding(self, attempt_id: str, outcome: str) -> bool: ...

    def has_terminal_receipt(self, attempt_id: str, outcome: str) -> bool: ...

    def diff_member(self, manifest_id: str, source: str, attempt_id: str) -> None: ...


@dataclass(frozen=True)
class SqlReplayStore:
    db: Psql

    def assert_truth_observation_contract(self) -> None:
        value = _json_object(
            "truth-observation SQL contract",
            self.db.tx(
                "select jsonb_build_object("
                "'configuration',to_regprocedure("
                "'rosetta_replay.truth_observation_configuration_hash(uuid)') is not null,"
                "'claim',to_regprocedure("
                "'rosetta_replay.truth_observation_claim(uuid,uuid,text,text,text,text,text,text,interval)') is not null,"
                "'execute',to_regprocedure("
                "'rosetta_replay.truth_observation_execute(uuid,uuid,text,integer)') is not null,"
                "'finalize',to_regprocedure("
                "'rosetta_replay.truth_observation_finalize(uuid,uuid,text)') is not null,"
                "'observed_binding',coalesce(position('expectation_is_advisory' in "
                "pg_get_functiondef(to_regprocedure("
                "'rosetta_replay.replay_finalize(uuid,text)')))>0,false))::text;"
            ),
        )
        if any(value.get(key) is not True for key in (
            "configuration", "claim", "execute", "finalize", "observed_binding"
        )):
            raise ReplayIntegrityError(
                "migration 07 truth-observation SQL contract is not installed"
            )

    def manifest_snapshot(self, manifest_id: str) -> ManifestSnapshot:
        value = _json_object(
            "sealed manifest",
            self.db.tx(
                "select jsonb_build_object("
                "'member_count',m.member_count,'total_bytes',m.total_bytes,"
                "'manifest_sha256',m.manifest_sha256,"
                "'verified',rosetta_replay.verify_sealed_manifest(m.manifest_id))::text "
                "from rosetta_replay.sealed_corpus_manifest m "
                f"where m.manifest_id={literal(manifest_id)}::uuid;"
            ),
        )
        if value.get("verified") is not True:
            raise ReplayIntegrityError("sealed manifest verification failed")
        member_count = value.get("member_count")
        total_bytes = value.get("total_bytes")
        manifest_sha256 = value.get("manifest_sha256")
        if not isinstance(member_count, int) or member_count <= 0:
            raise ReplayIntegrityError("sealed manifest member_count must be positive")
        if not isinstance(total_bytes, int) or total_bytes < 0:
            raise ReplayIntegrityError("sealed manifest total_bytes is invalid")
        if not isinstance(manifest_sha256, str) or not SHA256_RE.fullmatch(
            manifest_sha256
        ):
            raise ReplayIntegrityError("sealed manifest sha256 is invalid")
        return ManifestSnapshot(member_count, total_bytes, manifest_sha256)

    def members(self, manifest_id: str) -> list[Member]:
        rows = self.db.tx(
            "select jsonb_build_object("
            "'ordinal',ordinal,'source_registry_id',source_registry_id,"
            "'expected_terminal_outcome',expected_terminal_outcome,"
            "'expected_failure_code',expected_failure_code,"
            "'prior_output_state',prior_output_state)::text "
            "from rosetta_replay.sealed_corpus_member "
            f"where manifest_id={literal(manifest_id)}::uuid order by ordinal;"
        ).splitlines()
        members: list[Member] = []
        for raw in rows:
            value = _json_object("sealed manifest member", raw)
            ordinal = value.get("ordinal")
            if not isinstance(ordinal, int) or ordinal <= 0:
                raise ReplayIntegrityError("sealed manifest member has invalid ordinal")
            source = validate(
                "source UUID",
                _required_string(
                    value, "source_registry_id", label="sealed manifest member"
                ),
                UUID_RE,
            )
            expected = _required_string(
                value, "expected_terminal_outcome", label="sealed manifest member"
            )
            if expected not in ("completed", "rejected", "deferred_oversized"):
                raise ReplayIntegrityError(
                    "sealed manifest member has invalid expected_terminal_outcome"
                )
            failure_code = value.get("expected_failure_code")
            if failure_code is not None and not isinstance(failure_code, str):
                raise ReplayIntegrityError(
                    "sealed manifest member has invalid expected_failure_code"
                )
            if (expected == "rejected") != bool(failure_code):
                raise ReplayIntegrityError(
                    "sealed manifest member has inconsistent expected failure code"
                )
            prior = _required_string(
                value, "prior_output_state", label="sealed manifest member"
            )
            if prior not in ("none", "admissible"):
                raise ReplayIntegrityError(
                    "sealed manifest member has invalid prior_output_state"
                )
            members.append(Member(ordinal, source, expected, failure_code, prior))
        return members

    def closure_hash(self, prefix: str) -> str:
        value = self.db.tx(
            f"select rosetta_replay.closure_sha256({literal(prefix)});"
        ).splitlines()
        if not value or not SHA256_RE.fullmatch(value[-1]):
            raise ReplayIntegrityError("closure hash is missing or invalid")
        return value[-1]

    def configuration_lock_hash(self, manifest_id: str, prefix: str) -> str:
        value = self.db.tx(
            "select encode(extensions.digest(convert_to(coalesce(string_agg("
            "m.source_registry_id::text||'|'||"
            "rosetta_replay.truth_observation_configuration_hash("
            "m.source_registry_id),chr(10) "
            "order by m.ordinal),''),'UTF8'),'sha256'),'hex') "
            "from rosetta_replay.sealed_corpus_member m "
            f"where m.manifest_id={literal(manifest_id)}::uuid;"
        ).splitlines()
        if not value or not SHA256_RE.fullmatch(value[-1]):
            raise ReplayIntegrityError(
                "sealed-corpus configuration lock hash is missing or invalid"
            )
        return value[-1]

    def configuration_hash(self, source: str, prefix: str) -> str:
        value = self.db.tx(
            "select rosetta_replay.truth_observation_configuration_hash("
            f"{literal(source)}::uuid);"
        ).splitlines()
        if not value or not SHA256_RE.fullmatch(value[-1]):
            raise ReplayIntegrityError("configuration hash is missing or invalid")
        return value[-1]

    def latest_attempt(
        self, source: str, config_hash: str, closure_hash: str, config: WorkerConfig
    ) -> AttemptSnapshot | None:
        raw = self.db.tx(
            "select jsonb_build_object("
            "'attempt_id',candidate.attempt_id,"
            "'attempt_state',candidate.attempt_state,"
            "'pending_outcome',candidate.pending_outcome,"
            "'pending_sqlstate',candidate.pending_sqlstate,"
            "'lease_expired',candidate.lease_expires_at is not null "
            "and candidate.lease_expires_at<=clock_timestamp(),"
            "'retry_seq',candidate.retry_seq,"
            "'identity_attempt_count',(select count(*) "
            "from rosetta_replay.replay_attempt sibling "
            "where sibling.campaign_id is null "
            "and sibling.attempt_identity=candidate.attempt_identity))::text "
            "from rosetta_replay.replay_attempt candidate "
            f"where candidate.source_registry_id={literal(source)}::uuid "
            f"and candidate.engine_version={literal(config.engine_version)} "
            f"and candidate.rule_set_version={literal(config.rule_set_version)} "
            f"and candidate.config_hash={literal(config_hash)} "
            f"and candidate.closure_hash={literal(closure_hash)} "
            "and candidate.campaign_id is null "
            "order by candidate.retry_seq desc limit 1;"
        )
        if not raw:
            return None
        return self._attempt_from_value(_json_object("latest replay attempt", raw))

    def claim(
        self, source: str, config_hash: str, closure_hash: str, config: WorkerConfig
    ) -> ClaimSnapshot:
        value = _json_object(
            "truth-observation claim",
            self.db.tx(
                "select rosetta_replay.truth_observation_claim("
                f"{literal(config.manifest_id)}::uuid,{literal(source)}::uuid,"
                f"{literal(config.closure_prefix)},{literal(config.engine_version)},"
                f"{literal(config.rule_set_version)},{literal(config_hash)},"
                f"{literal(closure_hash)},{literal(config.worker_identity)})::text;"
            ),
        )
        attempt_id = validate(
            "attempt UUID",
            _required_string(value, "attempt_id", label="truth-observation claim"),
            UUID_RE,
        )
        created = value.get("created")
        if not isinstance(created, bool):
            raise ReplayIntegrityError("truth-observation claim has invalid created flag")
        return ClaimSnapshot(attempt_id, created)

    def attempt(self, attempt_id: str) -> AttemptSnapshot:
        raw = self.db.tx(
            "select jsonb_build_object("
            "'attempt_id',candidate.attempt_id,"
            "'attempt_state',candidate.attempt_state,"
            "'pending_outcome',candidate.pending_outcome,"
            "'pending_sqlstate',candidate.pending_sqlstate,"
            "'lease_expired',candidate.lease_expires_at is not null "
            "and candidate.lease_expires_at<=clock_timestamp(),"
            "'retry_seq',candidate.retry_seq,"
            "'identity_attempt_count',(select count(*) "
            "from rosetta_replay.replay_attempt sibling "
            "where sibling.campaign_id is null "
            "and sibling.attempt_identity=candidate.attempt_identity))::text "
            "from rosetta_replay.replay_attempt candidate "
            f"where candidate.attempt_id={literal(attempt_id)}::uuid;"
        )
        return self._attempt_from_value(_json_object("replay attempt", raw))

    @staticmethod
    def _attempt_from_value(value: dict[str, object]) -> AttemptSnapshot:
        attempt_id = validate(
            "attempt UUID",
            _required_string(value, "attempt_id", label="replay attempt"),
            UUID_RE,
        )
        state = _required_string(value, "attempt_state", label="replay attempt")
        pending = value.get("pending_outcome")
        pending_sqlstate = value.get("pending_sqlstate")
        lease_expired = value.get("lease_expired", False)
        retry_seq = value.get("retry_seq", 0)
        identity_attempt_count = value.get("identity_attempt_count", 1)
        if pending is not None and not isinstance(pending, str):
            raise ReplayIntegrityError("replay attempt has invalid pending_outcome")
        if pending_sqlstate is not None and not isinstance(pending_sqlstate, str):
            raise ReplayIntegrityError("replay attempt has invalid pending_sqlstate")
        if not isinstance(lease_expired, bool):
            raise ReplayIntegrityError("replay attempt has invalid lease state")
        if not isinstance(retry_seq, int) or retry_seq < 0:
            raise ReplayIntegrityError("replay attempt has invalid retry_seq")
        if (
            not isinstance(identity_attempt_count, int)
            or identity_attempt_count <= 0
        ):
            raise ReplayIntegrityError(
                "replay attempt has invalid identity attempt count"
            )
        return AttemptSnapshot(
            attempt_id,
            state,
            pending,
            pending_sqlstate,
            lease_expired,
            retry_seq,
            identity_attempt_count,
        )

    def execute(self, attempt_id: str, manifest_id: str, prefix: str) -> None:
        # The SET is a distinct SQL statement before the parser SELECT. That
        # caller-armed boundary is effective; changing the GUC inside an
        # already-running parser function would not be.
        self.db.tx(
            "set statement_timeout='120s';"
            "select rosetta_replay.truth_observation_execute("
            f"{literal(attempt_id)}::uuid,{literal(manifest_id)}::uuid,"
            f"{literal(prefix)},120000);"
        )

    def finalize_interrupted(
        self, attempt_id: str, manifest_id: str, worker: str
    ) -> None:
        raw = self.db.tx(
            "select rosetta_replay.truth_observation_finalize("
            f"{literal(attempt_id)}::uuid,{literal(manifest_id)}::uuid,"
            f"{literal(worker)});"
        )
        if not raw:
            raise RuntimeError("interrupted attempt was not terminally quarantined")

    def finalize(self, attempt_id: str, manifest_id: str, worker: str) -> None:
        self.db.tx(
            "select rosetta_replay.truth_observation_finalize("
            f"{literal(attempt_id)}::uuid,{literal(manifest_id)}::uuid,"
            f"{literal(worker)});"
        )

    def has_terminal_binding(self, attempt_id: str, outcome: str) -> bool:
        if outcome not in ("completed", "rejected", "deferred_oversized"):
            raise ReplayIntegrityError("unsupported bindable terminal outcome")
        run_identity = (
            "and b.extraction_run_id=er.id "
            "and b.output_content_hash is not distinct from er.output_content_hash "
            "and b.rule_manifest_hash is not distinct from er.rule_manifest_hash "
            "and er.source_content_id=r.source_content_id "
            "and er.source_document_id=c.source_document_id "
            "and er.source_content_hash=r.source_content_hash "
            "and er.engine_version=a.engine_version "
            "and er.rule_set_version=a.rule_set_version "
            "and er.configuration_hash=a.config_hash "
        )
        if outcome == "completed":
            outcome_evidence = (
                run_identity
                + "and b.failure_code is null "
                + "and er.run_status='completed' "
                "and er.admissibility_state='admissible' "
            )
        elif outcome == "rejected":
            # An engine rejection may have a failed extraction_run receipt, or
            # it may occur before a run row can be created. replay_finalize
            # binds both forms; validate the complete shape of whichever form
            # was observed rather than requiring every rejection to be runless.
            outcome_evidence = (
                "and nullif(b.failure_code,'') is not null "
                "and ((b.extraction_run_id is null "
                "and b.output_content_hash is null "
                "and b.rule_manifest_hash is null) "
                "or (b.extraction_run_id is not null "
                + run_identity
                + "and er.run_status='failed' "
                "and er.admissibility_state='rejected')) "
            )
        else:
            outcome_evidence = (
                "and b.extraction_run_id is null "
                "and b.output_content_hash is null "
                "and b.rule_manifest_hash is null "
                "and b.failure_code is null "
            )
        query = (
            "select exists("
            "select 1 from rosetta_replay.replay_run_binding b "
            "join rosetta_replay.replay_attempt a using(attempt_id) "
            "join rosetta_replay.replay_source_registry r "
            "on r.source_registry_id=a.source_registry_id "
            "join rosetta_v2513.source_document_content c "
            "on c.source_content_id=r.source_content_id "
            "and c.source_content_hash=r.source_content_hash "
            "left join rosetta_v2513.extraction_run er on er.id=b.extraction_run_id "
            f"where b.attempt_id={literal(attempt_id)}::uuid "
            f"and b.terminal_outcome={literal(outcome)} "
            "and b.source_registry_id=a.source_registry_id "
            "and b.source_content_id=r.source_content_id "
            "and b.source_document_id=c.source_document_id "
            "and b.source_content_hash=r.source_content_hash "
            "and b.engine_version=a.engine_version "
            "and b.rule_set_version=a.rule_set_version "
            "and b.configuration_hash=a.config_hash "
            "and b.closure_hash=a.closure_hash "
            + outcome_evidence
            + ")::text;"
        )
        value = self.db.tx(query).splitlines()
        if not value or value[-1] not in ("true", "false"):
            raise ReplayIntegrityError("terminal binding check returned an invalid result")
        return value[-1] == "true"

    def has_terminal_receipt(self, attempt_id: str, outcome: str) -> bool:
        if outcome == "timed_out":
            attempt_state = "timed_out"
            receipt_kind = "timeout"
            class_predicate = "and receipt.failure_class='timeout' "
        elif outcome == "failed_terminal":
            attempt_state = "failed_terminal"
            receipt_kind = "terminal_failure"
            class_predicate = "and receipt.failure_class is not null "
        else:
            raise ReplayIntegrityError("unsupported receipt-only terminal outcome")
        query = (
            "select exists("
            "select 1 from rosetta_replay.replay_attempt attempt "
            "join rosetta_replay.replay_receipt receipt "
            "on receipt.attempt_id=attempt.attempt_id "
            f"and receipt.receipt_kind={literal(receipt_kind)} "
            f"where attempt.attempt_id={literal(attempt_id)}::uuid "
            f"and attempt.attempt_state={literal(attempt_state)} "
            "and attempt.pending_outcome is null "
            "and nullif(receipt.sqlstate,'') is not null "
            "and receipt.is_retryable is false "
            + class_predicate
            + "and not exists(select 1 "
            "from rosetta_replay.replay_run_binding binding "
            "where binding.attempt_id=attempt.attempt_id)"
            ")::text;"
        )
        value = self.db.tx(query).splitlines()
        if not value or value[-1] not in ("true", "false"):
            raise ReplayIntegrityError("terminal receipt check returned an invalid result")
        return value[-1] == "true"

    def diff_member(self, manifest_id: str, source: str, attempt_id: str) -> None:
        self.db.tx(
            "select rosetta_replay.diff_member("
            f"{literal(manifest_id)}::uuid,{literal(source)}::uuid,"
            f"{literal(attempt_id)}::uuid,'C1-C7-universal-candidate');"
        )


@dataclass
class RunAccounting:
    source_total: int
    terminal_tallies: dict[str, int] = field(default_factory=dict)
    expectation_mismatches: int = 0
    prior_admissible_regressions: int = 0
    infrastructure_errors: int = 0
    ledger_integrity_errors: int = 0
    checkpoint_events: list[dict[str, object]] = field(default_factory=list)

    @property
    def accounted(self) -> int:
        return sum(self.terminal_tallies.values())

    @property
    def success(self) -> int:
        return self.terminal_tallies.get("completed", 0)

    @property
    def non_success(self) -> int:
        return self.accounted - self.success

    def observe(self, outcome: str) -> None:
        self.terminal_tallies[outcome] = self.terminal_tallies.get(outcome, 0) + 1

    def record_new_checkpoints(
        self, warning_before: int, review_before: int
    ) -> list[dict[str, object]]:
        first_new_event = len(self.checkpoint_events)
        warning, review = quarantine_threshold_flags(
            self.non_success, self.source_total
        )
        if warning and not warning_before:
            self.checkpoint_events.append(
                {
                    "checkpoint": "warning_10_percent",
                    "quarantined": self.non_success,
                    "source_total": self.source_total,
                    "action_required": "early_warning",
                    "processing_continues": True,
                }
            )
        if review and not review_before:
            self.checkpoint_events.append(
                {
                    "checkpoint": "generalized_review_15_percent",
                    "quarantined": self.non_success,
                    "source_total": self.source_total,
                    "review_scope": "entire_quarantine_stack",
                    "action_required": "generalized_pattern_review",
                    "pattern_dimensions": [
                        "failure_class",
                        "document_class",
                        "provider_family",
                        "media_type",
                    ],
                    "source_specific_parser_changes_authorized": False,
                    "processing_continues": True,
                }
            )
        return self.checkpoint_events[first_new_event:]


def quarantine_threshold_flags(non_success: int, source_total: int) -> tuple[int, int]:
    """Return exact 10% warning and 15% review flags without float rounding."""

    if source_total <= 0 or non_success < 0:
        raise ReplayIntegrityError("quarantine threshold inputs are invalid")
    warning = int(non_success * 100 >= source_total * 10)
    review = int(non_success * 100 >= source_total * 15)
    return warning, review


def _expectation_matches(member: Member, attempt: AttemptSnapshot) -> bool:
    if attempt.pending_outcome is None:
        raise ReplayIntegrityError("cannot compare an attempt without a staged outcome")
    observed = PENDING_OUTCOME.get(attempt.pending_outcome)
    if observed is None:
        raise ReplayIntegrityError(
            f"unrecognized staged outcome: {attempt.pending_outcome!r}"
        )
    if observed != member.expected_terminal_outcome:
        return False
    if observed == "rejected":
        return attempt.pending_sqlstate == member.expected_failure_code
    return True


def _assert_single_observation_attempt(attempt: AttemptSnapshot) -> None:
    if attempt.retry_seq != 0 or attempt.identity_attempt_count != 1:
        raise ReplayIntegrityError(
            "legacy retry chain exists for this exact identity; parser not rerun"
        )


def _process_member(
    store: ReplayStore,
    config: WorkerConfig,
    member: Member,
    closure_hash: str,
    accounting: RunAccounting,
) -> None:
    expectation_mismatch = False
    configuration_hash = store.configuration_hash(
        member.source_registry_id, config.closure_prefix
    )
    attempt = store.latest_attempt(
        member.source_registry_id, configuration_hash, closure_hash, config
    )
    if attempt is not None:
        _assert_single_observation_attempt(attempt)

    # Call the claim contract for every member. For an exact existing retry-0
    # attempt this is an association-only operation: it creates no attempt and
    # never invokes the parser, but it leaves a manifest-keyed claim receipt
    # that the SQL finalizer requires.
    claim = store.claim(
        member.source_registry_id, configuration_hash, closure_hash, config
    )
    freshly_claimed = claim.created
    claimed_attempt = store.attempt(claim.attempt_id)
    _assert_single_observation_attempt(claimed_attempt)
    if attempt is not None and claimed_attempt.attempt_id != attempt.attempt_id:
        raise ReplayIntegrityError(
            "truth-observation claim changed an existing exact attempt identity"
        )
    attempt = claimed_attempt
    if (
        attempt.attempt_state in ("claimed", "running")
        and attempt.pending_outcome is None
        and not freshly_claimed
    ):
        # A prior process may have reached the parser boundary. Never infer
        # that it was safe to invoke again. Leave a live lease untouched; once
        # expired, preserve the ambiguity as terminal quarantine and continue
        # without a parser rerun.
        if not attempt.lease_expired:
            raise RuntimeError(
                "existing in-progress attempt is still leased; parser not rerun"
            )
        store.finalize_interrupted(
            attempt.attempt_id, config.manifest_id, config.worker_identity
        )
        attempt = store.attempt(attempt.attempt_id)
        _assert_single_observation_attempt(attempt)

    if attempt.attempt_state == "failed_retryable":
        # Historical retryable state is nonterminal in the legacy substrate.
        # The manifest finalizer preserves its original receipt and converts it
        # to a terminal failed quarantine without another parser invocation.
        store.finalize(
            attempt.attempt_id, config.manifest_id, config.worker_identity
        )
        attempt = store.attempt(attempt.attempt_id)
        _assert_single_observation_attempt(attempt)
        if attempt.attempt_state != "failed_terminal":
            raise ReplayIntegrityError(
                "legacy retryable observation was not terminally quarantined"
            )

    # Never claim an already observed identity. Historical failed_retryable
    # evidence is accounted as retry-exhausted quarantine; the dedicated truth
    # claim contract never creates retry_seq + 1 from it.
    if attempt.attempt_state in TERMINAL_STATE_OUTCOME:
        outcome = TERMINAL_STATE_OUTCOME[attempt.attempt_state]
        if outcome != member.expected_terminal_outcome:
            expectation_mismatch = True
    else:
        if attempt.attempt_state != "running":
            raise ReplayIntegrityError(
                f"unrecognized nonterminal attempt state: {attempt.attempt_state!r}"
            )

        if attempt.pending_outcome is None:
            if not freshly_claimed:
                raise ReplayIntegrityError(
                    "pre-existing attempt has no committed outcome and was not rerun"
                )
            # Historical expected outcomes never decide whether a source is
            # observed. The parser determines success, rejection, or deferral.
            store.execute(
                attempt.attempt_id, config.manifest_id, config.closure_prefix
            )
            attempt = store.attempt(attempt.attempt_id)
            _assert_single_observation_attempt(attempt)

        if attempt.pending_outcome not in PENDING_OUTCOME:
            raise ReplayIntegrityError(
                "execution did not commit a recognized staged outcome"
            )
        expected_state = FINAL_STATE_FOR_PENDING[attempt.pending_outcome]
        if not _expectation_matches(member, attempt):
            expectation_mismatch = True
        # Historical expectation is reporting metadata only. Every bindable
        # observed outcome takes the same advisory finalization path.
        store.finalize(
            attempt.attempt_id, config.manifest_id, config.worker_identity
        )
        attempt = store.attempt(attempt.attempt_id)
        _assert_single_observation_attempt(attempt)
        if attempt.attempt_state != expected_state:
            raise ReplayIntegrityError(
                "finalized state does not match the committed observed outcome"
            )
        outcome = TERMINAL_STATE_OUTCOME.get(attempt.attempt_state)
        if outcome is None:
            raise ReplayIntegrityError(
                "finalizer did not produce an observable disposition"
            )

    if outcome in ("completed", "rejected", "deferred_oversized"):
        if not store.has_terminal_binding(attempt.attempt_id, outcome):
            raise ReplayIntegrityError(
                "bindable terminal outcome lacks exact observed-result evidence"
            )
    elif outcome in ("timed_out", "failed_terminal"):
        if not store.has_terminal_receipt(attempt.attempt_id, outcome):
            raise ReplayIntegrityError(
                "failure terminal outcome lacks an exact append-only receipt"
            )

    # Account a source only after its required observed-result binding is
    # proven. Compatibility/diff evidence is a later, separate decision layer.
    accounting.observe(outcome)
    if expectation_mismatch:
        accounting.expectation_mismatches += 1
    if outcome != "completed" and member.prior_output_state == "admissible":
        accounting.prior_admissible_regressions += 1
    if outcome == "completed" and member.prior_output_state == "admissible":
        try:
            store.diff_member(
                config.manifest_id, member.source_registry_id, attempt.attempt_id
            )
        except Exception as exc:
            raise ReplayIntegrityError("completed member diff failed") from exc


@dataclass(frozen=True)
class ReplayResult:
    report: dict[str, object]
    exit_code: int


def run_replay(store: ReplayStore, config: WorkerConfig) -> ReplayResult:
    """Run a complete truth-first sweep and return its report and exit code."""

    # Fail before reading or claiming corpus work if the database can still
    # skip by expectation, create a retry, or finalize without a run binding.
    store.assert_truth_observation_contract()
    start_manifest = store.manifest_snapshot(config.manifest_id)
    start_closure = store.closure_hash(config.closure_prefix)
    start_configuration_lock = store.configuration_lock_hash(
        config.manifest_id, config.closure_prefix
    )
    members = store.members(config.manifest_id)
    if len(members) != start_manifest.member_count:
        raise ReplayIntegrityError(
            "sealed manifest member rows do not match its source_total"
        )
    if [member.ordinal for member in members] != list(
        range(1, start_manifest.member_count + 1)
    ):
        raise ReplayIntegrityError("sealed manifest ordinals are not exact and contiguous")
    if len({member.source_registry_id for member in members}) != len(members):
        raise ReplayIntegrityError("sealed manifest contains duplicate sources")

    accounting = RunAccounting(source_total=start_manifest.member_count)
    for member in members:
        warning_before, review_before = quarantine_threshold_flags(
            accounting.non_success, accounting.source_total
        )
        try:
            _process_member(store, config, member, start_closure, accounting)
            new_checkpoints = accounting.record_new_checkpoints(
                warning_before, review_before
            )
            # Render captures stderr continuously. Emit the checkpoint at the
            # exact crossing, rather than waiting for the end-of-sweep report,
            # so the 15% whole-stack review can start while later members keep
            # processing. The same events remain in the final JSON receipt.
            for checkpoint in new_checkpoints:
                print(
                    json.dumps(
                        {
                            "event": "rosetta_quarantine_checkpoint",
                            "manifest_id": config.manifest_id,
                            **checkpoint,
                        },
                        sort_keys=True,
                    ),
                    file=sys.stderr,
                    flush=True,
                )
        except ReplayIntegrityError as exc:
            accounting.ledger_integrity_errors += 1
            print(
                f"member ordinal {member.ordinal}: ledger integrity failure: {exc}",
                file=sys.stderr,
            )
        except Exception as exc:  # database/process boundary; continue the sweep
            accounting.infrastructure_errors += 1
            print(
                f"member ordinal {member.ordinal}: infrastructure failure: {exc}",
                file=sys.stderr,
            )

    manifest_stable = False
    source_lock_stable = False
    try:
        end_manifest = store.manifest_snapshot(config.manifest_id)
        manifest_stable = end_manifest == start_manifest
        if not manifest_stable:
            accounting.ledger_integrity_errors += 1
    except Exception as exc:
        accounting.ledger_integrity_errors += 1
        print(f"post-run manifest verification failed: {exc}", file=sys.stderr)
    try:
        end_closure = store.closure_hash(config.closure_prefix)
        end_configuration_lock = store.configuration_lock_hash(
            config.manifest_id, config.closure_prefix
        )
        source_lock_stable = (
            end_closure == start_closure
            and end_configuration_lock == start_configuration_lock
        )
    except Exception as exc:
        accounting.infrastructure_errors += 1
        print(f"post-run closure verification failed: {exc}", file=sys.stderr)

    warning, review = quarantine_threshold_flags(
        accounting.non_success, accounting.source_total
    )
    complete = accounting.accounted == accounting.source_total
    report: dict[str, object] = {
        "manifest_id": config.manifest_id,
        "closure_prefix": config.closure_prefix,
        "closure_hash": start_closure,
        "configuration_lock_hash": start_configuration_lock,
        "source_total": accounting.source_total,
        "accounted": accounting.accounted,
        "unaccounted": accounting.source_total - accounting.accounted,
        "success": accounting.success,
        "non_success": accounting.non_success,
        "terminal_tallies": dict(sorted(accounting.terminal_tallies.items())),
        "expectation_mismatches": accounting.expectation_mismatches,
        "prior_admissible_regressions": accounting.prior_admissible_regressions,
        "infrastructure_errors": accounting.infrastructure_errors,
        "ledger_integrity_errors": accounting.ledger_integrity_errors,
        "quarantine_warning_10_percent": warning,
        "quarantine_review_15_percent": review,
        "checkpoint_events": accounting.checkpoint_events,
        "manifest_verified_before": True,
        "manifest_verified_after": manifest_stable,
        "source_lock_stable": source_lock_stable,
        "complete_accounting": complete,
        "promotion_requested": False,
    }
    failed = (
        not complete
        or not manifest_stable
        or not source_lock_stable
        or accounting.infrastructure_errors > 0
        or accounting.ledger_integrity_errors > 0
    )
    return ReplayResult(report, int(failed))


def parse_config(argv: list[str]) -> tuple[WorkerConfig, str] | None:
    # Fail legacy positional credentials without reflecting the secret value.
    legacy_database_argument = (
        len(argv) > 1
        and (
            argv[1].startswith(("postgres://", "postgresql://"))
            or argv[1].lstrip().startswith(("host=", "dbname="))
        )
    )
    if len(argv) in (7, 8) and (
        legacy_database_argument
        or (len(argv) > 2 and UUID_RE.fullmatch(argv[2]))
    ):
        print(
            "database URI positional arguments are no longer accepted; set "
            "ROSETTA_REPLAY_DATABASE_URL",
            file=sys.stderr,
        )
        return None
    if len(argv) not in (6, 7):
        print(__doc__, file=sys.stderr)
        return None
    manifest, prefix, engine, rule_set, worker = argv[1:6]
    config = WorkerConfig(
        validate("manifest UUID", manifest, UUID_RE),
        validate("closure prefix", prefix, PREFIX_RE),
        validate("engine", engine, IDENTITY_RE),
        validate("rule set", rule_set, IDENTITY_RE),
        validate("worker", worker, IDENTITY_RE),
    )
    psql_binary = argv[6] if len(argv) == 7 else "psql"
    if not psql_binary:
        raise ReplayIntegrityError("psql binary must not be empty")
    return config, psql_binary


def main() -> int:
    try:
        parsed = parse_config(sys.argv)
        if parsed is None:
            return 2
        config, psql_binary = parsed
        database_url = os.environ.get("ROSETTA_REPLAY_DATABASE_URL")
        if not database_url:
            print("ROSETTA_REPLAY_DATABASE_URL is required", file=sys.stderr)
            return 2
        result = run_replay(
            SqlReplayStore(Psql(database_url, psql_binary)), config
        )
        print(json.dumps(result.report, sort_keys=True))
        return result.exit_code
    except (ReplayIntegrityError, RuntimeError) as exc:
        print(f"replay worker failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
