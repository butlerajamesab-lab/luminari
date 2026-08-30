"""Static evidence and packaging checks.

These checks deliberately do *not* pretend to be a PostgreSQL parser or a
runtime replay.  They prove the properties that can be established from the
packet bytes alone and leave database execution to ``run_all.py``.
"""
from __future__ import annotations

import hashlib
import re
from pathlib import Path

EXPECTED_MANIFEST_SHA256 = (
    "3602eb80fee71a4009bf7a04c521fec62e2d1f17f8ea5b027500905cd8366639"
)
EXPECTED_MANIFEST_MD5 = "c0b627297b081393d41b2a9390f1f930"


def verify_captured_manifest(root: str | Path) -> tuple[str, str, int]:
    path = Path(root) / "evidence" / "registry" / "manifest-2.5.11.json"
    payload = path.read_bytes()
    sha256 = hashlib.sha256(payload).hexdigest()
    md5 = hashlib.md5(payload).hexdigest()  # noqa: S324 -- fidelity receipt, not security
    if sha256 != EXPECTED_MANIFEST_SHA256:
        raise RuntimeError(
            f"captured manifest sha256 mismatch: expected {EXPECTED_MANIFEST_SHA256}, got {sha256}"
        )
    if md5 != EXPECTED_MANIFEST_MD5:
        raise RuntimeError(
            f"captured manifest md5 mismatch: expected {EXPECTED_MANIFEST_MD5}, got {md5}"
        )
    return sha256, md5, len(payload)


def _sql_lexical_balance(path: Path) -> None:
    """Reject unterminated SQL strings/comments/dollar quotes and parens.

    This is a lexical integrity check, not a substitute for PostgreSQL's own
    parser. Parentheses inside function bodies are included because a dollar
    body is scanned recursively after its outer delimiter is verified.
    """

    text = path.read_text(encoding="utf-8")

    def scan(fragment: str, *, body: bool = False) -> None:
        i = 0
        parens = 0
        block_depth = 0
        while i < len(fragment):
            if block_depth:
                if fragment.startswith("/*", i):
                    block_depth += 1
                    i += 2
                elif fragment.startswith("*/", i):
                    block_depth -= 1
                    i += 2
                else:
                    i += 1
                continue
            if fragment.startswith("--", i):
                end = fragment.find("\n", i + 2)
                i = len(fragment) if end < 0 else end + 1
                continue
            if fragment.startswith("/*", i):
                block_depth = 1
                i += 2
                continue
            ch = fragment[i]
            if ch in ("'", '"'):
                quote = ch
                i += 1
                while i < len(fragment):
                    if fragment[i] == quote:
                        if i + 1 < len(fragment) and fragment[i + 1] == quote:
                            i += 2
                            continue
                        i += 1
                        break
                    i += 1
                else:
                    raise RuntimeError(f"{path}: unterminated {quote} quote")
                continue
            if ch == "$":
                match = re.match(r"\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$", fragment[i:])
                if match:
                    delimiter = match.group(0)
                    start = i + len(delimiter)
                    end = fragment.find(delimiter, start)
                    if end < 0:
                        raise RuntimeError(f"{path}: unterminated dollar quote {delimiter}")
                    # Function/DO bodies contain executable SQL/PLpgSQL. Scan
                    # them too; do not treat a nested, differently tagged
                    # dollar string as the outer terminator.
                    if not body:
                        scan(fragment[start:end], body=True)
                    i = end + len(delimiter)
                    continue
            if ch == "(":
                parens += 1
            elif ch == ")":
                parens -= 1
                if parens < 0:
                    raise RuntimeError(f"{path}: unmatched closing parenthesis")
            i += 1
        if block_depth:
            raise RuntimeError(f"{path}: unterminated block comment")
        if parens:
            raise RuntimeError(f"{path}: parenthesis balance is {parens}")

    scan(text)


