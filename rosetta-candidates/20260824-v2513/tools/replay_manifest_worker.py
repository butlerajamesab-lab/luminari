#!/usr/bin/env python3
"""Replay a sealed corpus with real transaction boundaries.

Each call below is a distinct psql process and committed transaction:
  claim -> execute/defer -> finalize -> optional complete member diff.

This worker never calls promotion or writes a production registry.

Usage:
  python tools/replay_manifest_worker.py POSTGRES_URI MANIFEST_UUID \
    v2513_ rosetta-v3-deterministic-sql-2.5.13 \
    rosetta-five-layer-structural-correctness-2.5.13 worker-name
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from dataclasses import dataclass


UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.I)
PREFIX_RE = re.compile(r"^(?:ctl_|c[1-7]_|v2513_)$")
IDENTITY_RE = re.compile(r"^[A-Za-z0-9_.:-]+$")


def literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def validate(label: str, value: str, pattern: re.Pattern[str]) -> str:
    if not pattern.fullmatch(value):
        raise SystemExit(f"invalid {label}: {value!r}")
    return value


@dataclass
class Psql:
    uri: str
    binary: str = "psql"

    def tx(self, sql: str) -> str:
        proc = subprocess.run(
            [self.binary, "-X", "-v", "ON_ERROR_STOP=1", "-At", self.uri, "-c", sql],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        if proc.returncode:
            raise RuntimeError(proc.stderr.decode("utf-8", "replace")[:4000])
        return proc.stdout.decode("utf-8", "strict").strip()


def main() -> int:
    if len(sys.argv) not in (7, 8):
        print(__doc__, file=sys.stderr)
        return 2
    uri, manifest, prefix, engine, rule_set, worker = sys.argv[1:7]
    psql_binary = sys.argv[7] if len(sys.argv) == 8 else "psql"
    validate("manifest UUID", manifest, UUID_RE)
    validate("closure prefix", prefix, PREFIX_RE)
    validate("engine", engine, IDENTITY_RE)
    validate("rule set", rule_set, IDENTITY_RE)
    validate("worker", worker, IDENTITY_RE)
    db = Psql(uri, psql_binary)

    closure = db.tx(f"select rosetta_replay.closure_sha256({literal(prefix)});").splitlines()[-1]
    rows = db.tx(
        "select jsonb_build_object("
        "'source_registry_id',source_registry_id,"
        "'expected_terminal_outcome',expected_terminal_outcome,"
        "'prior_output_state',prior_output_state)::text "
        "from rosetta_replay.sealed_corpus_member "
        f"where manifest_id={literal(manifest)}::uuid order by ordinal;"
    ).splitlines()
    if not rows:
        raise RuntimeError("sealed manifest has no members")

    tallies: dict[str, int] = {}
    for line in rows:
        member = json.loads(line)
        source = validate("source UUID", member["source_registry_id"], UUID_RE)
        config = db.tx(
            f"select rosetta_replay.expected_configuration_hash({literal(source)}::uuid);"
        ).splitlines()[-1]
        attempt = db.tx(
            "select rosetta_replay.replay_claim("
            f"{literal(source)}::uuid,{literal(prefix)},{literal(engine)},{literal(rule_set)},"
            f"{literal(config)},{literal(closure)},{literal(worker)});"
        ).splitlines()[-1]
        validate("attempt UUID", attempt, UUID_RE)
        state = db.tx(
            f"select attempt_state from rosetta_replay.replay_attempt where attempt_id={literal(attempt)}::uuid;"
        ).splitlines()[-1]
        if state not in ("succeeded", "rejected", "deferred_oversized"):
            if member["expected_terminal_outcome"] == "deferred_oversized":
                db.tx(
                    f"select rosetta_replay.replay_defer({literal(attempt)}::uuid,"
                    "'source exceeds the immutable sealed-corpus threshold');"
                )
            else:
                # SET is a prior statement in the same execution transaction;
                # the parser SELECT begins with statement_timeout already armed.
                db.tx(
                    "set statement_timeout='120s';"
                    f"select rosetta_replay.replay_execute({literal(attempt)}::uuid,{literal(prefix)},120000);"
                )
            db.tx(
                f"select rosetta_replay.replay_finalize({literal(attempt)}::uuid,{literal(worker)});"
            )
            state = db.tx(
                f"select attempt_state from rosetta_replay.replay_attempt where attempt_id={literal(attempt)}::uuid;"
            ).splitlines()[-1]

        observed = {
            "succeeded": "completed",
            "rejected": "rejected",
            "deferred_oversized": "deferred_oversized",
        }.get(state, state)
        if observed != member["expected_terminal_outcome"]:
            raise RuntimeError(
                f"source {source}: expected {member['expected_terminal_outcome']}, observed {observed}"
            )
        if member["prior_output_state"] == "admissible":
            if state != "succeeded":
                raise RuntimeError(f"source {source}: prior output exists but candidate did not complete")
            db.tx(
                "select rosetta_replay.diff_member("
                f"{literal(manifest)}::uuid,{literal(source)}::uuid,{literal(attempt)}::uuid,"
                "'C1-C7-universal-candidate');"
            )
        tallies[observed] = tallies.get(observed, 0) + 1

    print(json.dumps({
        "manifest_id": manifest,
        "closure_prefix": prefix,
        "closure_hash": closure,
        "processed": len(rows),
        "terminal_tallies": tallies,
        "promotion_requested": False,
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
