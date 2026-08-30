"""Strict disposable-PostgreSQL validation runner.

Default: use the optional ``pgserver`` Python package to create a fresh local
datadir. Alternative: point at an EMPTY disposable PostgreSQL database with
``ROSETTA_TEST_DATABASE_URL`` and explicitly acknowledge the destructive test
scope with ``ROSETTA_DISPOSABLE_ACK=I_UNDERSTAND``.

This runner refuses any database containing ``public.extraction_run`` or either
package-owned schema. It never accepts a production database as a test target.
"""
import glob, os, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXTERNAL_URI = os.environ.get("ROSETTA_TEST_DATABASE_URL")
srv = None

if EXTERNAL_URI:
    if os.environ.get("ROSETTA_DISPOSABLE_ACK") != "I_UNDERSTAND":
        raise SystemExit(
            "ROSETTA_TEST_DATABASE_URL requires "
            "ROSETTA_DISPOSABLE_ACK=I_UNDERSTAND (empty disposable DB only)"
        )
    PSQL = os.environ.get("PSQL_BIN") or shutil.which("psql")
    if not PSQL:
        raise SystemExit("psql not found; set PSQL_BIN")
    URI = EXTERNAL_URI
else:
    sys.path.append(os.path.expanduser("~/.local/lib/python3.12/site-packages"))
    os.environ.setdefault("XDG_RUNTIME_DIR", "/tmp/xdg")
    os.makedirs("/tmp/xdg", exist_ok=True)
    try:
        import pgserver
        from pgserver.postgres_server import POSTGRES_BIN_PATH
    except ModuleNotFoundError as exc:
        raise SystemExit(
            "pgserver is not installed. Install the disposable runner dependency "
            "or provide ROSETTA_TEST_DATABASE_URL for an empty disposable DB."
        ) from exc
    srv = pgserver.get_server(tempfile.mkdtemp(prefix="rosetta_v2513_validation_"))
    PSQL = str(POSTGRES_BIN_PATH / "psql")
    URI = srv.get_uri()


def psql_bytes(payload: bytes, *, transaction: bool = False):
    args = [PSQL, "-X", "-v", "ON_ERROR_STOP=1"]
    if transaction:
        args.append("-1")
    args.append(URI)
    return subprocess.run(args, input=payload, capture_output=True)


def scalar(sql: str) -> str:
    p = subprocess.run(
        [PSQL, "-X", "-v", "ON_ERROR_STOP=1", "-At", URI, "-c", sql],
        capture_output=True,
        text=True,
    )
    if p.returncode:
        raise SystemExit(p.stderr[:2000])
    return p.stdout.strip()


# Absolute safety preflight. The test suite creates and later removes only the
# candidate/replay schemas, but it must start in a database with neither those
# schemas nor a production Rosetta table.
unsafe = scalar(
    "select (exists(select 1 from pg_tables where schemaname='public' "
    "and tablename='extraction_run') or exists(select 1 from pg_namespace "
    "where nspname in ('rosetta_v2513','rosetta_replay')))::text;"
)
if unsafe != "false":
    raise SystemExit("refusing validation: target is not an empty disposable Rosetta database")

# Digest shim only when pgcrypto is absent. Existing extension-owned digest
# functions are never replaced.
shim = psql_bytes(
    b"""
create schema if not exists extensions;
do $block$
begin
  if to_regprocedure('extensions.digest(text,text)') is null then
    execute $ddl$create function extensions.digest(data text, type text) returns bytea
      language sql immutable strict as $body$
      select case type when 'sha256' then sha256(convert_to(data,'UTF8')) else null end
      $body$$ddl$;
  end if;
  if to_regprocedure('extensions.digest(bytea,text)') is null then
    execute $ddl$create function extensions.digest(data bytea, type text) returns bytea
      language sql immutable strict as $body$
      select case type when 'sha256' then sha256(data) else null end
      $body$$ddl$;
  end if;
end;
$block$;
"""
)
if shim.returncode:
    raise SystemExit(shim.stderr.decode("utf-8", "replace")[:2000])

