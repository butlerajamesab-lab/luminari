"""Byte-level checks for the global replay truth packet.

These checks prove only properties visible in source. PostgreSQL compilation
and state-machine behavior are recorded separately as bounded preview evidence.
"""

from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "migrations"
EXPECTED = [
    "01_truthful_campaign_dispositions.sql",
    "02_observed_outcomes_only.sql",
    "03_universal_manifest_and_diff.sql",
    "04_universal_promotion_gate.sql",
    "05_terminal_campaign_result_integrity.sql",
    "06_truthful_mixed_outcome_compatibility.sql",
]
ALLOWED_GENERATION_HASHES = {
    "626f07d085d088c145f809de7891d36b70cfc85dee5fe69190f7108914410264",
    "db2ed9b12dc1d95c14caa779ac50955bee4a5085190fb2fb356f5da4734a5727",
}


def lexical_balance(path: Path) -> None:
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
            char = fragment[i]
            if char in ("'", '"'):
                quote = char
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
            if char == "$":
                match = re.match(r"\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$", fragment[i:])
                if match:
                    delimiter = match.group(0)
                    start = i + len(delimiter)
                    end = fragment.find(delimiter, start)
                    if end < 0:
                        raise RuntimeError(
                            f"{path}: unterminated dollar quote {delimiter}"
                        )
                    if not body:
                        scan(fragment[start:end], body=True)
                    i = end + len(delimiter)
                    continue
            if char == "(":
                parens += 1
            elif char == ")":
                parens -= 1
                if parens < 0:
                    raise RuntimeError(f"{path}: unmatched closing parenthesis")
            i += 1
        if block_depth:
            raise RuntimeError(f"{path}: unterminated block comment")
        if parens:
            raise RuntimeError(f"{path}: parenthesis balance is {parens}")

    scan(text)


def require(text: str, *tokens: str) -> None:
    missing = [token for token in tokens if token not in text]
    if missing:
        raise RuntimeError(f"required contract tokens missing: {missing}")


def main() -> None:
    present = sorted(path.name for path in MIGRATIONS.glob("*.sql"))
    if present != EXPECTED:
        raise RuntimeError(f"migration set differs: expected {EXPECTED}, got {present}")

    texts: dict[str, str] = {}
    for name in EXPECTED:
        path = MIGRATIONS / name
        lexical_balance(path)
        texts[name[:2]] = path.read_text(encoding="utf-8")

    combined = "\n".join(texts.values())
    forbidden_cases = re.compile(
        r"B26[- ]?0775|\bS1041\b|Washington timeout|North Carolina|LegiScan",
        re.IGNORECASE,
    )
    if match := forbidden_cases.search(combined):
        raise RuntimeError(f"source-specific case literal present: {match.group(0)!r}")

    literal_hashes = set(re.findall(r"(?<![0-9a-f])[0-9a-f]{64}(?![0-9a-f])", combined))
    unexpected_hashes = literal_hashes - ALLOWED_GENERATION_HASHES
    if unexpected_hashes:
        raise RuntimeError(f"unexpected literal 64-byte identities: {unexpected_hashes}")

    if re.search(
        r"['\"]https?://[^'\"]+['\"]|"
        r"['\"][0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-"
        r"[0-9a-f]{4}-[0-9a-f]{12}['\"]",
        combined,
        re.IGNORECASE,
    ):
        raise RuntimeError("literal source URL or UUID present in a migration")

    require(
        texts["01"],
        "replay_campaign_source_disposition",
        "replay_result in ('pending','pass','nonpass')",
        "'timed_out','retry_exhausted','failed_terminal'",
        "'coverage_complete', v_total = v_accounted",
        "'promotion_eligible',",
        "replay_campaign_reap_expired",
        "replay_campaign_universal_gate",
        "left join rosetta_replay.replay_run_binding binding",
        "missing_disposition as",
    )
    require(
        texts["02"],
        "expectation_is_advisory",
        "authorization_scope = 'full_candidate_generation'",
        "observed_terminal_outcome",
        "historical_expectation",
        "campaign_result', 'nonpass'",
    )
    if "terminal outcome differs from immutable expectation" in texts["02"]:
        raise RuntimeError("observed outcomes are still controlled by expectations")

    require(
        texts["03"],
        "required_terminal_outcome','completed'",
        "'per_source_exceptions',false",
        "per-source expected-outcome manifests are disabled",
        "per-source correction labels are disabled",
        "universal-campaign-manifest-v1",
        "p_control_defect is not null and p_candidate_defect is null",
    )
    improvement = texts["03"].index(
        "p_control_defect is not null and p_candidate_defect is null"
    )
    unexplained_addition = texts["03"].index(
        "p_control_value is null and p_candidate_value is not null"
    )
    if improvement > unexplained_addition:
        raise RuntimeError("evidence-derived defect removal is classified too late")

    require(
        texts["04"],
        "replay_closure_no_source_identity_gate",
        "literal source identities occur in closure",
        "global_promotion_write_lock",
        "universal_validation_requirement",
        "diff.status in ('regression','unexplained')",
        "diff.candidate_defect is not null",
        "legacy promotion gate is disabled",
        "replay_campaign_promotion_gate",
        "scope','universal_authorized_corpus'",
        "'per_source_exceptions',false",
        "'rejected_sources',0",
        "'timed_out_sources',0",
    )
    if "regression_disposition" in texts["04"]:
        raise RuntimeError("universal promotion still consults per-diff dispositions")
    if "terminal_outcome in ('completed','rejected')" in texts["04"]:
        raise RuntimeError("publication still treats rejection as a passing outcome")

    require(
        texts["05"],
        "replay_campaign_state_result_check",
        "campaign_state in ('prepared','running') and replay_result = 'pending'",
        "campaign_state = 'completed' and replay_result in ('pass','nonpass')",
        "campaign_state in ('blocked','stopped') and replay_result = 'nonpass'",
        "replay_campaign_finalize_next",
        "stop_replay_campaign",
        "replay_result = 'nonpass'",
        "'replay_result','nonpass'",
    )
    if "campaign_state in ('completed','blocked','stopped') then 'nonpass'" not in texts["05"]:
        raise RuntimeError("historical terminal campaigns are not conservatively nonpass")

    require(
        texts["06"],
        "A corpus result and a source result are different facts",
        "replay_campaign_truth_gate",
        "truthful-global-compatibility-v1",
        "production-admissible sources did not complete",
        "'timed_out_sources')::bigint <> 0",
        "'rejected_sources',(progress->>'rejected_sources')::bigint",
        "'source_outcome_semantics','observed_not_expected'",
        "seal_truthful_campaign_manifest",
        "truthful_campaign_promotion_gate",
        "truthful-global-promotion-v1",
        "'all_sources_parsed'",
        "'per_source_exceptions',false",
        "lock table public.extraction_run in share mode",
        "current_production_engine_version",
        "manifest members have a stale or inexact production baseline",
    )
    if "'rejected_sources',0" in texts["06"]:
        raise RuntimeError("truthful promotion hides observed source rejections")
    if "required_terminal_outcome','completed'" in texts["06"]:
        raise RuntimeError("mixed-outcome compatibility still requires every source to parse")

    print("STATIC CHECKS PASS")
    print("migrations=6")
    print("source_specific_literals=0")
    print("allowed_generation_identity_hashes=2")


if __name__ == "__main__":
    main()
