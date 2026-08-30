#!/usr/bin/env python3
"""Prove durable replay with genuinely separate committed transactions.

Usage: python3 08_separated_transactions.py POSTGRES_URI PATH_TO_PSQL

The test never promotes or cuts over.  Each tx() call starts a new psql
process/connection, so claim, execute, finalize, and verification cannot share
one rollback boundary.
"""
from __future__ import annotations

import re
import subprocess
import sys


URI = sys.argv[1]
PSQL = sys.argv[2]
PREFIX = "v2513_"
ENGINE = "rosetta-v3-deterministic-sql-2.5.13"
RULES = "rosetta-five-layer-structural-correctness-2.5.13"
URL = "test://separated-08"
TEXT = (
    "Sec. 1. There shall be a housing assistance license. The department shall "
    "establish a housing assistance program for eligible residents. The department "
    "shall publish an application form and shall approve or deny each complete "
    "request within thirty days. Sec. 2. If the department denies an application, "
    "the applicant may appeal to the director. The director shall review the record. "
    "Sec. 3. Notwithstanding any other provision of this chapter, the director may "
    "waive the filing deadline for good cause shown. Sec. 4. \"Eligible resident\" "
    "means a person who resides in the city and meets the income standard."
)
RECEIPT = (
    '{"source_charset":"UTF-8","decoding_method":"strict_utf8",'
    '"invalid_byte_handling":"reject","replacement_char_count":0,'
    '"replacement_chars_block_span_certainty":false}'
)
UUID_RE = re.compile(r"^[0-9a-f-]{36}$", re.I)


