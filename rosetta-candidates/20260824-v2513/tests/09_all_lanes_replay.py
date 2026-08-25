#!/usr/bin/env python3
"""Replay one exact source through control, C1-C7, and convergence.

Every claim, execute, finalize, and verification call is a separate psql
process/transaction.  The source/expectation is created by test 08.
"""
from __future__ import annotations

import subprocess
import sys


URI = sys.argv[1]
PSQL = sys.argv[2]
URL = "test://separated-08"
LANES = (
    ("ctl_", "rosetta-v3-deterministic-sql-2.5.11", "rosetta-five-layer-structural-correctness-2.5.11"),
    ("c1_", "rosetta-v3-deterministic-sql-2.5.13-c1", "rosetta-five-layer-structural-correctness-2.5.13-c1"),
    ("c2_", "rosetta-v3-deterministic-sql-2.5.13-c2", "rosetta-five-layer-structural-correctness-2.5.13-c2"),
    ("c3_", "rosetta-v3-deterministic-sql-2.5.13-c3", "rosetta-five-layer-structural-correctness-2.5.13-c3"),
    ("c4_", "rosetta-v3-deterministic-sql-2.5.13-c4", "rosetta-five-layer-structural-correctness-2.5.13-c4"),
    ("c5_", "rosetta-v3-deterministic-sql-2.5.13-c5", "rosetta-five-layer-structural-correctness-2.5.13-c5"),
    ("c6_", "rosetta-v3-deterministic-sql-2.5.13-c6", "rosetta-five-layer-structural-correctness-2.5.13-c6"),
    ("c7_", "rosetta-v3-deterministic-sql-2.5.13-c7", "rosetta-five-layer-structural-correctness-2.5.13-c7"),
    ("v2513_", "rosetta-v3-deterministic-sql-2.5.13", "rosetta-five-layer-structural-correctness-2.5.13"),
)


def lit(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def tx(label: str, sql: str) -> str:
    p = subprocess.run(
        [PSQL, "-X", "-v", "ON_ERROR_STOP=1", "-At", URI, "-c", sql],
        capture_output=True,
        check=False,
    )
    if p.returncode:
        raise SystemExit(f"FAIL {label}: {p.stderr.decode('utf-8','replace')[:1200]}")
    return p.stdout.decode("utf-8", "strict").strip()


source = tx(
    "source lookup",
    "select r.source_registry_id from rosetta_replay.replay_source_registry r "
    "join rosetta_v2513.source_document_content c using(source_content_id) "
    f"where c.source_url={lit(URL)} and c.source_content_hash=r.source_content_hash;",
).splitlines()[-1]
config = tx("config lookup", f"select rosetta_replay.expected_configuration_hash({lit(source)}::uuid);").splitlines()[-1]

for prefix, engine, rules in LANES:
    closure = tx(f"{prefix} closure", f"select rosetta_replay.closure_sha256({lit(prefix)});").splitlines()[-1]
    attempt = tx(
        f"{prefix} claim",
        "select rosetta_replay.replay_claim("
        f"{lit(source)}::uuid,{lit(prefix)},{lit(engine)},{lit(rules)},"
        f"{lit(config)},{lit(closure)},{lit('worker-'+prefix.rstrip('_'))});",
    ).splitlines()[-1]
    state = tx(
        f"{prefix} state",
        f"select attempt_state from rosetta_replay.replay_attempt where attempt_id={lit(attempt)}::uuid;",
    ).splitlines()[-1]
    if state not in ("succeeded", "rejected", "deferred_oversized"):
        tx(
            f"{prefix} execute",
            "set statement_timeout='120s';"
            f"select rosetta_replay.replay_execute({lit(attempt)}::uuid,{lit(prefix)},120000);",
        )
        staged = tx(
            f"{prefix} staged",
            f"select pending_outcome from rosetta_replay.replay_attempt where attempt_id={lit(attempt)}::uuid;",
        ).splitlines()[-1]
        if staged != "success":
            detail = tx(
                f"{prefix} staged detail",
                "select coalesce(pending_sqlstate,'')||'|'||coalesce(pending_error_detail,'') "
                f"from rosetta_replay.replay_attempt where attempt_id={lit(attempt)}::uuid;",
            )
            raise SystemExit(f"FAIL {prefix}: expected success, staged {staged}: {detail[:1000]}")
        tx(
            f"{prefix} finalize",
            f"select rosetta_replay.replay_finalize({lit(attempt)}::uuid,{lit('worker-'+prefix.rstrip('_'))});",
        )

    proof = tx(
        f"{prefix} proof",
        "select a.attempt_state||'|'||b.terminal_outcome||'|'||"
        "(b.source_registry_id=a.source_registry_id)::text||'|'||"
        "(er.source_content_id=b.source_content_id and er.source_document_id=b.source_document_id "
        " and er.source_content_hash=b.source_content_hash)::text||'|'||"
        "(er.output_content_hash=b.output_content_hash and b.output_content_hash is not null)::text||'|'||"
        "(jsonb_array_length(coalesce(v.objects,'[]'::jsonb))>0)::text "
        "from rosetta_replay.replay_attempt a join rosetta_replay.replay_run_binding b using(attempt_id) "
        "join rosetta_v2513.extraction_run er on er.id=b.extraction_run_id "
        "join rosetta_v2513.v_rosetta_operator_law_view_v1 v on v.extraction_run_id=er.id "
        f"where a.attempt_id={lit(attempt)}::uuid;",
    )
    if proof != "succeeded|completed|true|true|true|true":
        raise SystemExit(f"FAIL {prefix} exact replay proof: {proof}")
    print(f"PASS 09 {prefix} exact source/run/output binding with nonempty structural output")

print("RESULT: 09 ALL PASS")
