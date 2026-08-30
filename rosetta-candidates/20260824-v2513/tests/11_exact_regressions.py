#!/usr/bin/env python3
"""Exact-source regression proofs for control runs 24592 and 24593.

Usage: python3 11_exact_regressions.py POSTGRES_URI PATH_TO_PSQL

The fixtures are immutable captures.  The test verifies both the complete JSON
file hash and embedded source-text hash before querying the convergence closure.
It never promotes, publishes, or cuts over.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import subprocess
import sys


URI = sys.argv[1]
PSQL = sys.argv[2]
FIXTURES = Path(__file__).with_name("fixtures")
PREFIX = "v2513_"

EXPECTED = {
    24592: {
        "file_sha256": "57288c33bf546a88f9e1f6a2364c7243ec924009152471d58256b78b5762250c",
        "source_sha256": "a6b611c842422141f73675bfc11c89fda690b0c83147a1f30537cd92c4518bd6",
    },
    24593: {
        "file_sha256": "f3a025a35ad472f29d65bce30d89c3e394b9116e780def0e570fb51daf9099a7",
        "source_sha256": "4a4594b0ee1d6b5c7b523e232d3daa48409b63d288d3c92c1160bbb5f39b1e01",
    },
}


def check(label: str, condition: bool, detail: str = "") -> None:
    if not condition:
        raise SystemExit(f"FAIL {label}: {detail}")
    print(f"PASS {label}")


def sql_lit(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def query(label: str, sql: str) -> str:
    proc = subprocess.run(
        [PSQL, "-X", "-v", "ON_ERROR_STOP=1", "-At", URI],
        input=sql.encode("utf-8"),
        capture_output=True,
        check=False,
    )
    if proc.returncode:
        raise SystemExit(
            f"FAIL {label}: {proc.stderr.decode('utf-8', 'replace')[:2000]}"
        )
    return proc.stdout.decode("utf-8", "strict").strip()


def load_fixture(run_id: int) -> tuple[str, dict]:
    path = FIXTURES / f"rosetta-run-{run_id}.json"
    raw = path.read_bytes()
    expected = EXPECTED[run_id]
    check(
        f"11.{run_id}.1 exact fixture file hash",
        hashlib.sha256(raw).hexdigest() == expected["file_sha256"],
    )
    payload = json.loads(raw)
    check(
        f"11.{run_id}.2 captured run identity",
        payload["law_view"]["extraction_run_id"] == run_id,
    )
    receipt = payload["source_receipt"]
    source = receipt["source_text"]
    source_sha = hashlib.sha256(source.encode("utf-8")).hexdigest()
    check(
        f"11.{run_id}.3 exact source-text hash",
        source_sha == expected["source_sha256"]
        and receipt["source_content_hash"] == expected["source_sha256"],
    )
    return source, receipt


source_24592, receipt_24592 = load_fixture(24592)
source_24593, receipt_24593 = load_fixture(24593)

# Projection is always offset/length preserving, including after exclusions.
projection_lengths = query(
    "projection length preservation",
    "select (char_length(rosetta_v2513."
    f"{PREFIX}rosetta_v25_layout_projection({sql_lit(source_24592)}))="
    f"char_length({sql_lit(source_24592)}) and char_length(rosetta_v2513."
    f"{PREFIX}rosetta_v25_layout_projection({sql_lit(source_24593)}))="
    f"char_length({sql_lit(source_24593)}))::text;",
)
check("11.1 projection length preservation", projection_lengths == "true", projection_lengths)

# Run 24592: the statutory name is intact and the non-operative Louisiana
# DIGEST cannot produce Proposed-law normative clauses.
protected_name = query(
    "24592 middle initial",
    "select (position('David R'||chr(57344)||' Poynter' in "
    f"rosetta_v2513.{PREFIX}rosetta_v25_protect_internal_periods("
    f"{sql_lit(source_24592)}))>0)::text;",
)
check("11.2 run 24592 middle initial protected", protected_name == "true", protected_name)

digest_clause_count = query(
    "24592 DIGEST exclusion",
    "select count(*) from rosetta_v2513."
    f"{PREFIX}rosetta_v25_normative_clauses({sql_lit(source_24592)}) c "
    "where c.actor ~* '^Proposed law\\M' or c.clause_text ~* '^Proposed law\\M';",
)
check("11.3 run 24592 non-operative DIGEST excluded", digest_clause_count == "0", digest_clause_count)

complete_report_count = query(
    "24592 complete report clause",
    "select count(*) from rosetta_v2513."
    f"{PREFIX}rosetta_v25_normative_clauses({sql_lit(source_24592)}) c "
    "where c.clause_text like '%David R. Poynter%' "
    "and c.clause_text like '%annual written report%' "
    "and c.actor='The consortium' and c.modal='shall';",
)
check("11.4 run 24592 report clause remains complete", complete_report_count == "1", complete_report_count)

list_marker = query(
    "middle-initial negative control",
    "select (not rosetta_v2513."
    f"{PREFIX}rosetta_v25_is_internal_period('A. The department shall act.',2))::text;",
)
check("11.5 list marker is not a protected name initial", list_marker == "true", list_marker)

# Run 24593: every standalone PAGE n-HOUSE/SENATE BILL line is masked.
page_count = query(
    "24593 page-line exclusion",
    "select regexp_count(rosetta_v2513."
    f"{PREFIX}rosetta_v25_layout_projection({sql_lit(source_24593)}),"
    "'(?i)(^|\\n)[ \\t]*PAGE[ \\t]+[0-9]+-(HOUSE|SENATE)[ \\t]+BILL[^\\n]*(\\n|$)',1,'n');",
)
check("11.6 run 24593 PAGE bill lines excluded", page_count == "0", page_count)

metadata = receipt_24593["source_metadata"]
observed_date = metadata["registered_metadata"]["provider_date"]
check("11.7 run 24593 exact observed epoch date", observed_date == "1969-12-31", observed_date)

# The candidate entry boundary and replay identity boundary independently reject
# the invalid observed date using one stable, dedicated SQLSTATE.
date_gate = query(
    "candidate reference-date gate",
    f"""
