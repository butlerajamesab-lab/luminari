"""Static evidence and packaging checks.

These checks deliberately do *not* pretend to be a PostgreSQL parser or a
runtime replay.  They prove the properties that can be established from the
packet bytes alone and leave database execution to ``run_all.py``.
"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

EXPECTED_MANIFEST_SHA256 = (
    "3602eb80fee71a4009bf7a04c521fec62e2d1f17f8ea5b027500905cd8366639"
)
EXPECTED_MANIFEST_MD5 = "c0b627297b081393d41b2a9390f1f930"
EXPECTED_HISTORICAL_PACKAGE_MANIFEST_SHA256 = (
    "efa789b26afbf08bb6161d2d03237f090cc8711721d9763378c0d7f0c855c675"
)
EXPECTED_HISTORICAL_RECEIPT_SHA256 = (
    "e68029633806c6c5bbf8289de554ebf304d9eb92f3cd193aab5871f4db23fa62"
)
EXPECTED_HISTORICAL_MIGRATION_SHA256 = {
    "migrations/02_candidate_schema.sql": "270348b74e774e65e8ae2edc6add11e10ceef8481e53e874dd12ed460f8e8622",
    "migrations/03_control_closure_2511.sql": "66dc4e7dc140507c35ed671ecf0682523e00c9171db936f28cac18987543744e",
    "migrations/04_lane_c1_measured_actor_bound.sql": "798ba98c07f06d994e1c4399b5c32d9d7127d1f9e6fa4a68a75bdd2d4fbfaf04",
    "migrations/05_lane_c2_actor_source_corruption.sql": "1b7958cfc34eb7c76603dcee347199639f76ae6eb2053e2183c8ae758a6c4be4",
    "migrations/06_lane_c3_projection_contract.sql": "c613651c39a5a4adfd03211a07ab64ea5ee0297517a4db51a6f4f96d79b30dc4",
    "migrations/07_lane_c4_occurrence_aware_spans.sql": "1d73f3c182201c308abea1ec985c8aa53bbda7aeae836e155cb3c982d49def04",
    "migrations/08_lane_c5_clause_decomposition.sql": "2eaca595dd682ceb63ce5f3e25c59d53dd172efac1a40f4eef31379e0132fc93",
    "migrations/09_lane_c6_modal_retyping_revalidation.sql": "7e5c9a1a191f3680231338f975d5025181b8d636aea04836205fc186dfa45a48",
    "migrations/10_lane_c7_charset_receipt_gate.sql": "1555b7e4ff51018fbbb7287ca1f759f5c5017d67f680cff0e37ce4fc07882bc6",
    "migrations/17_convergence_candidate_2513.sql": "ac1d2772b8596f24fc85fd93c1438526d55b12baba241523222e9261c669de1e",
}
GENERATED_MIGRATIONS = (
    "02_candidate_schema.sql",
    "03_control_closure_2511.sql",
    "04_lane_c1_measured_actor_bound.sql",
    "05_lane_c2_actor_source_corruption.sql",
    "06_lane_c3_projection_contract.sql",
    "07_lane_c4_occurrence_aware_spans.sql",
    "08_lane_c5_clause_decomposition.sql",
    "09_lane_c6_modal_retyping_revalidation.sql",
    "10_lane_c7_charset_receipt_gate.sql",
    "17_convergence_candidate_2513.sql",
)


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

    # The package manifest is the current-byte claim. A runtime PASS is valid
    # only when a separate validation binding names these exact generated SQL
    # hashes and its receipt hash verifies. Historical receipts may remain in
    # the packet, but they cannot validate regenerated migrations.
    current_generated = {
        f"migrations/{name}": hashlib.sha256((migrations / name).read_bytes()).hexdigest()
        for name in GENERATED_MIGRATIONS
    }
    package_manifest_path = root / "PACKAGE_MANIFEST.json"
    package_manifest = json.loads(package_manifest_path.read_text(encoding="utf-8"))
    if package_manifest.get("generated_migration_sha256") != current_generated:
        raise RuntimeError("package manifest is not bound to current generated migrations")
    historical = package_manifest.get("historical_runtime_validation")
    if not isinstance(historical, dict):
        raise RuntimeError("source-locked historical runtime binding is missing")
    expected_historical = {
        "status": "isolated_supabase_branch_postgresql17_fixture_pass",
        "validated_on": "2026-08-24",
        "scope": (
            "synthetic exact-source fixture plus bounded SQL/security tests; "
            "not a full-corpus replay"
        ),
        "receipt": "tests/SUPABASE_BRANCH_VALIDATION_RESULTS.json",
        "receipt_sha256": EXPECTED_HISTORICAL_RECEIPT_SHA256,
        "binding_package_manifest_sha256": EXPECTED_HISTORICAL_PACKAGE_MANIFEST_SHA256,
        "validated_generated_migration_sha256": EXPECTED_HISTORICAL_MIGRATION_SHA256,
    }
    if historical != expected_historical:
        raise RuntimeError("source-locked historical runtime binding changed")
    historical_receipt = root / historical["receipt"]
    if hashlib.sha256(historical_receipt.read_bytes()).hexdigest() != (
        EXPECTED_HISTORICAL_RECEIPT_SHA256
    ):
        raise RuntimeError("source-locked historical runtime receipt changed")

    runtime_status = package_manifest.get("runtime_validation")
    if runtime_status == "isolated_postgresql17_current_build_pass":
        binding = package_manifest.get("runtime_validation_binding")
        if not isinstance(binding, dict):
            raise RuntimeError("current runtime PASS lacks an explicit validation binding")
        if binding.get("validated_generated_migration_sha256") != current_generated:
            raise RuntimeError("current runtime PASS is bound to different migration bytes")
        receipt_relative = binding.get("receipt")
        receipt_sha256 = binding.get("receipt_sha256")
        if not isinstance(receipt_relative, str) or not isinstance(receipt_sha256, str):
            raise RuntimeError("current runtime PASS lacks a receipt path/hash")
        receipt_path = (root / receipt_relative).resolve()
        if root.resolve() not in receipt_path.parents or not receipt_path.is_file():
            raise RuntimeError("current runtime PASS receipt path is invalid")
        if hashlib.sha256(receipt_path.read_bytes()).hexdigest() != receipt_sha256:
            raise RuntimeError("current runtime PASS receipt hash mismatch")
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        if receipt.get("status") != "pass":
            raise RuntimeError("current runtime receipt does not declare pass")
        if receipt.get("postgres_major") != 17:
            raise RuntimeError("current runtime receipt is not PostgreSQL 17")
        if receipt.get("production_mutated") is not False:
            raise RuntimeError("current runtime receipt does not prove production untouched")
        if receipt.get("generated_migration_sha256") != current_generated:
            raise RuntimeError("current runtime receipt is bound to different migrations")
        git_commit_sha = receipt.get("git_commit_sha")
        if not isinstance(git_commit_sha, str) or not re.fullmatch(
            r"[0-9a-f]{40}", git_commit_sha
        ):
            raise RuntimeError("current runtime receipt lacks an exact Git commit SHA")
    elif runtime_status != "current_generated_migrations_not_runtime_validated":
        raise RuntimeError(f"unrecognized current runtime status: {runtime_status!r}")

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
        "C3 Colorado House page furniture": "HOUSE[ \\t]+BILL[ \\t]+[0-9]{2}[A-Z]?-[0-9]{4}",
        "C3 Colorado Senate page furniture": "SENATE[ \\t]+BILL[ \\t]+[0-9]{2}[A-Z]?-[0-9]{3}",
        "C3 Louisiana DIGEST exclusion": "rosetta_v25_mask_nonoperative_digest",
        "C3 Louisiana statutory disclaimer": "constitutes[ \\t\\r\\n]+no[ \\t\\r\\n]+part",
        "C3 Louisiana alternate disclaimer": "does[ \\t\\r\\n]+not[ \\t\\r\\n]+constitute",
        "C3 Louisiana proximity bound": "abs(v_disclaimer - v_heading) > 1024",
        "C3 Louisiana enacting boundary": "enacted[ \\t\\r\\n]+by[ \\t\\r\\n]+the",
        "C3 Louisiana resolution boundary": "(?:by|that)[ \\t\\r\\n]+the",
        "C3 Louisiana joint-resolution boundary": "Section[ \\t]+[0-9]+[.]?",
        "C3 unsupported composite rejection": "unsupported_louisiana_operative_boundary_after_digest",
        "C3 reference-date lower bound": "reference_date_below_provider_observation_floor",
        "C4 help spans": "union all select 'help_entity'",
        "C5 decomposition": "rosetta_v25_decompose_clause",
        "C5 person middle initial": "(?:[ \\t]*,[ \\t]*[a-z]",
        "C5 structural-label boundary": "|Policy|Rule|Schedule",
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

    regression_test = (root / "tests" / "11_open_regressions.sql").read_text(
        encoding="utf-8"
    )
    for fixture in (
        "PAGE 4-HOUSE BILL 26-1432",
        "PAGE 4-HOUSE BILL 25-1117COMPANY shall file.",
        "Rule A. Smith shall file the report.",
        "David R. Poynter shall submit the report.",
        "constitutes no part of the legislative instrument",
        "Proposed law provides that the board shall adopt rules.",
        "date '1969-12-31'",
    ):
        if fixture not in regression_test:
            raise RuntimeError(f"open-regression fixture missing: {fixture}")

    historical_text = (root / "tests" / "VALIDATION_RESULTS.txt").read_text(
        encoding="utf-8"
    )
    if not historical_text.startswith(
        "Rosetta 2.5.13 HISTORICAL validation transcript\n"
        "status: HISTORICAL_SUPERSEDED_NOT_CURRENT_BUILD_PROOF\n"
    ):
        raise RuntimeError("historical text receipt is mislabeled as current proof")

    capture = (root / "tests" / "capture_evidence.py").read_text(encoding="utf-8")
    if '"VALIDATION_RESULTS.txt"' in capture:
        raise RuntimeError("current runtime capture can overwrite historical evidence")
    for token in (
        "ROSETTA_CURRENT_VALIDATION_OUTPUT",
        "current_validation_output_must_be_outside_checksummed_packet",
        "ROOT in result.parents",
    ):
        if token not in capture:
            raise RuntimeError(f"current runtime capture boundary missing: {token}")

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

    test_runner = (root / "tests" / "run_all.py").read_text(encoding="utf-8")
    for transaction_test in ("08_separated_transactions.py", "09_all_lanes_replay.py"):
        if transaction_test not in test_runner:
            raise RuntimeError(f"runtime runner omits {transaction_test}")
    result_position = test_runner.find('print("RESULT:"')
    if result_position < 0:
        raise RuntimeError("runtime runner has no final result emission")
    if test_runner.find("08_separated_transactions.py") > result_position:
        raise RuntimeError("separated-transaction tests are sequenced after the final result")

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