def run(path):
    p = psql_bytes(open(path, "rb").read(), transaction=True)
    if p.returncode == 0:
        return "OK", ""
    errs = [l for l in p.stderr.decode().splitlines() if l.startswith(("ERROR", "PSQLException"))
            or "TEST_FAIL" in l or "CONTEXT" in l]
    return "FAIL", " | ".join(errs[:5])

APPLY_ORDER = ["01_durable_replay_attempts.sql","02_candidate_schema.sql","03_control_closure_2511.sql",
 "04_lane_c1_measured_actor_bound.sql","05_lane_c2_actor_source_corruption.sql",
 "06_lane_c3_projection_contract.sql","07_lane_c4_occurrence_aware_spans.sql",
 "08_lane_c5_clause_decomposition.sql","09_lane_c6_modal_retyping_revalidation.sql",
 "10_lane_c7_charset_receipt_gate.sql","17_convergence_candidate_2513.sql",
 "11_sealed_corpus_manifest.sql","12_replay_runner.sql","13_object_diff.sql",
 "14_promotion_gates.sql","15_guarded_promotion.sql","16_guarded_cutover_catchup.sql",
 "18_candidate_security_lockdown.sql"]

fails = 0
# static preflight: recompute the captured 2.5.11 registry manifest
# byte-for-byte BEFORE any database setup, so a conflated or drifted capture
# fails before a single migration runs.
try:
    sys.path.insert(0, os.path.join(ROOT, "tests"))
    from static_checks import verify_captured_manifest
    sha, md5, size = verify_captured_manifest(ROOT)
    print("STATIC manifest-2.5.11.json".ljust(60), "OK")
    print("    sha256=%s md5=%s bytes=%d" % (sha, md5, size))
except Exception as e:
    print("STATIC manifest-2.5.11.json".ljust(60), "FAIL")
    print("   ", e); fails += 1

for f in (APPLY_ORDER if fails == 0 else []):
    st, detail = run(os.path.join(ROOT, "migrations", f))
    print(("MIGRATION " + f).ljust(60), st)
    if st != "OK":
        print("   ", detail); fails += 1
        break

if fails == 0:
    for f in sorted(glob.glob(os.path.join(ROOT, "tests", "[0-9][0-9]_*.sql"))):
        if os.path.basename(f).startswith("99_"):
            continue  # cleanup postconditions run last, after migration 99
        st, detail = run(f)
        print(("TEST " + os.path.basename(f)).ljust(60), st)
        if st != "OK":
            print("   ", detail); fails += 1

if fails == 0:
    # 08/09: genuine transaction-separation and every-lane replay proofs.
    for script_name in (
        "08_separated_transactions.py",
        "09_all_lanes_replay.py",
        "11_exact_regressions.py",
    ):
        script = os.path.join(ROOT, "tests", script_name)
        if os.path.exists(script):
            p = subprocess.run([sys.executable, script, URI, PSQL],
                               capture_output=True, text=True)
            st = "OK" if p.returncode == 0 else "FAIL"
            print(("TEST " + script_name).ljust(60), st)
            for line in (p.stdout + p.stderr).splitlines():
                if line.startswith(("PASS", "FAIL", "RESULT")):
                    print("   ", line)
            if p.returncode != 0:
                fails += 1
                break

if fails == 0:
    # cleanup/rollback: applied TWICE (idempotence), then postconditions
    for i in (1, 2):
        st, detail = run(os.path.join(ROOT, "migrations", "99_cleanup_rollback.sql"))
        print(("MIGRATION 99_cleanup_rollback.sql (pass %d)" % i).ljust(60), st)
        if st != "OK":
            print("   ", detail); fails += 1
            break
if fails == 0:
    st, detail = run(os.path.join(ROOT, "tests", "99_cleanup_postconditions.sql"))
    print("TEST 99_cleanup_postconditions.sql".ljust(60), st)
    if st != "OK":
        print("   ", detail); fails += 1

print()
print("RESULT:", "ALL PASS" if fails == 0 else f"{fails} FAILURES")
sys.exit(0 if fails == 0 else 1)
