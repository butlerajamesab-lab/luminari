#!/usr/bin/env python3
"""Disposable PostgreSQL fixture pin substitution. NEVER execute production SQL."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

SOURCE=Path("supabase/migration_sources/retire_expired_genome_legacy_leases_20261017_PREPARED.sql")
OLD_ID="626cf86abbc3a943296e51b526460a1df477e2b3179baf00293e045a927bb5bc"
OLD_ROW="8207cef1e0bff726c4f8f5985bb086a456546efb85de5577f19c4c1c7fd6e561"
OLD_TRIGGER="46ff64116d60ff670ad4c723d77577b0"

def sql(q: str) -> str:
    return subprocess.run(
        ["psql", "-X", "-Atq", "-v", "ON_ERROR_STOP=1", "-c", q],
        check=True, capture_output=True, text=True,
    ).stdout.strip()

def main() -> None:
    if len(sys.argv)!=2 or not sys.argv[1].startswith("/tmp/"):
        raise SystemExit("expected an isolated /tmp/ test output SQL path")
    candidate=SOURCE.read_text()
    if "PREPARED ONLY" not in candidate or "DO $retire_expired_legacy_genome_leases$" not in candidate:
        raise SystemExit("candidate signature changed, refusing")
    if any(x not in candidate for x in [OLD_ID,OLD_ROW,OLD_TRIGGER]):
        raise SystemExit("expected independent production pins missing")
    fixture_id=sql("""
        SELECT encode(extensions.digest(convert_to(
          string_agg(q.queue_id::text,'' ORDER BY q.queue_id),
          'UTF8'),'sha256'),'hex')
        FROM public.civic_genome_legislative_version_queue q
        JOIN public.civic_genome_bill_version v USING(bill_version_id)
        WHERE v.rosetta_extraction_run_id IS NOT NULL
          AND (q.queue_state='submitted' OR q.locked_at IS NOT NULL OR q.locked_by IS NOT NULL)
    """)
    fixture_row=sql("""
        SELECT encode(extensions.digest(convert_to(
          string_agg(encode(extensions.digest(convert_to(
             to_jsonb(q)::text,'UTF8'),'sha256'),'hex'),
             '' ORDER BY q.queue_id),
          'UTF8'),'sha256'),'hex')
        FROM public.civic_genome_legislative_version_queue q
        JOIN public.civic_genome_bill_version v USING(bill_version_id)
        WHERE v.rosetta_extraction_run_id IS NOT NULL
          AND (q.queue_state='submitted' OR q.locked_at IS NOT NULL OR q.locked_by IS NOT NULL)
    """)
    fixture_trigger=sql("""
        SELECT md5(pg_get_functiondef(t.tgfoid))
        FROM pg_trigger t
        WHERE t.tgrelid='public.civic_genome_legislative_version_queue'::regclass
          AND t.tgname='preserve_legislative_version_queue_state_v1'
    """)
    if any(len(x)!=n for x,n in [(fixture_id,64),(fixture_row,64),(fixture_trigger,32)]):
        raise SystemExit("invalid fixture digest")
    substituted=candidate.replace(OLD_ID,fixture_id).replace(OLD_ROW,fixture_row).replace(OLD_TRIGGER,fixture_trigger)
    if OLD_ID in substituted or OLD_ROW in substituted:
        raise SystemExit("production data pins unexpectedly survived fixture substitution")
    Path(sys.argv[1]).write_text(substituted)
    print("Wrote exact fixture-only lease retirement candidate")

if __name__=="__main__":
    main()
