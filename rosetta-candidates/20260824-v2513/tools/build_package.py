#!/usr/bin/env python3
"""Regenerate, statically verify, and checksum the individual-file packet.

No archive is created by default. Pass an explicit output path only when an
archive is separately authorized.
"""
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
BRANCH_RECEIPT = ROOT / "tests" / "SUPABASE_BRANCH_REGRESSION_REPAIR_RESULTS.json"


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
    if len(sys.argv) > 2:
        raise SystemExit("usage: build_package.py [EXPLICIT_ARCHIVE_PATH]")
    output = Path(sys.argv[1]).resolve() if len(sys.argv) == 2 else None

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
    static_output = run(sys.executable, "tests/static_checks.py")

    branch_receipt = json.loads(BRANCH_RECEIPT.read_text(encoding="utf-8"))
    if branch_receipt.get("status") != "bounded_pass_full_corpus_blocked":
        raise SystemExit("current branch receipt is missing its bounded-pass/full-corpus-blocked status")
    if branch_receipt.get("database", {}).get("production_mutated") is not False:
        raise SystemExit("Supabase branch receipt does not prove production_mutated=false")
    if branch_receipt.get("database", {}).get("branch_merged") is not False:
        raise SystemExit("Supabase branch receipt does not prove branch_merged=false")
    lane_receipts = branch_receipt.get("separated_transaction_replay", {}).get("lanes", [])
    if len(lane_receipts) != 9:
        raise SystemExit(f"expected 9 branch lane receipts, found {len(lane_receipts)}")
    runtime_validation = "bounded_disposable_supabase_postgresql17_pass_full_corpus_blocked"

    runtime_available = bool(shutil.which("psql") or importlib.util.find_spec("pgserver"))
    static_receipt = (
        "Rosetta 2.5.13 current-build static verification\n"
        "status: PASS\n"
        "local_runtime_postgresql_executed: false\n"
        f"runtime_tool_detected: {str(runtime_available).lower()}\n"
        f"isolated_branch_runtime_validation: {runtime_validation}\n"
        f"isolated_branch_receipt_sha256: {digest(BRANCH_RECEIPT)}\n"
        "full_corpus_replay_executed: false\n"
        "full_corpus_status: blocked_by_1038_control_runs_to_1000_unique_sources_manifest_contract\n"
        "production_touched: false\n\n"
        "GENERATOR RUN 1\n" + first_output + "\n\n"
        "GENERATOR RUN 2\n" + second_output + "\n\n"
        "CONTROL FIDELITY\n" + fidelity_output + "\n\n"
        "STATIC CONTRACT\n" + static_output + "\n"
    )
    (ROOT / "STATIC_VERIFICATION_RESULTS.txt").write_text(static_receipt, encoding="utf-8")

    manifest = {
        "artifact": "rosetta-v2513-regression-repair-20260830",
        "base_commit": "05327dca408c12b63268ea1c6ef80ee3775bb643",
        "base_root": "rosetta-candidates/20260824-v2513",
        "original_sha256sums_sha256": "c91257d43357d8cc740fda145a71284fcf2d4732da6869d6f0091ebe8d123aca",
        "original_directory_file_count": 126,
        "directory_file_count_including_sha256sums": len(package_files()) + 1,
        "candidate_engine": "rosetta-v3-deterministic-sql-2.5.13",
        "candidate_rule_set": "rosetta-five-layer-structural-correctness-2.5.13",
        "control_engine": "rosetta-v3-deterministic-sql-2.5.11",
        "control_manifest_sha256": "3602eb80fee71a4009bf7a04c521fec62e2d1f17f8ea5b027500905cd8366639",
        "generator_deterministic": True,
        "control_function_fidelity": {"matching": 51, "mismatching": 0},
        "quarantine_run_count": 1038,
        "runtime_validation": runtime_validation,
        "runtime_validation_scope": "exact 24592/24593 regressions, bounded SQL/security tests, forced timeout, and nine-closure exact-source replay through independent connector transactions; not a full-corpus replay",
        "runtime_validation_receipt": str(BRANCH_RECEIPT.relative_to(ROOT)),
        "runtime_validation_receipt_sha256": digest(BRANCH_RECEIPT),
        "production_mutation": False,
        "production_promotion_write_included": False,
        "production_cutover_write_included": False,
        "sealed_corpus_status": "blocked_by_1038_control_runs_to_1000_unique_sources_manifest_contract",
        "source_inventory_format": "individual files plus SHA256SUMS; no archive by default",
        "generated_migration_sha256": first,
    }
    (ROOT / "PACKAGE_MANIFEST.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )

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

    result = {
        "archive_created": output is not None,
        "inventory_files": len(files) + 1,
        "runtime_validation": runtime_validation,
        "sha256sums_sha256": digest(ROOT / "SHA256SUMS"),
    }
    if output is not None:
        output.parent.mkdir(parents=True, exist_ok=True)
        if output.exists():
            output.unlink()
        top = "rosetta-v2513-regression-repair-20260830"
        with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for path in sorted([ROOT / "SHA256SUMS", *files]):
                relative = path.relative_to(ROOT)
                info = zipfile.ZipInfo(f"{top}/{relative.as_posix()}", (2026, 8, 30, 0, 0, 0))
                mode = 0o755 if path.suffix in {".py", ".sh"} else 0o644
                info.external_attr = (mode & 0xFFFF) << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                archive.writestr(info, path.read_bytes(), compresslevel=9)
        result.update({
            "output": str(output),
            "archive_sha256": digest(output),
            "archive_bytes": output.stat().st_size,
        })
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
