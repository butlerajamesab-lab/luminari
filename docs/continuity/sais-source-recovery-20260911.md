# SAIS source import recovery

The source import began on August 10 and remained incomplete. Live readback on
September 11 found the import-run row, 26 documents and one resource candidate,
with no routing items, deadlines or overlap groups. All 28 existing rows match
the recovered seed on their immutable source fields.

The exact recovered seed is held as `20260810090001_sais_resource_import_seed.sql`.
SHA-256: `50280f17266285322ef3a6e7491bff5fc0afbffab950f666e49fede6e4c7c44e`.
The underlying registry hash is
`78ed58100c92296b881c2f2dd54f97c2c3aef36942796cc302d4a4c0ea57efdb`.

The existing `sais_import` tables and immutable-candidate guard own this data.
Recovery performs DML against those tables; it adds no schema or migration-history
entry. The scripts do not publish resources, rewrite source claims, merge overlap
groups, or import Rosetta execution into Lighthouse.

## Reproduce

Install the pinned parser with
`python -m pip install -r scripts/requirements-registry-reconciliation.txt`.
Run `python -m unittest discover -s scripts -p test_reconcile_sais_source_seed.py`.
Compile with `python scripts/reconcile-sais-source-seed.py --seed PATH --out NEW_DIRECTORY`.
The compiler requires the exact inspected bytes, parses PostgreSQL syntax,
validates the source tables, run ID, row widths, distinct primary keys and counts,
and creates ordered preflight and apply SQL files.

Inspect preflight results before applying. Each apply transaction rechecks
immutable fields under a table lock, inserts missing rows with `ON CONFLICT DO
NOTHING`, and verifies the inserted values before commit. A differing existing
row aborts its batch. Resume after an interruption by rerunning the same batches.
No existing source record is overwritten.

Expected source rows: one run, 26 documents, 192 candidates, 260 routing items,
656 deadline fields and 19 overlap groups. After import, verify these exact
counts and replay `resource_fingerprint_v1`, `routing_hash_v1` and
`deadline_hash_v1`. Source completion is separate from canonical promotion and
from verification of the underlying legal or resource claims.