do $test$
begin
  perform rosetta_v2513.{PREFIX}rosetta_v25_reference_date_gate(date '1969-12-31');
  raise exception 'TEST_FAIL candidate accepted pre-epoch reference date';
exception when sqlstate 'P1A08' then null;
end;
$test$;
select 'date_gate_rejected';
""",
)
check("11.8 candidate rejects pre-epoch reference date", date_gate.endswith("date_gate_rejected"), date_gate)

replay_gate = query(
    "replay reference-date gate",
    """
insert into rosetta_v2513.corpus(corpus_name) values('test-corpus-11');
insert into rosetta_v2513.source_document(corpus_id,document_name,document_identifier)
select id,'epoch-date-fixture','TEST-1969-1231'
from rosetta_v2513.corpus where corpus_name='test-corpus-11';
insert into rosetta_v2513.source_document_content
  (source_document_id,source_version,source_url,media_type,source_text,
   source_content_hash,source_identity_hash,source_metadata)
select id,'v1','test://exact-regression-epoch','text/plain',
  'Sec. 1. The department shall report.',
  encode(extensions.digest(convert_to('Sec. 1. The department shall report.','UTF8'),'sha256'),'hex'),
  encode(extensions.digest(convert_to('identity:exact-regression-epoch','UTF8'),'sha256'),'hex'),
  '{"reference_date":"1969-12-31","text_extractor_version":"fixture-1"}'::jsonb
from rosetta_v2513.source_document where document_name='epoch-date-fixture';
do $test$
declare v_source uuid;
begin
  select rosetta_replay.register_source(
    c.source_content_id,c.source_content_hash,
    octet_length(convert_to(c.source_text,'UTF8')),
    '{"source_charset":"UTF-8","decoding_method":"strict_utf8","invalid_byte_handling":"reject","replacement_char_count":0,"replacement_chars_block_span_certainty":false}'::jsonb)
  into v_source
  from rosetta_v2513.source_document_content c
  where c.source_url='test://exact-regression-epoch';
  begin
    perform rosetta_replay.expected_configuration_hash(v_source);
    raise exception 'TEST_FAIL replay accepted pre-epoch reference date';
  exception when sqlstate 'P1A08' then null;
  end;
end;
$test$;
select 'replay_gate_rejected';
""",
)
check("11.9 replay rejects pre-epoch reference date", replay_gate.endswith("replay_gate_rejected"), replay_gate)

print("RESULT: 11 ALL PASS")
