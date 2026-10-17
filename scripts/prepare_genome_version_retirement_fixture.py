#!/usr/bin/env python3
"""DISPOSABLE CI ONLY. Replace immutable production pins with isolated fixture pins.

Never rewrite or execute the production PREPARED source file in-place.
PostgreSQL is already the only authority for both current fixture hashes
and the installed fixture trigger-function hashes.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

SOURCE = Path(
    "supabase/migration_sources/"
    "purge_disqualified_genome_version_receipts_20261017_PREPARED.sql"
)

PRODUCTION_TRIGGER_PINS = {
    "civic_genome_bill_version_enqueue_prism_v22": "70f8d6eeda23adedb4cc863e097874fa",
    "civic_genome_bill_version_lineage_guard": "29c2a50392a6d907af7dd081cc2370e6",
    "civic_genome_bill_version_prism_late_binding": "97dd900add40656464be6c4914101d73",
    "civic_genome_bill_version_terminal_state_guard": "dcf87cf361c4e8a4ad70ad27fab113bf",
    "civic_genome_guard_rosetta_generation_upgrade_version_v1": "b73abd0266245249ae8f1e6b143308f5",
    "enqueue_docket_current_authoritative_version_v1": "aedeefd16eac77249a25640afbdc502b",
    "wake_civic_genome_amendments_for_base_v1": "95385ac910458cab2defd38e111836b8",
    "zz_civic_genome_block_bill_version_rosetta_receipt_v1": "b29c9699c7831806f7ddcf346e309e22",
    "preserve_legislative_version_queue_state_v1": "46ff64116d60ff670ad4c723d77577b0",
}

PRODUCTION_DATA_PINS = {
    "version_ids": "f8c650f609b97cd409c7faa2a3712229be59bd97a32f051086040fb3706e4724",
    "version_rows": "3727cfd4ac781b812c941755c1cce0a8da233945bcc2dc36f060ad06dbf17121",
    "queue_ids": "9631349f707d971600fef4f3c095f996c1a58cafb7c27df36649c0ee9b28aa58",
    "queue_rows": "d962de134fc866b7ab6217db0c1864bc1c51666cb1e94629c5bad81d1661b49b",
}

def sql(statement: str) -> str:
    return subprocess.run(
        ["psql", "-X", "-Atq", "-v", "ON_ERROR_STOP=1", "-c", statement],
        check=True, capture_output=True, text=True,
    ).stdout.strip()

def row_sha(table: str, row_id: str, join: str, full: bool) -> str:
    expression = (
        f"encode(extensions.digest(convert_to(to_jsonb(t)::text,'UTF8'),'sha256'),'hex')"
        if full else f"t.{row_id}::text"
    )
    source_predicate = (
        "t.rosetta_extraction_run_id IS NOT NULL"
        if table == "civic_genome_bill_version"
        else "v.rosetta_extraction_run_id IS NOT NULL"
    )
    return sql(f"""
      SELECT encode(extensions.digest(convert_to(
        string_agg({expression},'' ORDER BY t.{row_id}),
        'UTF8'),'sha256'),'hex')
      FROM public.{table} t
      {join}
      WHERE {source_predicate};
    """)

def main() -> None:
    if len(sys.argv) != 2 or not sys.argv[1].startswith("/tmp/"):
        raise SystemExit("usage: prepare_genome_version_retirement_fixture.py /tmp/pinned.sql")
    dest = Path(sys.argv[1])
    source = SOURCE.read_text()
    if "PREPARED ONLY." not in source or "DO $retire_obsolete_genome_version_receipts$" not in source:
        raise SystemExit("Unexpected production candidate — refusing fixture substitution")
    count = int(sql("SELECT count(*) FROM public.civic_genome_bill_version WHERE rosetta_extraction_run_id IS NOT NULL;"))
    queue_count = int(sql("""SELECT count(*) FROM public.civic_genome_legislative_version_queue q
                             JOIN public.civic_genome_bill_version v USING (bill_version_id)
                             WHERE v.rosetta_extraction_run_id IS NOT NULL;"""))
    if count != 6 or queue_count != 6:
        raise SystemExit(f"Unexpected fixture counts: versions={count}, queue={queue_count}")
    fixture_pins = {
        "version_ids": row_sha(
            "civic_genome_bill_version", "bill_version_id", "", False
        ),
        "version_rows": row_sha(
            "civic_genome_bill_version", "bill_version_id", "", True
        ),
        "queue_ids": row_sha(
            "civic_genome_legislative_version_queue", "queue_id",
            "JOIN public.civic_genome_bill_version v USING (bill_version_id)", False
        ),
        "queue_rows": row_sha(
            "civic_genome_legislative_version_queue", "queue_id",
            "JOIN public.civic_genome_bill_version v USING (bill_version_id)", True
        ),
    }
    trigger_rows = sql("""SELECT tgname||'|'||md5(pg_get_functiondef(tgfoid))
      FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (
        'public.civic_genome_bill_version'::regclass,
        'public.civic_genome_legislative_version_queue'::regclass);""")
    fixture_triggers = dict(line.split("|", 1) for line in trigger_rows.splitlines())
    if fixture_triggers.keys() != PRODUCTION_TRIGGER_PINS.keys():
        raise SystemExit("Fixture trigger inventory does not match production pinned inventory")
    for key, production in PRODUCTION_TRIGGER_PINS.items():
        if production not in source:
            raise SystemExit(f"Missing production pin for {key}")
        source = source.replace(production, fixture_triggers[key])
    for key, production in PRODUCTION_DATA_PINS.items():
        if production not in source or len(fixture_pins[key]) != 64:
            raise SystemExit(f"Missing/invalid production data pin {key}")
        source = source.replace(production, fixture_pins[key])
    if "9428" not in source:
        raise SystemExit("Missing pinned production cardinality")
    source = source.replace("9428", "6")
    if any(pin in source for pin in PRODUCTION_DATA_PINS.values()):
        raise SystemExit("A production data pin unexpectedly survived fixture substitution")
    dest.write_text(source)
    print(f"Prepared fixture-only retirement with 6 exact version rows and 6 queues at {dest}")

if __name__ == "__main__":
    main()