def lit(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def tx(label: str, sql: str) -> str:
    proc = subprocess.run(
        [PSQL, "-X", "-v", "ON_ERROR_STOP=1", "-At", URI, "-c", sql],
        capture_output=True,
        check=False,
    )
    if proc.returncode:
        raise SystemExit(f"FAIL {label}: {proc.stderr.decode('utf-8','replace')[:1000]}")
    return proc.stdout.decode("utf-8", "strict").strip()


def check(label: str, condition: bool, detail: str = "") -> None:
    if not condition:
        raise SystemExit(f"FAIL {label}: {detail}")
    print(f"PASS {label}")


# TX1: exact candidate source, immutable charset receipt, immutable expectation.
source = tx(
    "TX1 source registration",
    f"""
insert into rosetta_v2513.corpus(corpus_name) values('test-corpus-08');
insert into rosetta_v2513.source_document(corpus_id,document_name,document_identifier)
select id,'separated-fixture','TEST-2026-0008' from rosetta_v2513.corpus
where corpus_name='test-corpus-08';
insert into rosetta_v2513.source_document_content
  (source_document_id,source_version,source_url,media_type,source_text,
   source_content_hash,source_identity_hash,source_metadata)
select id,'v1',{lit(URL)},'text/plain',{lit(TEXT)},
  encode(extensions.digest(convert_to({lit(TEXT)},'UTF8'),'sha256'),'hex'),
  encode(extensions.digest(convert_to('identity:'||{lit(TEXT)},'UTF8'),'sha256'),'hex'),
  '{{"reference_date":"2026-08-24","text_extractor_version":"fixture-1"}}'::jsonb
from rosetta_v2513.source_document where document_name='separated-fixture';
with registered as (
  select rosetta_replay.register_source(c.source_content_id,c.source_content_hash,
    octet_length(convert_to(c.source_text,'UTF8')),{lit(RECEIPT)}::jsonb) source_registry_id
  from rosetta_v2513.source_document_content c where c.source_url={lit(URL)}
)
select source_registry_id from registered;
""",
).splitlines()[-1]
check("08.1 source registered", UUID_RE.fullmatch(source) is not None, source)
tx(
    "TX1b expectation",
    "select rosetta_replay.declare_source_expectation("
    f"{lit(source)}::uuid,'completed',null,'none',null,false,"
    "'fresh fixture is expected to complete under the candidate');",
)

closure = tx("identity closure", f"select rosetta_replay.closure_sha256('{PREFIX}');").splitlines()[-1]
config = tx(
    "identity config",
    f"select rosetta_replay.expected_configuration_hash({lit(source)}::uuid);",
).splitlines()[-1]

# TX2: claim commits independently.
attempt = tx(
    "TX2 claim",
    "select rosetta_replay.replay_claim("
    f"{lit(source)}::uuid,'{PREFIX}',{lit(ENGINE)},{lit(RULES)},"
    f"{lit(config)},{lit(closure)},'worker-sep');",
).splitlines()[-1]
check("08.2 claim returned attempt", UUID_RE.fullmatch(attempt) is not None, attempt)

# TX3: another session observes the committed claim/start receipts.
visible = tx(
    "TX3 claim visibility",
    "select a.attempt_state||'|'||string_agg(r.receipt_kind,',' order by r.receipt_seq) "
    "from rosetta_replay.replay_attempt a join rosetta_replay.replay_receipt r using(attempt_id) "
    f"where a.attempt_id={lit(attempt)}::uuid group by a.attempt_state;",
)
check("08.3 claim committed before parse", visible.startswith("running|") and "claim" in visible and "start" in visible, visible)

# TX4: execute under an already-armed timeout, then TX5 observes staged output.
tx(
    "TX4 execute",
    "set statement_timeout='120s';"
    f"select rosetta_replay.replay_execute({lit(attempt)}::uuid,'{PREFIX}',120000);",
)
staged = tx(
    "TX5 staged visibility",
    f"select attempt_state||'|'||coalesce(pending_outcome,'NULL') from rosetta_replay.replay_attempt where attempt_id={lit(attempt)}::uuid;",
)
check("08.4 successful output staged before finalize", staged == "running|success", staged)

# TX6 finalizes only after rechecking source -> run -> output, then TX7 proves it.
tx("TX6 finalize", f"select rosetta_replay.replay_finalize({lit(attempt)}::uuid,'worker-sep');")
final = tx(
    "TX7 exact binding",
    "select a.attempt_state||'|'||b.terminal_outcome||'|'||"
    "(b.source_content_id=r.source_content_id)::text||'|'||"
    "(b.source_content_hash=r.source_content_hash)::text||'|'||"
    "(b.extraction_run_id is not null and b.output_content_hash is not null)::text "
    "from rosetta_replay.replay_attempt a "
    "join rosetta_replay.replay_run_binding b "
    "on b.attempt_id=a.attempt_id and b.source_registry_id=a.source_registry_id "
    "join rosetta_replay.replay_source_registry r "
    "on r.source_registry_id=a.source_registry_id "
    f"where a.attempt_id={lit(attempt)}::uuid;",
)
check("08.5 finalize sealed exact run/output binding", final == "succeeded|completed|true|true|true", final)

# TX8-TX12: a real timeout remains visible and cannot manufacture a run binding.
big_url = "test://separated-08-timeout"
big_text_sql = f"repeat({lit(TEXT)},20000)"
big_source = tx(
    "TX8 timeout source",
    f"""
insert into rosetta_v2513.source_document(corpus_id,document_name,document_identifier)
select id,'separated-timeout','TEST-2026-0008T' from rosetta_v2513.corpus
where corpus_name='test-corpus-08';
insert into rosetta_v2513.source_document_content
  (source_document_id,source_version,source_url,media_type,source_text,
   source_content_hash,source_identity_hash,source_metadata)
select id,'v1',{lit(big_url)},'text/plain',{big_text_sql},
  encode(extensions.digest(convert_to({big_text_sql},'UTF8'),'sha256'),'hex'),
  encode(extensions.digest(convert_to('identity:'||{big_text_sql},'UTF8'),'sha256'),'hex'),
  '{{"text_extractor_version":"fixture-1"}}'::jsonb
from rosetta_v2513.source_document where document_name='separated-timeout';
with registered as (
 select rosetta_replay.register_source(c.source_content_id,c.source_content_hash,
   octet_length(convert_to(c.source_text,'UTF8')),{lit(RECEIPT)}::jsonb) source_registry_id
 from rosetta_v2513.source_document_content c where c.source_url={lit(big_url)})
select source_registry_id from registered;
""",
).splitlines()[-1]
check("08.6 timeout source registered", UUID_RE.fullmatch(big_source) is not None, big_source)
tx(
    "TX8b timeout expectation",
    "select rosetta_replay.declare_source_expectation("
    f"{lit(big_source)}::uuid,'completed',null,'none',null,false,"
    "'large fixture remains a normal expected completion');",
)
big_config = tx("timeout config", f"select rosetta_replay.expected_configuration_hash({lit(big_source)}::uuid);").splitlines()[-1]
big_attempt = tx(
    "TX9 timeout claim",
    "select rosetta_replay.replay_claim("
    f"{lit(big_source)}::uuid,'{PREFIX}',{lit(ENGINE)},{lit(RULES)},"
    f"{lit(big_config)},{lit(closure)},'worker-timeout');",
).splitlines()[-1]
tx(
    "TX10 forced timeout",
    "set statement_timeout='50ms';"
    f"select rosetta_replay.replay_execute({lit(big_attempt)}::uuid,'{PREFIX}',50);",
)
timeout_staged = tx(
    "TX11 timeout staged",
    f"select pending_outcome||'|'||pending_sqlstate from rosetta_replay.replay_attempt where attempt_id={lit(big_attempt)}::uuid;",
)
check("08.7 timeout staged durably", timeout_staged == "timeout|57014", timeout_staged)
tx("TX12 timeout finalize", f"select rosetta_replay.replay_finalize({lit(big_attempt)}::uuid,'worker-timeout');")
timeout_final = tx(
    "TX12 timeout verify",
    "select a.attempt_state||'|'||r.receipt_kind||'|'||r.sqlstate||'|'||"
    "(not exists(select 1 from rosetta_replay.replay_run_binding b where b.attempt_id=a.attempt_id))::text "
    "from rosetta_replay.replay_attempt a join rosetta_replay.replay_receipt r using(attempt_id) "
    f"where a.attempt_id={lit(big_attempt)}::uuid order by r.receipt_seq desc limit 1;",
)
check("08.8 timeout receipted without fake binding", timeout_final == "timed_out|timeout|57014|true", timeout_final)

print("RESULT: 08 ALL PASS")