def verify_candidate_contract(root: str | Path) -> dict[str, int | str]:
    root = Path(root)
    migrations = root / "migrations"
    expected = {
        f"{number:02d}" for number in range(0, 19)
    } | {"99"}
    present = {path.name[:2] for path in migrations.glob("[0-9][0-9]_*.sql")}
    missing = sorted(expected - present)
    if missing:
        raise RuntimeError(f"missing migration prefixes: {missing}")

    sql_paths = sorted(migrations.glob("*.sql")) + sorted((root / "tests").glob("*.sql"))
    for path in sql_paths:
        _sql_lexical_balance(path)

    # Candidate/replay migrations may read the captured public schema in
    # migration 00 only. Every other migration must stay in the two isolated
    # namespaces; no production-table mutation is allowed in the packet.
    mutation = re.compile(
        r"\b(?:insert\s+into|update|delete\s+from|truncate(?:\s+table)?|"
        r"alter\s+table|drop\s+(?:table|schema|view|function)|"
        r"create\s+(?:or\s+replace\s+)?function)\s+public\.",
        re.IGNORECASE,
    )
    public_mutations: list[str] = []
    for path in sorted(migrations.glob("*.sql")):
        if path.name.startswith("00_"):
            continue
        if mutation.search(path.read_text(encoding="utf-8")):
            public_mutations.append(path.name)
    if public_mutations:
        raise RuntimeError(f"production-schema mutation tokens found: {public_mutations}")

    convergence = (migrations / "17_convergence_candidate_2513.sql").read_text(encoding="utf-8")
    required_convergence = {
        "C3 acquisition gate": "html_content_extraction_receipt_missing",
        "C3 page-line exclusion": "PAGE[ \\t]+[0-9]+-(?:HOUSE|SENATE)",
        "C3 non-operative DIGEST exclusion": "constitutes[[:space:]]+no[[:space:]]+part",
        "C3 reference-date gate": "reference_date_below_credible_minimum",
        "C4 help spans": "union all select 'help_entity'",
        "C5 decomposition": "rosetta_v25_decompose_clause",
        "C5 middle-initial protection": "v_given_name",
        "C6 mixed polarity": "modal_polarity_conflict",
        "C7 charset gate": "charset_receipt_missing_or_incomplete",
        "decomposed actor bound": "char_length(v_d.actor) > v_bound",
        "occurrence rule": "source_occurrence_count_equals_object_count",
    }
    absent = [label for label, token in required_convergence.items() if token not in convergence]
    if absent:
        raise RuntimeError(f"convergence candidate omits required controls: {absent}")

    c4 = (migrations / "07_lane_c4_occurrence_aware_spans.sql").read_text(
        encoding="utf-8"
    )
    expected_help_count = (
        "+(select count(*) from rosetta_v2513.help_entity help "
        "where help.extraction_run_id=p_extraction_run_id)"
    )
    if expected_help_count not in c4 or expected_help_count not in convergence:
        raise RuntimeError(
            "C4/convergence validator omits help_entity from expected span count"
        )

    # C6 action_type is constrained to the base modal.  Negative polarity
    # remains in the immutable trigger text and may never be concatenated into
    # the constrained field (the exact defect caught by the independent review).
    c6 = (migrations / "09_lane_c6_modal_retyping_revalidation.sql").read_text(
        encoding="utf-8"
    )
    forbidden_modal_concat = "lower(m[1] || coalesce(m[2],''))"
    if forbidden_modal_concat in c6 or forbidden_modal_concat in convergence:
        raise RuntimeError("C6 concatenates negative polarity into constrained action_type")
    if "select lower(m[1]) into v_retyped" not in c6:
        raise RuntimeError("C6 does not normalize retyped action_type to its base modal")

    c6_test = (root / "tests" / "05_lanes_c6_c7.sql").read_text(encoding="utf-8")
    if "v_negative is distinct from 'shall'" not in c6_test:
        raise RuntimeError("C6 negative-clause test does not assert the constrained base modal")

    security_test = (root / "tests" / "02_schema_and_control.sql").read_text(
        encoding="utf-8"
    )
    if "or not sel_ok" in security_test:
        raise RuntimeError("security test still requires anonymous candidate-table reads")

    continuity_test = (root / "tests" / "06_manifest_diff_gates.sql").read_text(
        encoding="utf-8"
    )
    for token in (
        "classify_diff('REVISOR of statutes','the clerk','C2'",
        "unattributed repair was labeled an improvement",
        "actor_value_defect('entity_override',repeat('x',1025))",
        "optional null override actor was invented as a defect",
    ):
        if token not in continuity_test:
            raise RuntimeError(f"continuity regression coverage missing: {token}")

    runner = (migrations / "12_replay_runner.sql").read_text(encoding="utf-8")
    if runner.count("transaction_boundary_required") < 2 or runner.count("P1R30") < 2:
        raise RuntimeError("same-transaction replay shortcuts are not disabled")
    for token in (
        "validated_reference_date",
        "reference_date_below_credible_minimum",
        "rosetta_replay.validated_reference_date(c.source_metadata)",
    ):
        if token not in runner:
            raise RuntimeError(f"replay reference-date gate missing: {token}")

    test_runner = (root / "tests" / "run_all.py").read_text(encoding="utf-8")
    for transaction_test in (
        "08_separated_transactions.py",
        "09_all_lanes_replay.py",
        "11_exact_regressions.py",
    ):
        if transaction_test not in test_runner:
            raise RuntimeError(f"runtime runner omits {transaction_test}")
    result_position = test_runner.find('print("RESULT:"')
    if result_position < 0:
        raise RuntimeError("runtime runner has no final result emission")
    if test_runner.find("08_separated_transactions.py") > result_position:
        raise RuntimeError("separated-transaction tests are sequenced after the final result")

    separated = (root / "tests" / "08_separated_transactions.py").read_text(
        encoding="utf-8"
    )
    if "replay_source_registry r using(source_registry_id)" in separated:
        raise RuntimeError("separated-transaction proof retains an ambiguous USING join")
    if "r.source_registry_id=b.source_registry_id" not in separated:
        raise RuntimeError("separated-transaction proof omits exact registry binding")

    exact_test = (root / "tests" / "11_exact_regressions.py").read_text(
        encoding="utf-8"
    )
    fixture_hashes = {
        "rosetta-run-24592.json":
            "57288c33bf546a88f9e1f6a2364c7243ec924009152471d58256b78b5762250c",
        "rosetta-run-24593.json":
            "f3a025a35ad472f29d65bce30d89c3e394b9116e780def0e570fb51daf9099a7",
    }
    for fixture_name, expected_hash in fixture_hashes.items():
        fixture = root / "tests" / "fixtures" / fixture_name
        if hashlib.sha256(fixture.read_bytes()).hexdigest() != expected_hash:
            raise RuntimeError(f"exact regression fixture drifted: {fixture_name}")
        if expected_hash not in exact_test:
            raise RuntimeError(f"exact regression test does not bind {fixture_name}")
    for token in (
        "Proposed law",
        "David R. Poynter",
        "PAGE[ \\\\t]+[0-9]+-(HOUSE|SENATE)",
        "1969-12-31",
        "P1A08",
    ):
        if token not in exact_test:
            raise RuntimeError(f"exact regression coverage missing: {token}")

    gates = (migrations / "14_promotion_gates.sql").read_text(encoding="utf-8")
    missing_gates = [f"G{i}" for i in range(1, 12) if f"G{i}" not in gates]
    if missing_gates:
        raise RuntimeError(f"promotion gates missing: {missing_gates}")
    for correction in ("C1", "C2", "C3", "C4", "C5", "C6", "C7"):
        if f"('{correction}')" not in gates:
            raise RuntimeError(f"negative-control coverage omits {correction}")

    security = (migrations / "18_candidate_security_lockdown.sql").read_text(encoding="utf-8")
    for token in (
        "enable row level security",
        "revoke all privileges on all functions",
        "alter default privileges",
        "from authenticated",
        "alter function %s set search_path",
    ):
        if token not in security.lower():
            raise RuntimeError(f"security lockdown missing: {token}")

    quarantine = root / "evidence" / "Rosetta Quarantine Run IDs — 2026-08-23.txt"
    payload_lines = [
        line.strip()
        for line in quarantine.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]
    run_ids = [value.strip() for line in payload_lines for value in line.split(",") if value.strip()]
    if not run_ids or len(run_ids) != len(set(run_ids)) or not all(value.isdigit() for value in run_ids):
        raise RuntimeError("quarantine run-id evidence is empty, duplicated, or malformed")

    fidelity = (root / "evidence" / "CONTROL_FIDELITY.txt").read_text(encoding="utf-8")
    if "total functions: 51; mismatches: 0" not in fidelity:
        raise RuntimeError("control closure fidelity receipt is not 51/51")

    return {
        "sql_files_lexed": len(sql_paths),
        "migration_files": len(list(migrations.glob("*.sql"))),
        "public_schema_mutations": len(public_mutations),
        "control_functions_matching": 51,
        "quarantine_run_ids": len(run_ids),
        "quarantine_sha256": hashlib.sha256(quarantine.read_bytes()).hexdigest(),
    }


def verify_checksum_file(root: str | Path) -> int:
    root = Path(root)
    checksum_path = root / "SHA256SUMS"
    checked = 0
    for line in checksum_path.read_text(encoding="utf-8").splitlines():
        if not line:
            continue
        digest, relative = line.split("  ", 1)
        actual = hashlib.sha256((root / relative).read_bytes()).hexdigest()
        if actual != digest:
            raise RuntimeError(f"checksum mismatch for {relative}: {actual} != {digest}")
        checked += 1
    return checked


if __name__ == "__main__":
    packet_root = Path(__file__).resolve().parents[1]
    manifest_sha, manifest_md5, manifest_size = verify_captured_manifest(packet_root)
    result = verify_candidate_contract(packet_root)
    print(f"PASS captured_manifest sha256={manifest_sha} md5={manifest_md5} bytes={manifest_size}")
    for key, value in result.items():
        print(f"PASS {key}={value}")
