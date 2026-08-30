#!/usr/bin/env python3
"""Run the strict validator and capture *that invocation's* complete output.

This wrapper never carries forward a transcript from an older candidate. A
failed or unavailable PostgreSQL runtime is recorded as such and exits
nonzero; it is never rewritten as PASS. Current output is always written
outside the checksummed packet, whose historical receipts are immutable.
"""
from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_ENV = "ROSETTA_CURRENT_VALIDATION_OUTPUT"
DEFAULT_RESULT = (
    Path(os.environ.get("RUNNER_TEMP", tempfile.gettempdir()))
    / "rosetta-v2513-current-runtime-validation.txt"
)


def result_path() -> Path:
    configured = os.environ.get(OUTPUT_ENV)
    result = Path(configured) if configured else DEFAULT_RESULT
    result = result.resolve()
    if result == ROOT or ROOT in result.parents:
        raise SystemExit(
            "current_validation_output_must_be_outside_checksummed_packet"
        )
    if not result.parent.is_dir():
        raise SystemExit("current_validation_output_parent_missing")
    return result


def main() -> int:
    result = result_path()
    proc = subprocess.run(
        [sys.executable, str(ROOT / "tests" / "run_all.py")],
        cwd=ROOT,
        env=os.environ.copy(),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        check=False,
    )
    status = "PASS" if proc.returncode == 0 else "FAIL_OR_UNAVAILABLE"
    payload = (
        "Rosetta 2.5.13 current-build runtime validation\n"
        f"status: {status}\n"
        f"exit_code: {proc.returncode}\n"
        "command: python3 tests/run_all.py\n"
        "production_target: forbidden by runner preflight\n\n"
        + proc.stdout
    )
    result.write_text(payload, encoding="utf-8")
    print(payload, end="")
    print(f"receipt_path: {result}")
    return proc.returncode


if __name__ == "__main__":
    raise SystemExit(main())
