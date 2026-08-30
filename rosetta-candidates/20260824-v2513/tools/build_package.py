#!/usr/bin/env python3
"""Regenerate, statically verify, checksum, and deterministically ZIP the packet."""
from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import zipfile


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT.parent.parent / "rosetta-v2513-fixed-20260824.zip"
GENERATED = [
    ROOT / "migrations" / name
    for name in (
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
]
BRANCH_RECEIPT = ROOT / "tests" / "SUPABASE_BRANCH_VALIDATION_RESULTS.json"
PACKAGE_MANIFEST = ROOT / "PACKAGE_MANIFEST.json"
SOURCE_LOCKED_PACKAGE_MANIFEST_SHA256 = (
    "efa789b26afbf08bb6161d2d03237f090cc8711721d9763378c0d7f0c855c675"
)
SOURCE_LOCKED_BRANCH_RECEIPT_SHA256 = (
    "e68029633806c6c5bbf8289de554ebf304d9eb92f3cd193aab5871f4db23fa62"
)
SOURCE_LOCKED_VALIDATED_MIGRATION_SHA256 = {
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


def run(*args: str) -> str:
    proc = subprocess.run(
        args,
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        check=False,
    )
    if proc.returncode:
        raise SystemExit(f"command failed ({' '.join(args)}):\n{proc.stdout}")
    return proc.stdout.strip()


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def generated_hashes() -> dict[str, str]:
    return {str(path.relative_to(ROOT)): digest(path) for path in GENERATED}


def remove_caches() -> None:
    for cache in ROOT.rglob("__pycache__"):
        shutil.rmtree(cache)
    for compiled in ROOT.rglob("*.py[co]"):
        compiled.unlink()


def package_files() -> list[Path]:
    excluded = {ROOT / "SHA256SUMS"}
    return sorted(
        path
        for path in ROOT.rglob("*")
        if path.is_file() and path not in excluded and "__pycache__" not in path.parts
    )


def main() -> int:
    output = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_OUTPUT

    first_output = run(sys.executable, "tools/generate.py")
    first = generated_hashes()
    second_output = run(sys.executable, "tools/generate.py")
    second = generated_hashes()
    if first != second:
        raise SystemExit("generator is not deterministic across consecutive runs")

    fidelity_output = run(sys.executable, "tools/check_control_fidelity.py")
    compile_targets = [str(path.relative_to(ROOT)) for folder in ("tools", "tests")
                       for path in sorted((ROOT / folder).glob("*.py"))]
    run(sys.executable, "-Wd", "-m", "py_compile", *compile_targets)
    remove_caches()

    branch_receipt = json.loads(BRANCH_RECEIPT.read_text(encoding="utf-8"))
    if digest(BRANCH_RECEIPT) != SOURCE_LOCKED_BRANCH_RECEIPT_SHA256:
        raise SystemExit("source-locked Supabase branch receipt hash changed")
    if branch_receipt.get("status") != "pass_with_explicit_scope_limit":
        raise SystemExit("source-locked Supabase receipt lost its historical bounded PASS")
    if branch_receipt.get("database", {}).get("production_mutated") is not False:
        raise SystemExit("historical Supabase branch receipt does not prove production_mutated=false")
    if branch_receipt.get("database", {}).get("branch_merged") is not False:
        raise SystemExit("historical Supabase branch receipt does not prove branch_merged=false")

    historical_runtime = {
        "status": "isolated_supabase_branch_postgresql17_fixture_pass",
        "validated_on": branch_receipt.get("validated_on"),
        "scope": (
            "synthetic exact-source fixture plus bounded SQL/security tests; "
            "not a full-corpus replay"
        ),
        "receipt": str(BRANCH_RECEIPT.relative_to(ROOT)),
        "receipt_sha256": SOURCE_LOCKED_BRANCH_RECEIPT_SHA256,
        "binding_package_manifest_sha256": SOURCE_LOCKED_PACKAGE_MANIFEST_SHA256,
        "validated_generated_migration_sha256": SOURCE_LOCKED_VALIDATED_MIGRATION_SHA256,
    }

    runtime_validation = "current_generated_migrations_not_runtime_validated"

    manifest = {
        "artifact": "rosetta-v2513-fixed-20260824",
        "candidate_engine": "rosetta-v3-deterministic-sql-2.5.13",
        "candidate_rule_set": "rosetta-five-layer-structural-correctness-2.5.13",
        "control_engine": "rosetta-v3-deterministic-sql-2.5.11",
        "control_manifest_sha256": "3602eb80fee71a4009bf7a04c521fec62e2d1f17f8ea5b027500905cd8366639",
        "generator_deterministic": True,
        "control_function_fidelity": {"matching": 51, "mismatching": 0},
        "quarantine_run_count": 1038,
        "runtime_validation": runtime_validation,
        "runtime_validation_scope": (
            "current generated migrations require a fresh isolated PostgreSQL "
            "17 run; the pull-request runtime job is the current-build gate"
        ),
        "historical_runtime_validation": historical_runtime,
        "production_mutation": False,
        "production_promotion_write_included": False,
        "production_cutover_write_included": False,
        "generated_migration_sha256": first,
    }
    PACKAGE_MANIFEST.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )

    # Static verification runs only after the package manifest has been
    # rebound to the current generated bytes and any stale runtime PASS has
    # been demoted.
    static_output = run(sys.executable, "tests/static_checks.py")
    runtime_available = bool(shutil.which("psql") or importlib.util.find_spec("pgserver"))
    static_receipt = (
        "Rosetta 2.5.13 current-build static verification\n"
        "status: PASS\n"
        "local_runtime_postgresql_executed: false\n"
        f"runtime_tool_detected: {str(runtime_available).lower()}\n"
        f"current_build_runtime_validation: {runtime_validation}\n"
        "current_build_runtime_gate: isolated PostgreSQL 17 pull-request job\n"
        "historical_branch_runtime_validation_is_current: false\n"
        f"historical_branch_receipt_sha256: {digest(BRANCH_RECEIPT)}\n"
        "production_touched: false\n\n"
        "GENERATOR RUN 1\n" + first_output + "\n\n"
        "GENERATOR RUN 2\n" + second_output + "\n\n"
        "CONTROL FIDELITY\n" + fidelity_output + "\n\n"
        "STATIC CONTRACT\n" + static_output + "\n"
    )
    (ROOT / "STATIC_VERIFICATION_RESULTS.txt").write_text(static_receipt, encoding="utf-8")

    remove_caches()
    files = package_files()
    checksum_lines = [f"{digest(path)}  {path.relative_to(ROOT)}" for path in files]
    (ROOT / "SHA256SUMS").write_text("\n".join(checksum_lines) + "\n", encoding="utf-8")

    # Re-read every byte after writing the manifest; no unchecked file enters
    # the archive. SHA256SUMS intentionally excludes itself.
    for line in checksum_lines:
        expected, relative = line.split("  ", 1)
        actual = digest(ROOT / relative)
        if actual != expected:
            raise SystemExit(f"post-build checksum mismatch: {relative}")

    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        output.unlink()
    top = "rosetta-v2513-fixed-20260824"
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted([ROOT / "SHA256SUMS", *files]):
            relative = path.relative_to(ROOT)
            info = zipfile.ZipInfo(f"{top}/{relative.as_posix()}", (2026, 8, 24, 0, 0, 0))
            mode = 0o755 if path.suffix in {".py", ".sh"} else 0o644
            info.external_attr = (mode & 0xFFFF) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, path.read_bytes(), compresslevel=9)

    print(json.dumps({
        "output": str(output),
        "archive_sha256": digest(output),
        "archive_bytes": output.stat().st_size,
        "archive_files": len(files) + 1,
        "runtime_validation": runtime_validation,
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
