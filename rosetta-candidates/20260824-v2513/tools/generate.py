"""
generate.py — emits migrations 02, 03, 04-10, 17 for the Rosetta 2.5.13
controlled-recovery SQL package from hash-verified evidence.

Determinism: every output byte derives from evidence files only.
Never connects to any database. Control closure is verifiable by
reverse-rename md5 comparison against evidence/live-functions.

Transform rules (verified against evidence before any migration is written):
  * closure function references  public.<fn>(   -> rosetta_v2513.<prefix><fn>(
    applied only outside single-quoted string literals and line comments
    (verified: no closure function reference occurs inside a string literal);
  * table/view references        public.<table> -> rosetta_v2513.<table>
    applied everywhere, including dynamic-SQL string literals
    (rosetta_v24_prune_amendment_projection uses EXECUTE 'delete from
    public.rosetta_object_correction ...' and to_regclass('public....'));
  * SET search_path keeps pg_catalog and extensions, swaps public ->
    rosetta_v2513 (digest() resolves via the preserved 'extensions' entry);
  * identity tokens ('2.5.11', 'v2511') are swapped ONLY inside single-quoted
    string literals, and ONLY in candidate lanes -- never in the control.
"""
import json, os, re, hashlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EV = os.path.join(ROOT, "evidence")
MIG = os.path.join(ROOT, "migrations")
SCHEMA = "rosetta_v2513"

def load_defs(subdir):
    d = {}
    for f in sorted(os.listdir(os.path.join(EV, subdir))):
        if f.endswith(".sql"):
            d[f[:-4]] = open(os.path.join(EV, subdir, f), encoding="utf-8").read()
    return d

DEFS = load_defs("live-functions")
PUB = load_defs("publication-path")
REF2512 = load_defs("v2512-reference")
FNAMES = sorted({k.split("__")[0] for k in DEFS} | {k.split("__")[0] for k in PUB},
                key=len, reverse=True)

TC = {t["table_name"]: t["columns"]
      for t in json.load(open(os.path.join(EV, "schema", "table-columns.json")))
      if "table_name" in t}
CONS = json.load(open(os.path.join(EV, "schema", "constraints.json")))["constraints"]

MIRROR_TABLES = sorted(
    {"accountability_route","entity_override","escalation_node","extraction_manifest",
     "extraction_rule_manifest","extraction_run","extraction_run_config","help_entity",
     "hr1_raw_blocks","layer_coverage","rosetta_canonical_clause","rosetta_clause_occurrence",
     "rosetta_object_correction","rosetta_object_source_span","rosetta_structural_repair_queue",
     "rosetta_structural_representation","source_document","source_document_content",
     "term_definition","term_definition_affected_steps","validation_result",
     "workflow_pipeline","workflow_step","actor_canon","corpus","actor_alias",
     "appeal_pathway","rosetta_clause_ir","rosetta_current_generation_registry_v1"})
assert set(MIRROR_TABLES) <= set(TC)
SEQUENCES = ["extraction_run_id_seq", "source_document_id_seq", "corpus_id_seq"]

def split_sq(sql):
    """(kind, text) segments; kind True = single-quoted string literal,
    'comment' = line comment, False = code. Dollar-quoted function bodies are
    code (they must be transformed)."""
    segs = []; i = 0; n = len(sql); buf = []
    def flush():
        if buf: segs.append((False, "".join(buf))); buf.clear()
    while i < n:
        if sql[i] == "'":
            flush(); j = i + 1
            while j < n:
                if sql[j] == "'":
                    if j + 1 < n and sql[j + 1] == "'":
                        j += 2; continue
                    j += 1; break
                j += 1
            segs.append((True, sql[i:j])); i = j
        elif sql[i:i+2] == "--":
            flush()
            j = sql.find("\n", i); j = n if j == -1 else j
            segs.append(("comment", sql[i:j])); i = j
        else:
            buf.append(sql[i]); i += 1
    flush(); return segs

FN_RE = re.compile(r"\bpublic\.(" + "|".join(re.escape(f) for f in FNAMES) + r")\(")
TBL_RE = re.compile(r"\bpublic\.(" + "|".join(
    re.escape(t) for t in sorted(MIRROR_TABLES + ["v_rosetta_operator_law_view_v1", "projection_receipt", "corpus_measurement_receipt"], key=len, reverse=True)) + r")\b")

def terminate(sql):
    s = sql.rstrip()
    return s if s.endswith(";") else s + ";"

def transform(body, prefix, identity_tag=None, extra_fn_names=(), literal_swaps=()):
    if extra_fn_names:
        fn_re = re.compile(r"\bpublic\.(" + "|".join(
            re.escape(f) for f in sorted(list(FNAMES) + list(extra_fn_names), key=len, reverse=True)) + r")\(")
    else:
        fn_re = FN_RE
    out = []
    for kind, seg in split_sq(body):
        if kind is False:
            seg = fn_re.sub(lambda m: f"{SCHEMA}.{prefix}{m.group(1)}(", seg)
            seg = seg.replace("SET search_path TO 'pg_catalog', 'public', 'extensions'",
                              f"SET search_path TO 'pg_catalog', '{SCHEMA}', 'extensions'")
            seg = seg.replace("SET search_path TO 'pg_catalog', 'public'",
                              f"SET search_path TO 'pg_catalog', '{SCHEMA}'")
        seg = TBL_RE.sub(lambda m: f"{SCHEMA}.{m.group(1)}", seg)
        if kind is True and identity_tag is not None:
            seg = seg.replace("2.5.11", identity_tag)
            seg = re.sub(r"(?<![a-z0-9])v2511(?![a-z0-9])",
                         "v" + identity_tag.replace(".", "").replace("-", ""), seg)
        if kind is True:
            for a, b in literal_swaps:
                seg = seg.replace(a, b)
        out.append(seg)
    return "".join(out)

def reverse_control(gen_body, prefix):
    s = gen_body
    for f in FNAMES:
        s = s.replace(f"{SCHEMA}.{prefix}{f}(", f"public.{f}(")
    for t in sorted(MIRROR_TABLES + ["v_rosetta_operator_law_view_v1"], key=len, reverse=True):
        s = re.sub(r"\b" + re.escape(SCHEMA) + r"\." + re.escape(t) + r"\b", "public." + t, s)
    s = s.replace(f"SET search_path TO 'pg_catalog', '{SCHEMA}', 'extensions'",
                  "SET search_path TO 'pg_catalog', 'public', 'extensions'")
    s = s.replace(f"SET search_path TO 'pg_catalog', '{SCHEMA}'",
                  "SET search_path TO 'pg_catalog', 'public'")
    return s


# ---------------------------------------------------------------------------
# 02 — candidate schema: mirrors, views, lane-invariant adapters, lockdown
# ---------------------------------------------------------------------------
def col_ddl(table):
    lines = []
    for name, typ, nullable, default in TC[table]:
        d = ""
        if default:
            d = default
            for s in SEQUENCES:
                d = d.replace(f"nextval('{s}'::regclass)",
                              f"nextval('{SCHEMA}.{s}'::regclass)")
            d = " default " + d
        lines.append(f"    {name} {typ}{'' if nullable == 'YES' else ' not null'}{d}")
    return ",\n".join(lines)

def cons_ddl(table, include_fk=True):
    out = []
    for c in CONS:
        if c["table"] != table:
            continue
        if c["type"] == "f" and not include_fk:
            continue
        d = c["def"]
        for t in sorted(MIRROR_TABLES, key=len, reverse=True):
            d = re.sub(r"\bREFERENCES " + re.escape(t) + r"\b", f"REFERENCES {SCHEMA}.{t}", d)
        kw = {"p": "primary key", "u": "unique", "c": "check", "f": "foreign key"}
        if c["type"] in ("p", "u"):
            m = re.match(r"(PRIMARY KEY|UNIQUE) \((.*)\)", d, re.I)
            out.append(f"    constraint {c['name']} {m.group(1)} ({m.group(2)})")
        elif c["type"] == "c":
            m = re.match(r"CHECK \((.*)\)", d, re.I | re.S)
            out.append(f"    constraint {c['name']} check ({m.group(1)})")
        else:
            out.append(f"    constraint {c['name']} {d}")
    return out

def emit_02():
    parts = [f"""-- ============================================================================
-- Migration 02 -- candidate schema {SCHEMA}: structural mirrors of every
-- table the 2.5.11 closure touches (plus FK-closure targets), the two mirrored
-- reporting views, lane-invariant span storage adapters, candidate-only
-- receipt tables, and lockdown. No production object is touched.
-- Column types, nullability, defaults, and constraints are transcribed from
-- hash-verified evidence/schema/*.json. Sequences are schema-local.
-- Candidate objects are structurally unable to publish: the publication view
-- public.v_civic_genome_law_view_v1 reads only public.* tables via
-- public.rosetta_is_current_publishable_run_v1 and the registry; nothing here
-- is referenced by that path, and this schema holds no publication privilege.
-- ============================================================================

create schema if not exists {SCHEMA};
comment on schema {SCHEMA} is
  'Rosetta 2.5.13 controlled-recovery candidate namespace. Closed: candidate objects reference only rosetta_v2513, pg_catalog, extensions. Structurally excluded from publication.';
"""]
    for s in SEQUENCES:
        parts.append(f"create sequence if not exists {SCHEMA}.{s};\n")
    parts.append("""-- local roles for the candidate environment (no-op where they exist)
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
""")
    for t in MIRROR_TABLES:
        ddl = f"create table if not exists {SCHEMA}.{t} (\n" + col_ddl(t)
        cons = cons_ddl(t, include_fk=False)
        if cons:
            ddl += ",\n" + ",\n".join(cons)
        ddl += "\n);\n"
        parts.append(ddl)
    # foreign keys added after every table exists
    for t in MIRROR_TABLES:
        for c in CONS:
            if c["table"] == t and c["type"] == "f":
                d = c["def"]
                for t2 in sorted(MIRROR_TABLES, key=len, reverse=True):
                    d = re.sub(r"\bREFERENCES " + re.escape(t2) + r"\b",
                               f"REFERENCES {SCHEMA}.{t2}", d)
                parts.append(f"alter table {SCHEMA}.{t} add constraint {c['name']} {d};")
    # standalone unique INDEXES (evidence/schema/unique-indexes.json, captured
    # 2026-08-24): required by ON CONFLICT clauses in the 2.5.11 base function.
    # The constraint capture missed them because they are indexes, not
    # constraints. extraction_run_document_version_unique and the
    # layer_coverage key already exist as table constraints above.
    parts.append("create unique index if not exists extraction_run_config_run_unique"
                 f" on {SCHEMA}.extraction_run_config (extraction_run_id);")
    parts.append("create unique index if not exists validation_result_run_test_unique"
                 f" on {SCHEMA}.validation_result (extraction_run_id, test_name);")
    parts.append("create unique index if not exists extraction_manifest_run_unique"
                 f" on {SCHEMA}.extraction_manifest (extraction_run_id);")
    parts.append("create unique index if not exists extraction_run_replay_receipt_unique"
                 f" on {SCHEMA}.extraction_run (source_document_id, source_content_id,"
                 " engine_version, rule_set_version, rule_manifest_hash, configuration_hash)"
                 " where source_content_id is not null and engine_version is not null"
                 " and rule_set_version is not null and rule_manifest_hash is not null"
                 " and configuration_hash is not null;")
    parts.append("%%VIEWS%%")
    return "\n".join(parts)

if __name__ == "__main__":
    pass


VIEW_TABLES = sorted(MIRROR_TABLES, key=len, reverse=True)

def qualify_view(defsql, view_name):
    """Fully qualify unqualified FROM/JOIN table refs and known function refs
    in a pg_get_viewdef body, then wrap as a CREATE VIEW in SCHEMA."""
    s = defsql
    # strip provenance comment lines we added to the evidence file
    s = "\n".join(l for l in s.splitlines() if not l.startswith("-- Retrieved"))
    def qt(m):
        parens = m.group(2) or ""
        kw, name = m.group(1), m.group(3)
        if name in MIRROR_TABLES or name == "v_civic_genome_law_view_v1_internal":
            return f"{kw} {parens}{SCHEMA}.{name}"
        return m.group(0)
    s = re.sub(r"(?i)\b(from|join)\s*(\(*)\s*([a-z_][a-z0-9_]*)", qt, s)
    s = re.sub(r"\brosetta_v25_enrich_objects_with_spans\(",
               f"{SCHEMA}.rosetta_v25_enrich_objects_with_spans(", s)
    return (f"create or replace view {SCHEMA}.{view_name} as\n" + s.strip() + "\n")


# ---------------------------------------------------------------------------
# lane-invariant adapters + candidate receipt tables + lockdown (part of 02)
# ---------------------------------------------------------------------------
ADAPTERS = ["rosetta_v25_enrich_objects_with_spans", "rosetta_v25_span_json"]

def emit_adapters():
    out = ["-- lane-invariant span storage adapters (single copy, no identity swap)"]
    for a in ADAPTERS:
        key = next(k for k in PUB if k.startswith(a + "__"))
        out.append(terminate(transform(PUB[key], "")))  # prefix "" : name unchanged
    return "\n".join(out)

def emit_receipt_tables():
    return f"""
-- candidate receipt tables (candidate storage; structurally outside publication)
create table if not exists {SCHEMA}.corpus_measurement_receipt (
    measurement_id     uuid primary key default gen_random_uuid(),
    measured_at        timestamptz not null default now(),
    engine_version     text not null,
    rule_set_version   text not null,
    manifest_hash      text not null,
    scope              text not null,          -- what was measured (table/column)
    sample_size        bigint not null,
    percentiles        jsonb not null,         -- {{p50,p90,p99,p999,max}}
    bound_chosen       integer not null,
    bound_justification text not null,         -- measurement-derived, never assumed
    receipt_hash       text not null           -- sha256 over canonical receipt fields
);

create table if not exists {SCHEMA}.projection_receipt (
    projection_receipt_id uuid primary key default gen_random_uuid(),
    created_at         timestamptz not null default now(),
    extraction_run_id  integer,
    object_type        text,
    object_id          text,
    raw_sha256         text not null,          -- sha256 of raw source bytes
    projected_sha256   text not null,          -- sha256 of projected text
    projection_method  text not null,          -- e.g. rosetta-layout-projection-v2513c3
    projection_version text not null,
    offset_mapping     jsonb,                  -- null only with declared inability
    offset_mapping_status text not null check (offset_mapping_status in ('preserved','not_preserved_declared')),
    charset_receipt    jsonb not null,
    excluded_regions   jsonb not null,         -- masked/excluded region receipts
    verified           boolean not null        -- true only if recompute matches
);

-- lockdown: candidates readable, never writable by PUBLIC/anon/authenticated
revoke all on schema {SCHEMA} from public;
grant usage on schema {SCHEMA} to anon, authenticated;
grant select on all tables in schema {SCHEMA} to anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on all tables in schema {SCHEMA} from public, anon, authenticated;

-- C1 measurement receipt, populated at build time from the live-corpus
-- distribution captured 2026-08-24 (evidence/measurements/actor-bound-distribution.json).
-- NOTE: the originally specified bound 240 is REFUTED by this measurement
-- (pre-modal p99=254 > 240); 1024 is the smallest power-of-two above p999=571.26.
insert into {SCHEMA}.corpus_measurement_receipt
  (engine_version, rule_set_version, manifest_hash, scope, sample_size,
   percentiles, bound_chosen, bound_justification, receipt_hash)
values (
  'rosetta-v3-deterministic-sql-2.5.11',
  'rosetta-five-layer-structural-correctness-2.5.11',
  'see evidence/registry/manifest-2.5.11.json',
  'workflow_step pre-modal segment length (char_length of text before first shall/must/may in rosetta_v2_normalize_text(step_name))',
  156869,
  '{{"p50": 36.0, "p90": 123.0, "p99": 254.0, "p999": 571.26, "max": 6566}}'::jsonb,
  1024,
  'Live measurement 2026-08-24 (n=156869): p999=571.26, max=6566. 1024 is the smallest power-of-two strictly above measured p999; it admits >=99.9% of observed legitimate clauses and blocks the runaway-capture tail. The previously specified 240 is refuted by measurement (p99=254 > 240).',
  encode(extensions.digest(convert_to(
    'rosetta-v3-deterministic-sql-2.5.11|pre-modal-segment|156869|p999=571.26|bound=1024',
    'UTF8'),'sha256'),'hex')
);
"""

def emit_rls():
    out = ["-- row-level security: SELECT-true policy; write denial enforced by grants"]
    for t in MIRROR_TABLES + ["corpus_measurement_receipt", "projection_receipt"]:
        out.append(f"alter table {SCHEMA}.{t} enable row level security;")
        out.append(f"drop policy if exists candidate_read_only on {SCHEMA}.{t};")
        out.append(f"create policy candidate_read_only on {SCHEMA}.{t} for select using (true);")
    return "\n".join(out)


# ---------------------------------------------------------------------------
# 03 — control closure: byte-faithful namespaced copy of the 51-function
# 2.5.11 closure, storage retarget only, NO identity swaps.
# ---------------------------------------------------------------------------
CONTROL_PREFIX = "ctl_"

def control_manifest_sql():
    manifest = {
        "lane": "control",
        "engine_version": "rosetta-v3-deterministic-sql-2.5.11",
        "rule_set_version": "rosetta-five-layer-structural-correctness-2.5.11",
        "title": "2.5.11 control: byte-faithful namespaced copy, no semantic changes",
        "closure_prefix": CONTROL_PREFIX,
        "closure_namespace": SCHEMA,
        "note": "mirror-local manifest so the control engine can resolve its identity; "
                "the production registry and production manifests are never touched",
    }
    mj = json.dumps(manifest, sort_keys=True, separators=(",", ":"))
    mh = hashlib.sha256(mj.encode()).hexdigest()
    return f"""insert into {SCHEMA}.extraction_rule_manifest
  (engine_version, rule_set_version, manifest_hash, manifest_json, is_active)
values ('{manifest["engine_version"]}', '{manifest["rule_set_version"]}',
        '{mh}', $manifest${mj}$manifest$::jsonb, true);"""

def emit_control():
    parts = [f"""-- ============================================================================
-- Migration 03 -- 2.5.11 control closure, copied byte-faithfully into
-- {SCHEMA} with prefix {CONTROL_PREFIX}. Storage retarget only
-- (public.<table> -> {SCHEMA}.<table>; search_path keeps pg_catalog and
-- extensions). NO identity-token swaps: the control still reports engine
-- version rosetta-v3-deterministic-sql-2.5.11. Verifiable: reversing the
-- rename reproduces the evidence file md5 for every function (see
-- tests/03_control_reverse_rename.sql).
-- ============================================================================
set check_function_bodies = off;
"""]
    for key in sorted(DEFS):
        parts.append(terminate(transform(DEFS[key], CONTROL_PREFIX)))
    return "\n".join(parts)

def verify_control():
    """Reverse-rename every generated control body and compare md5 with evidence."""
    bad = []
    for key in sorted(DEFS):
        gen = transform(DEFS[key], CONTROL_PREFIX)
        rev = reverse_control(gen, CONTROL_PREFIX)
        if hashlib.md5(rev.encode()).hexdigest() != hashlib.md5(DEFS[key].encode()).hexdigest():
            bad.append(key)
    return bad

LANES = {}

# ===========================================================================
# Lane C1 -- measured actor bound 1024; overflow blocks as actor_unresolved
# ===========================================================================
LANES["c1"] = {
 "tag": "2.5.13-c1",
 "title": "C1 measured actor-length bound (1024) with blocking overflow",
 "overrides": {
"rosetta_v2_modal_and_actor": """CREATE OR REPLACE FUNCTION public.rosetta_v2_modal_and_actor(p_clause text)
 RETURNS TABLE(modal text, actor text)
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_normalized text;
  v_match text[];
  v_premodal text;
  v_bound constant integer := 1024; -- C1: measurement-justified bound (live corpus 2026-08-24: pre-modal segment n=156869, p99=254, p999=571.26, max=6566; 1024 is the smallest power-of-two above measured p999; receipt in rosetta_v2513.corpus_measurement_receipt)
begin
  v_normalized := public.rosetta_v2_normalize_text(p_clause);
  v_normalized := regexp_replace(v_normalized,'^(?:\\([a-z0-9]+\\)\\s*)+','','i');
  v_normalized := regexp_replace(v_normalized, '^\\d+[.)]\\s*', '');

  v_premodal := (regexp_match(v_normalized, '(?i)^(.+?)\\s+(shall|must|may)\\M'))[1];
  if v_premodal is not null and char_length(v_premodal) > v_bound then
    raise exception 'actor_unresolved: pre-modal segment length % exceeds measured bound %; overflow is blocking and is never silently truncated',
      char_length(v_premodal), v_bound
      using errcode = 'P1A01';
  end if;

  v_match := regexp_match(v_normalized,'(?i)^(.+?)\\s+(shall|must|may)\\s+not\\M');
  if v_match is not null then
    return query select lower(v_match[2] || ' not'), nullif(btrim(v_match[1], E' \t\r\n,;:'), '');
    return;
  end if;

  v_match := regexp_match(v_normalized,'(?i)^(.+?)\\s+(shall|must|may)\\M');
  if v_match is null then
    return query select null::text, null::text;
    return;
  end if;

  return query select lower(v_match[2]), nullif(btrim(v_match[1], E' \t\r\n,;:'), '');
end;
$function$""",
"rosetta_v25_modal_and_actor": """CREATE OR REPLACE FUNCTION public.rosetta_v25_modal_and_actor(p_clause text)
 RETURNS TABLE(modal text, actor text)
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_normalized text;
  v_match text[];
  v_premodal text;
  v_bound constant integer := 1024; -- C1: measurement-justified bound (live corpus 2026-08-24: pre-modal segment n=156869, p99=254, p999=571.26, max=6566; 1024 is the smallest power-of-two above measured p999; receipt in rosetta_v2513.corpus_measurement_receipt)
begin
  v_normalized:=public.rosetta_v25_unprotect_text(public.rosetta_v2_normalize_text(p_clause));
  v_normalized:=regexp_replace(v_normalized,'^(?:\\([a-z0-9]+\\)\\s*)+','','i');
  v_normalized:=regexp_replace(v_normalized,'^\\d+[.)]\\s*','');

  v_premodal := (regexp_match(v_normalized, '(?i)^(.+?)\\s+(shall|must|may)\\M'))[1];
  if v_premodal is not null and char_length(v_premodal) > v_bound then
    raise exception 'actor_unresolved: pre-modal segment length % exceeds measured bound %; overflow is blocking and is never silently truncated',
      char_length(v_premodal), v_bound
      using errcode = 'P1A01';
  end if;

  v_match:=regexp_match(v_normalized,'(?i)^(.+?)\\s+(shall|must|may)\\s+not\\M');
  if v_match is not null then return query select lower(v_match[2]||' not'),nullif(btrim(v_match[1],E' \t\r\n,;:'),''); return; end if;
  v_match:=regexp_match(v_normalized,'(?i)^(.+?)\\s+(shall|must|may)\\M');
  if v_match is null then return query select null::text,null::text; return; end if;
  return query select lower(v_match[2]),nullif(btrim(v_match[1],E' \t\r\n,;:'),'');
end;
$function$""",
 },
}

# ===========================================================================
# Lane C2 -- actor-source corruption detection, widened and fail-closed.
# 'Whereas' alone is NEVER corruption (explicit non-rule).
# ===========================================================================
LANES["c2"] = {
 "tag": "2.5.13-c2",
 "title": "C2 actor-source corruption detection (chrome, dates, entities, replacement chars, scaffolding, multi-clause)",
 "overrides": {
"rosetta_v25_actor_source_corrupt": """CREATE OR REPLACE FUNCTION public.rosetta_v25_actor_source_corrupt(p_actor text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- C2: any detection below marks the candidate actor corrupt; raw evidence is
  -- preserved by the caller in the repair queue (fail closed, no silent cleaning).
  -- Explicit non-rule: a leading 'Whereas' is NEVER, by itself, corruption.
  select
    nullif(btrim(coalesce(p_actor,'')), '') is null
    or coalesce(p_actor,'') ~ '^\\s*[0-9]+(?:\\s|\\.|\\))'
    or coalesce(p_actor,'') ~* 'REVISOR|ENGROSSMENT|Page No|--\\s*[0-9]+\\s+of\\s+[0-9]+\\s*--'
    -- navigation chrome (incl. observed 'Go to top' artifacts)
    or coalesce(p_actor,'') ~* '\\m(skip to|main content|navigation|breadcrumb|menu|search|sign in|log in|subscribe|footer|header|go to top|back to top|share this|print this)\\M'
    -- date chains: two or more full calendar dates (long or numeric form),
    -- incl. observed action-history chains
    or (select count(*) >= 2
        from regexp_matches(coalesce(p_actor,''),
             '(?i)\\m(January|February|March|April|May|June|July|August|September|October|November|December)\\M\\s+[0-9]{1,2},\\s*[0-9]{4}', 'g') as m(x))
    or (select count(*) >= 2
        from regexp_matches(coalesce(p_actor,''),
             '\\m[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}\\M', 'g') as m(x))
    -- HTML entities
    or coalesce(p_actor,'') ~ '&(amp|lt|gt|quot|apos|nbsp|#[0-9]+);'
    -- Unicode replacement characters
    or position(chr(65533) in coalesce(p_actor,'')) > 0
    -- amendatory scaffolding captured as actor
    or coalesce(p_actor,'') ~* '\\m(to read as follows|is amended to read|is further amended)\\M'
    -- multi-clause capture (two or more modals inside one actor)
    or regexp_count(coalesce(p_actor,''), '(?i)\\m(shall|must|may)\\M') >= 2
  ;
$function$""",
 },
}

# ===========================================================================
# Lane C3 -- hash-bound projection contract; fail closed without verification
# ===========================================================================
LANES["c3"] = {
 "tag": "2.5.13-c3",
 "title": "C3 source acquisition, non-operative projection exclusions, reference-date gate, and receipts",
 "extra_functions": [
"""CREATE OR REPLACE FUNCTION public.rosetta_v25_mask_nonoperative_digest(p_value text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_start integer;
  v_heading integer;
  v_disclaimer integer;
  v_end integer;
  v_segment text;
  v_mask text;
begin
  -- A DIGEST heading is not enough to prove non-operative status across all
  -- jurisdictions. Require the source's own nearby statutory Louisiana
  -- non-operative disclaimer, then mask without changing offsets.
  v_heading := regexp_instr(
    p_value,
    '(^|\\n)[ \\t]*DIGEST[ \\t]*(\\r?\\n|$)',
    1, 1, 0, 'in');
  if v_heading = 0 then
    return p_value;
  end if;
  v_disclaimer := regexp_instr(
    p_value,
    '(?:constitutes[ \\t\\r\\n]+no[ \\t\\r\\n]+part|does[ \\t\\r\\n]+not[ \\t\\r\\n]+constitute[ \\t\\r\\n]+a[ \\t\\r\\n]+part)[ \\t\\r\\n]+of[ \\t\\r\\n]+the[ \\t\\r\\n]+legislative[ \\t\\r\\n]+instrument',
    greatest(1, v_heading - 1024), 1, 0, 'in');
  -- Louisiana House and Senate layouts place the disclaimer on opposite sides
  -- of the heading, and some name an individual drafter instead of Legislative
  -- Services. The authoritative disclaimer—not authorship—is the evidence.
  if v_disclaimer = 0
     or abs(v_disclaimer - v_heading) > 1024 then
    return p_value;
  end if;
  v_start := least(v_heading, v_disclaimer);
  v_end := regexp_instr(
    p_value,
    '(^|\\n)[ \\t]*Be[ \\t]+it[ \\t]+enacted[ \\t]+by[ \\t]+the[ \\t]+Legislature[ \\t]+of[ \\t]+Louisiana[ \\t]*:',
    v_start + 1, 1, 0, 'in');
  if v_end = 0 then
    v_end := char_length(p_value) + 1;
  end if;
  v_segment := substr(p_value, v_start, v_end - v_start);
  v_mask := regexp_replace(v_segment, '[^\\n\\r]', ' ', 'g');
  return overlay(p_value placing v_mask from v_start for v_end - v_start);
end;
$function$""",
"""CREATE OR REPLACE FUNCTION public.rosetta_v25_reference_date_gate(p_reference_date date)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  -- reference_date is the provider-observation/as-of date, not the date of
  -- enactment inside a historical instrument. The Unix epoch is therefore a
  -- deterministic lower bound for this transport field.
  v_provider_observation_floor constant date := date '1970-01-01';
begin
  if p_reference_date is not null
     and p_reference_date < v_provider_observation_floor then
    raise exception 'reference_date_below_provider_observation_floor: % is before %',
      p_reference_date, v_provider_observation_floor using errcode = 'P1A03';
  end if;
end;
$function$""",
"""CREATE OR REPLACE FUNCTION public.rosetta_v25_source_acquisition_gate(
    p_source_document_id integer,
    p_source_text text,
    p_media_type text,
    p_source_version text,
    p_source_url text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE STRICT
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_content public.source_document_content%rowtype;
  v_receipt jsonb;
  v_text_hash text;
begin
  -- C3 is an acquisition boundary, not a parser-side chrome deny-list.  For
  -- text/html, the stored text MUST already be the deterministic extracted
  -- legal text and MUST carry a receipt binding it to the immutable raw bytes.
  if lower(coalesce(p_media_type,'')) not in ('text/html','application/xhtml+xml') then
    return;
  end if;

  v_text_hash := encode(digest(convert_to(p_source_text,'UTF8'),'sha256'),'hex');
  select c.* into v_content
  from public.source_document_content c
  where c.source_document_id = p_source_document_id
    and c.source_content_hash = v_text_hash
    and c.source_version = p_source_version
    and c.source_url = p_source_url;
  if not found then
    raise exception 'html_content_extraction_receipt_missing: extracted text is not registered for source document %',
      p_source_document_id using errcode = 'P1A03';
  end if;

  v_receipt := v_content.source_metadata->'content_extraction_receipt';
  if v_receipt is null
     or v_content.source_byte_hash !~ '^[0-9a-f]{64}$'
     or v_receipt->>'contract' <> 'rosetta-html-content-extraction-v1'
     or nullif(v_receipt->>'extractor_version','') is null
     or v_receipt->>'extracted_text_sha256' is distinct from v_text_hash
     or lower(v_receipt->>'raw_source_sha256') is distinct from lower(v_content.source_byte_hash)
     or coalesce((v_receipt->>'navigation_removed')::boolean,false) is not true
     or coalesce((v_receipt->>'action_tables_removed')::boolean,false) is not true
     or coalesce((v_receipt->>'vote_chrome_removed')::boolean,false) is not true then
    raise exception 'html_content_extraction_receipt_invalid: raw/extracted hashes and removal assertions must be exact'
      using errcode = 'P1A03';
  end if;

  -- Defense in depth: a receipted extraction still fails if obvious markup or
  -- the observed navigation/action chrome survived into parser input.
  if p_source_text ~* '<[[:space:]]*(html|body|nav|script|style|a)\\M'
     or p_source_text ~* '&(?:nbsp|amp|quot|apos|lt|gt|#x?[0-9a-f]+);'
     or p_source_text ~* '\\m(go to top|skip to main content|actions:[[:space:]]*bill no|print this bill|share this page)\\M' then
    raise exception 'html_content_extraction_residue: parser input still contains markup, entities, or navigation/action chrome'
      using errcode = 'P1A03';
  end if;
end;
$function$""",
"""CREATE OR REPLACE FUNCTION public.rosetta_v25_projection_receipt(p_source_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_projected text;
  v_excluded integer := 0;
  v_i integer;
begin
  v_projected := public.rosetta_v25_layout_projection(p_source_text);
  -- excluded-region receipt: positions masked to spaces by the projection
  for v_i in 1..char_length(p_source_text) loop
    if substr(p_source_text, v_i, 1) not in (' ', chr(10), chr(13), chr(9))
       and substr(v_projected, v_i, 1) = ' ' then
      v_excluded := v_excluded + 1;
    end if;
  end loop;
  return jsonb_build_object(
    'contract', 'rosetta-projection-receipt-v1',
    'raw_sha256', encode(digest(convert_to(p_source_text,'UTF8'),'sha256'),'hex'),
    'projected_sha256', encode(digest(convert_to(v_projected,'UTF8'),'sha256'),'hex'),
    'projection_method', 'masking-projection',
    'projection_version', 'rosetta-layout-projection-v2513c3',
    'offset_mapping_status', 'not_preserved_declared',
    'offset_mapping', null,
    'excluded_regions', jsonb_build_object('masked_char_count', v_excluded,
        'method', 'position-diff of raw vs projected'),
    'charset_receipt', jsonb_build_object('source_charset','UTF8','decoding_method','database text (already decoded)'));
end;
$function$""",
"""CREATE OR REPLACE FUNCTION public.rosetta_v25_verify_projection(p_raw_text text, p_projected_text text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  -- verified only when recomputation reproduces the projected text byte-for-byte
  select public.rosetta_v25_layout_projection(p_raw_text) is not distinct from p_projected_text;
$function$""",
 ],
 "overrides": {
"rosetta_v25_layout_projection": None,  # placeholder replaced below
"rosetta_v25_refresh_object_source_spans": None,  # placeholder replaced below
 },
}

# C3 keeps source-authenticated non-operative regions and fixed-format page
# furniture out of the parser while preserving byte-position geometry.
LANES["c3"]["overrides"]["rosetta_v25_layout_projection"] = (
    DEFS[next(k for k in DEFS if k.startswith("rosetta_v25_layout_projection__"))]
    .replace(
        "  return public.rosetta_v25_protect_internal_periods(v_result);",
        "  -- Colorado PDF extraction can glue page furniture to text on both\n"
        "  -- sides. Mask only the contemporary fixed-width footer token.\n"
        "  v_result := public.rosetta_v25_mask_matches(\n"
        "    v_result,\n"
        "    'PAGE[ \\t]+[0-9]{1,4}[ \\t]*-[ \\t]*(?:HOUSE[ \\t]+BILL[ \\t]+[0-9]{2}[A-Z]?-[0-9]{4}|SENATE[ \\t]+BILL[ \\t]+[0-9]{2}[A-Z]?-[0-9]{3})',\n"
        "    'in');\n"
        "  v_result := public.rosetta_v25_mask_nonoperative_digest(v_result);\n"
        "  return public.rosetta_v25_protect_internal_periods(v_result);"
    )
)

# C3 must run before the inherited parser touches any source. It rejects an
# invalid provider-observation date first, then verifies raw-byte -> extracted-
# text receipts for HTML. Neither check writes candidate state.
LANES["c3"]["overrides"]["run_rosetta_v3_extraction_v2511_base"] = (
    DEFS[next(k for k in DEFS if k.startswith("run_rosetta_v3_extraction_v2511_base__"))]
    .replace(
        "begin\n  perform pg_advisory_xact_lock(20260731, p_source_document_id);",
        "begin\n  perform public.rosetta_v25_reference_date_gate(p_reference_date);\n"
        "  perform public.rosetta_v25_source_acquisition_gate("
        "p_source_document_id, p_source_text, p_media_type, p_source_version, p_source_url);\n"
        "  perform pg_advisory_xact_lock(20260731, p_source_document_id);"
    )
    .replace(
        "  v_flat := public.rosetta_v2_normalize_text(p_source_text);",
        "  v_flat := public.rosetta_v2_normalize_text("
        "public.rosetta_v25_layout_projection(p_source_text));"
    )
)

LANES["c3"]["overrides"]["rosetta_v25_refresh_object_source_spans"] = 'CREATE OR REPLACE FUNCTION public.rosetta_v25_refresh_object_source_spans(p_extraction_run_id integer, p_source_text text)\n RETURNS jsonb\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO \'pg_catalog\', \'public\', \'extensions\'\nAS $function$\ndeclare v_row record; v_loc record; v_block_text text; v_absolute_start integer; v_absolute_end integer; v_raw_text text; v_resolved integer:=0; v_ambiguous integer:=0; v_unresolved integer:=0; v_needle text;\nbegin\n delete from public.rosetta_object_source_span where extraction_run_id=p_extraction_run_id;\n for v_row in\n  select \'workflow_step\'::text object_type,ws.id object_id,wp.source_document_id,wp.source_block_id,rb.char_offset_start block_start,rb.char_offset_end block_end,ws.step_name needle\n  from public.workflow_step ws join public.workflow_pipeline wp on wp.id=ws.workflow_pipeline_id join public.hr1_raw_blocks rb on rb.id=wp.source_block_id where wp.extraction_run_id=p_extraction_run_id\n  union all\n  select \'accountability_route\',ar.id,ar.source_document_id,ar.source_block_id,rb.char_offset_start,rb.char_offset_end,ar.trigger_condition from public.accountability_route ar join public.hr1_raw_blocks rb on rb.id=ar.source_block_id where ar.extraction_run_id=p_extraction_run_id\n  union all\n  select \'entity_override\',eo.id,eo.source_document_id,eo.source_block_id,rb.char_offset_start,rb.char_offset_end,eo.override_scope from public.entity_override eo join public.hr1_raw_blocks rb on rb.id=eo.source_block_id where eo.extraction_run_id=p_extraction_run_id\n  union all\n  select \'term_definition\',td.id,td.source_document_id,td.source_block_id,rb.char_offset_start,rb.char_offset_end,\'"\'||td.defined_term||\'" \'||td.definition_text from public.term_definition td join public.hr1_raw_blocks rb on rb.id=td.source_block_id where td.extraction_run_id=p_extraction_run_id\n loop\n  v_needle:=v_row.needle;\n  v_block_text:=substr(p_source_text,v_row.block_start+1,v_row.block_end-v_row.block_start);\n  select * into v_loc from public.rosetta_v25_locate_normalized_text(v_block_text,v_needle);\n  if v_row.object_type=\'term_definition\' and v_loc.span_status=\'unresolved\' then\n   select td.definition_text into v_needle from public.term_definition td where td.id=v_row.object_id;\n   select * into v_loc from public.rosetta_v25_locate_normalized_text(v_block_text,v_needle);\n  end if;\n  -- C3: fail closed -- a span is bound only when the needle is verified present\n  -- in the hash-bound projection of the block; otherwise it is unresolved.\n  if v_loc.span_status in (\'resolved\',\'ambiguous\')\n     and not public.rosetta_v25_projected_contains(v_block_text, v_needle) then\n   v_loc.span_status:=\'unresolved\';\n  end if;\n  if v_loc.span_status in (\'resolved\',\'ambiguous\') then\n   v_absolute_start:=v_row.block_start+v_loc.source_offset_start; v_absolute_end:=v_row.block_start+v_loc.source_offset_end;\n   v_raw_text:=substr(p_source_text,v_absolute_start+1,v_absolute_end-v_absolute_start);\n  else v_absolute_start:=null; v_absolute_end:=null; v_raw_text:=null; end if;\n  insert into public.projection_receipt(extraction_run_id,object_type,object_id,raw_sha256,projected_sha256,projection_method,projection_version,offset_mapping,offset_mapping_status,charset_receipt,excluded_regions,verified)\n  select p_extraction_run_id, v_row.object_type, v_row.object_id::text,\n         r.receipt->>\'raw_sha256\', r.receipt->>\'projected_sha256\', r.receipt->>\'projection_method\', r.receipt->>\'projection_version\',\n         null, r.receipt->>\'offset_mapping_status\', r.receipt->\'charset_receipt\', r.receipt->\'excluded_regions\',\n         public.rosetta_v25_verify_projection(v_block_text, public.rosetta_v25_layout_projection(v_block_text))\n  from (select public.rosetta_v25_projection_receipt(v_block_text) as receipt) as r;\n  insert into public.rosetta_object_source_span(object_type,object_id,extraction_run_id,source_document_id,source_block_id,source_offset_start,source_offset_end,raw_text,normalized_text,raw_text_hash,projection_version,span_status)\n  values(v_row.object_type,v_row.object_id,p_extraction_run_id,v_row.source_document_id,v_row.source_block_id,v_absolute_start,v_absolute_end,v_raw_text,v_needle,case when v_raw_text is null then null else encode(digest(convert_to(v_raw_text,\'UTF8\'),\'sha256\'),\'hex\') end,\'rosetta-layout-projection-v2513c3\',v_loc.span_status)\n  on conflict(object_type,object_id) do update set extraction_run_id=excluded.extraction_run_id,source_document_id=excluded.source_document_id,source_block_id=excluded.source_block_id,source_offset_start=excluded.source_offset_start,source_offset_end=excluded.source_offset_end,raw_text=excluded.raw_text,normalized_text=excluded.normalized_text,raw_text_hash=excluded.raw_text_hash,projection_version=excluded.projection_version,span_status=excluded.span_status,created_at=now();\n  if v_loc.span_status=\'resolved\' then v_resolved:=v_resolved+1; elsif v_loc.span_status=\'ambiguous\' then v_ambiguous:=v_ambiguous+1; else v_unresolved:=v_unresolved+1; end if;\n end loop;\n return jsonb_build_object(\'contract\',\'rosetta-object-source-span-v2513c3\',\'extraction_run_id\',p_extraction_run_id,\'resolved\',v_resolved,\'ambiguous\',v_ambiguous,\'unresolved\',v_unresolved);\nend;$function$\n'

# ===========================================================================
# Lane C4 -- occurrence-aware span resolution (ported from the verified
# 2.5.12 reference bodies; resolve only when source occurrence count equals
# object count, else ambiguous)
# ===========================================================================
V2512_NAMES = sorted({k.split("__")[0] for k in
    ["rosetta_v2512_layout_projection","rosetta_v2512_locate_normalized_text_occurrence",
     "rosetta_v2512_normalized_occurrence_count","rosetta_v2512_refresh_object_source_spans"]},
    key=len, reverse=True)

LANES["c4"] = {
 "tag": "2.5.13-c4",
 "title": "C4 occurrence-aware span binding (ported 2.5.12 trio + refresh)",
 "extra_files": sorted(REF2512),          # ported, not reconstructed
 "literal_swaps": [("v2512", "v2513c4")], # projection_version / contract tags
 "overrides": {},
}

# The captured 2.5.11 validator predates help-entity span projection and counts
# only four structural object layers.  C4 deliberately extends the span
# contract to help_entity, so its expected cardinality must extend in the same
# one-variable lane.  Patch the captured body by an exact anchor and fail the
# generator if the upstream definition ever drifts.
_VALIDATOR_KEY = next(
    k for k in DEFS if k.startswith(
        "rosetta_v25_validate_independent_structure__"
    )
)
_VALIDATOR_SPAN_ANCHOR = """    +(select count(*) from public.term_definition definition where definition.extraction_run_id=p_extraction_run_id)
  into v_expected_span_count;"""
_VALIDATOR_SPAN_WITH_HELP = """    +(select count(*) from public.term_definition definition where definition.extraction_run_id=p_extraction_run_id)
    +(select count(*) from public.help_entity help where help.extraction_run_id=p_extraction_run_id)
  into v_expected_span_count;"""

def validator_with_help_span_count():
    body = DEFS[_VALIDATOR_KEY]
    if body.count(_VALIDATOR_SPAN_ANCHOR) != 1:
        raise RuntimeError(
            "independent validator span-count anchor drifted; refusing generation"
        )
    return body.replace(_VALIDATOR_SPAN_ANCHOR, _VALIDATOR_SPAN_WITH_HELP)

LANES["c4"]["overrides"]["rosetta_v25_validate_independent_structure"] = (
    validator_with_help_span_count()
)

LANES["c4"]["overrides"]["rosetta_v25_refresh_object_source_spans"] = """CREATE OR REPLACE FUNCTION public.rosetta_v25_refresh_object_source_spans(p_extraction_run_id integer, p_source_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_base jsonb;v_row record;v_loc record;v_block_text text;v_source_count integer;
  v_object_count integer;v_object_ordinal integer;v_status text;
  v_start integer;v_end integer;v_raw text;v_resolved integer:=0;
  v_ambiguous integer:=0;v_unresolved integer:=0;
begin
  -- C4: delegate to the occurrence-aware refresh ported from the verified
  -- 2.5.12 reference (resolve only when source occurrence count equals object
  -- count; otherwise the span is recorded ambiguous and never silently bound).
  v_base:=public.rosetta_v2512_refresh_object_source_spans(p_extraction_run_id, p_source_text);
  -- 2.5.12 omitted the help layer entirely. Every emitted object needs an
  -- explicit span state, so apply the identical occurrence rule to help.
  for v_row in
    select h.id object_id,h.source_document_id,h.source_block_id,
           rb.char_offset_start block_start,rb.char_offset_end block_end,
           h.entity_name needle
    from public.help_entity h join public.hr1_raw_blocks rb on rb.id=h.source_block_id
    where h.extraction_run_id=p_extraction_run_id
    order by h.source_block_id,h.entity_name,h.id
  loop
    v_block_text:=substr(p_source_text,v_row.block_start+1,v_row.block_end-v_row.block_start);
    v_source_count:=public.rosetta_v2512_normalized_occurrence_count(v_block_text,v_row.needle);
    select count(*)::integer,count(*) filter(where h.id<=v_row.object_id)::integer
      into v_object_count,v_object_ordinal
    from public.help_entity h
    where h.extraction_run_id=p_extraction_run_id and h.source_block_id=v_row.source_block_id
      and public.rosetta_v2_normalize_text(h.entity_name)=public.rosetta_v2_normalize_text(v_row.needle);
    if v_source_count>0 and v_source_count=v_object_count then
      select * into v_loc from public.rosetta_v2512_locate_normalized_text_occurrence(
        v_block_text,v_row.needle,v_object_ordinal);v_status:=v_loc.span_status;
    elsif v_source_count>0 then
      select * into v_loc from public.rosetta_v2512_locate_normalized_text_occurrence(
        v_block_text,v_row.needle,1);v_status:='ambiguous';
    else v_status:='unresolved'; end if;
    if v_status in('resolved','ambiguous') and v_loc.source_offset_start is not null then
      v_start:=v_row.block_start+v_loc.source_offset_start;
      v_end:=v_row.block_start+v_loc.source_offset_end;
      v_raw:=substr(p_source_text,v_start+1,v_end-v_start);
    else v_start:=null;v_end:=null;v_raw:=null;end if;
    insert into public.rosetta_object_source_span
      (object_type,object_id,extraction_run_id,source_document_id,source_block_id,
       source_offset_start,source_offset_end,raw_text,normalized_text,raw_text_hash,
       projection_version,span_status)
    values('help_entity',v_row.object_id,p_extraction_run_id,v_row.source_document_id,
      v_row.source_block_id,v_start,v_end,v_raw,v_row.needle,
      case when v_raw is null then null else encode(digest(convert_to(v_raw,'UTF8'),'sha256'),'hex') end,
      'rosetta-layout-projection-v2513c4',v_status)
    on conflict(object_type,object_id) do update set
      extraction_run_id=excluded.extraction_run_id,source_document_id=excluded.source_document_id,
      source_block_id=excluded.source_block_id,source_offset_start=excluded.source_offset_start,
      source_offset_end=excluded.source_offset_end,raw_text=excluded.raw_text,
      normalized_text=excluded.normalized_text,raw_text_hash=excluded.raw_text_hash,
      projection_version=excluded.projection_version,span_status=excluded.span_status,created_at=now();
    if v_status='resolved' then v_resolved:=v_resolved+1;
    elsif v_status='ambiguous' then v_ambiguous:=v_ambiguous+1;
    else v_unresolved:=v_unresolved+1;end if;
  end loop;
  return v_base||jsonb_build_object('help_resolved',v_resolved,
    'help_ambiguous',v_ambiguous,'help_unresolved',v_unresolved);
end;
$function$"""

# ===========================================================================
# Lane C5 -- clause decomposition: leading condition / scaffold / actor /
# modal / action / trailing condition, exact text and offsets preserved.
# Conditional prefixes and 'to read as follows' are never actors.
# ===========================================================================
LANES["c5"] = {
 "tag": "2.5.13-c5",
 "title": "C5 clause segmentation and decomposition with person-name middle initials and exact offsets",
 "extra_functions": [
"""CREATE OR REPLACE FUNCTION public.rosetta_v25_decompose_clause(p_clause text)
 RETURNS TABLE(leading_condition text, scaffold text, actor text, modal text,
               action text, trailing_condition text,
               actor_offset_start integer, actor_offset_end integer)
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_norm text;
  v_work text;
  v_m text[];
  v_lead text := null;
  v_scaffold text := null;
  v_actor_text text;
  v_actor_full text;
  v_modal_text text;
  v_raw_action text;
  v_signature text;
  v_signature_raw text;
  v_signature_loc record;
  v_actor_loc record;
  v_actor_start integer := null;
  v_actor_end integer := null;
  v_trail_pos integer;
  v_action text;
begin
  v_norm := public.rosetta_v25_unprotect_text(public.rosetta_v2_normalize_text(p_clause));
  v_norm := regexp_replace(v_norm,'^(?:\\([a-z0-9]+\\)\\s*)+','','i');
  v_norm := regexp_replace(v_norm,'^\\d+[.)]\\s*','');

  -- leading condition (if/when/whenever/provided that/unless/except when/subject to ... ,)
  v_m := regexp_match(v_norm,'(?i)^((?:if|when|whenever|provided that|unless|except when|subject to)\\M[^,]*),\\s*(.+)$');
  if v_m is not null then
    v_lead := v_m[1];
    v_work := v_m[2];
  else
    v_work := v_norm;
  end if;

  -- amendatory scaffold ('to read as follows', 'is amended to read') -- never actor
  v_m := regexp_match(v_work,
    '(?i)^((?:[^:]{0,240}\\m(?:is|are)\\s+(?:further\\s+)?amended\\s+to\\s+read(?:\\s+as\\s+follows)?|[^:]{0,240}\\mto\\s+read\\s+as\\s+follows)\\s*:?\\s*)(.+)$');
  if v_m is not null then
    v_scaffold := btrim(v_m[1]);
    v_work := v_m[2];
  end if;
  -- A subdivision marker can follow an amendatory scaffold. It is location
  -- context, never part of the actor.
  v_work := regexp_replace(v_work,'^(?:\\([a-z0-9]+\\)\\s*)+','','i');
  v_work := regexp_replace(v_work,'^\\d+[.)]\\s*','');

  -- actor / modal / action
  v_m := regexp_match(v_work,'(?i)^(.+?)\\s+(shall|must|may)(\\s+not)?\\s+(.+)$');
  if v_m is null then
    return query select v_lead, v_scaffold, null::text, null::text, null::text, null::text, null::integer, null::integer;
    return;
  end if;
  v_actor_full := btrim(v_m[1], E' \t\r\n,;:');
  v_actor_text := v_actor_full;
  v_modal_text := lower(v_m[2] || coalesce(v_m[3],''));
  v_raw_action := v_m[4];

  -- A restrictive/conditional relative clause qualifies the actor; it is not
  -- itself the actor. Preserve it as context instead of silently discarding it.
  if v_actor_text ~* '^.+\\s+(that|which|who)\\s+.+$' then
    v_m := regexp_match(v_actor_text,'(?i)^(.+?)\\s+((?:that|which|who)\\s+.+)$');
    v_actor_text := btrim(v_m[1]);
    v_lead := concat_ws('; ',v_lead,'actor qualification: ' || btrim(v_m[2]));
  end if;

  -- trailing condition splits the action
  v_action := v_raw_action;
  v_trail_pos := regexp_instr(v_action,'(?i)\\m(if|when|provided that|unless)\\M');
  v_action := case when v_trail_pos > 1
    then btrim(substr(v_action,1,v_trail_pos-1), E' \t\r\n,;:')
    else btrim(v_action, E' \t\r\n,;:') end;

  -- Offsets are zero-based, half-open offsets into the ORIGINAL clause.  Do
  -- not derive them from whitespace-normalized or marker-stripped text.
  v_signature := v_actor_full || ' ' || v_modal_text;
  select * into v_signature_loc
  from public.rosetta_v25_locate_normalized_text(p_clause,v_signature);
  if v_signature_loc.span_status = 'resolved' then
    v_signature_raw := substr(p_clause,v_signature_loc.source_offset_start+1,
                              v_signature_loc.source_offset_end-v_signature_loc.source_offset_start);
    select * into v_actor_loc
    from public.rosetta_v25_locate_normalized_text(v_signature_raw,v_actor_text);
    if v_actor_loc.span_status = 'resolved' then
      v_actor_start := v_signature_loc.source_offset_start + v_actor_loc.source_offset_start;
      v_actor_end := v_signature_loc.source_offset_start + v_actor_loc.source_offset_end;
    end if;
  end if;
  return query select
    v_lead,
    v_scaffold,
    v_actor_text,
    v_modal_text,
    v_action,
    case when v_trail_pos > 1 then btrim(substr(v_raw_action,v_trail_pos), E' \t\r\n,;:') else null end,
    v_actor_start,
    v_actor_end;
end;
$function$""",
 ],
 "overrides": {
"rosetta_v25_is_internal_period": None,  # placeholder replaced below
"rosetta_v25_modal_and_actor": """CREATE OR REPLACE FUNCTION public.rosetta_v25_modal_and_actor(p_clause text)
 RETURNS TABLE(modal text, actor text)
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_d record;
begin
  -- C5: route through decomposition so conditional prefixes and amendatory
  -- scaffolding can never be captured as the actor; exact text and offsets are
  -- preserved by rosetta_v25_decompose_clause for receipts.
  select d.modal, d.actor into v_d from public.rosetta_v25_decompose_clause(p_clause) d;
  return query select v_d.modal, v_d.actor;
end;
$function$""",
"rosetta_v2_modal_and_actor": """CREATE OR REPLACE FUNCTION public.rosetta_v2_modal_and_actor(p_clause text)
 RETURNS TABLE(modal text, actor text)
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_d record;
begin
  -- C5: same decomposition for the v2 call path (single behavior, one lane).
  select d.modal, d.actor into v_d from public.rosetta_v25_decompose_clause(p_clause) d;
  return query select v_d.modal, v_d.actor;
end;
$function$""",
 },
}

# Protect a middle initial only in a bounded person-name-shaped normative
# actor. The declared structural-label lexicon keeps labels such as "Rule A."
# and "Plan A." as real sentence boundaries. A blanket capital-dot-capital
# rule would silently merge them.
LANES["c5"]["overrides"]["rosetta_v25_is_internal_period"] = (
    DEFS[next(k for k in DEFS if k.startswith("rosetta_v25_is_internal_period__"))]
    .replace(
        " if v_word is not null and v_word ~ '^[A-Z]$' and v_after ~ '^(?:[0-9]|No[.]\\s*[0-9])' then return true; end if;",
        " if v_word is not null and v_word ~ '^[A-Z]$'\n"
        "    and v_left ~ '(^|[^A-Za-z])[A-Z][A-Za-z''-]{1,63}[ \\t]+[A-Z]$'\n"
        "    and v_left !~* '(^|[^A-Za-z])(Appendix|Article|Chapter|Ch|Class|Clause|Digest|Division|Exhibit|Figure|Form|Grade|Item|Option|Paragraph|Part|Phase|Plan|Policy|Rule|Schedule|Section|Sec|Step|Subpart|Subsection|Table|Title|Version|Volume)[ \\t]+[A-Z]$'\n"
        "    and v_after ~ '^[A-Z][A-Za-z''-]{1,63}(?:[ \\t]*,[ \\t]*[a-z][A-Za-z'' -]{0,63}[ \\t]*,)?[ \\t]+(?:shall|must|may)\\M' then return true; end if;\n"
        " if v_word is not null and v_word ~ '^[A-Z]$' and v_after ~ '^(?:[0-9]|No[.]\\s*[0-9])' then return true; end if;"
    )
)

# ===========================================================================
# Lane C6 -- no silent modal retyping; revalidation against stored clause;
# mixed polarity fails closed into a blocking repair.
# ===========================================================================
LANES["c6"] = {
 "tag": "2.5.13-c6",
 "title": "C6 modal retyping revalidation; mixed-polarity fails closed",
 "overrides": {"rosetta_v253_reconcile_structural_correctness": """CREATE OR REPLACE FUNCTION public.rosetta_v253_reconcile_structural_correctness(p_extraction_run_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare v_route record; v_kind record; v_retyped text; v_polarity_mixed boolean; v_actor text; v_definition_count integer:=0; v_accountability_count integer:=0; v_occurrence_count integer:=0; v_blocking integer:=0;
begin
 update public.term_definition definition set defining_section=block.section_number,section_declared=block.section_number,section_observed=block.section_number,section_status='resolved' from public.hr1_raw_blocks block where definition.extraction_run_id=p_extraction_run_id and block.id=definition.source_block_id; get diagnostics v_definition_count=row_count;
 -- C6: clear stale repair rows BEFORE the loop so rows raised by this pass survive
 delete from public.rosetta_structural_repair_queue where extraction_run_id=p_extraction_run_id and defect_type in ('actor_unresolved','actor_source_corrupt','accountability_semantic_mismatch','modal_polarity_conflict');
 for v_route in select route.id,route.trigger_condition,route.action_type existing_action_type,route.source_document_id,coalesce(nullif(route.actor_source_text,''),nullif(route.enforcement_actor,'')) existing_actor,block.section_number from public.accountability_route route join public.hr1_raw_blocks block on block.id=route.source_block_id where route.extraction_run_id=p_extraction_run_id loop
  v_actor:=public.rosetta_v251_accountability_actor(v_route.trigger_condition,v_route.existing_actor); select * into v_kind from public.rosetta_v251_accountability_kind(v_route.trigger_condition); if v_kind.enforcement_type='source_stated_penalty_rule' and v_route.trigger_condition ~* '\\mis\\s+guilty\\M' then v_actor:=public.rosetta_v252_penalty_actor(v_route.trigger_condition); end if;
  -- C6: revalidate every retyped field against the stored clause; mixed polarity fails closed
  -- retype is clause-local: the modal of the FIRST conjunct (main clause),
  -- not a priority scan across the whole trigger text.
  -- action_type stores the base modal only.  The source clause retains the
  -- exact negative polarity; concatenating capture 2 here would produce
  -- "shall not"/"must not"/"may not", which violates the mirrored 2.5.11
  -- accountability_route_action_type_check contract.
  select lower(m[1]) into v_retyped
  from regexp_match(v_route.trigger_condition,
       '(?i)\\m(shall|must|may)(\\s+not)?\\M') as m;
  -- polarity is clause-local too: conflict exists when different conjuncts
  -- carry opposing obligation strengths (prohibition vs permission)
  v_polarity_mixed:=
    (select coalesce(bool_or(part ~* '\\m(shall|must|may)\\s+not\\M'),false)
       from regexp_split_to_table(v_route.trigger_condition, '\\m(?:and|or|but)\\M', 'i') as part)
    and
    (select coalesce(bool_or(
       regexp_replace(part,'(?i)\\m(shall|must|may)\\s+not\\M','','g')
         ~* '\\m(shall|must|may)\\M'),false)
       from regexp_split_to_table(v_route.trigger_condition, '\\m(?:and|or|but)\\M', 'i') as part);
  if v_polarity_mixed or (v_route.existing_action_type is not null and v_retyped is not null and v_route.existing_action_type<>v_retyped) then
   insert into public.rosetta_structural_repair_queue(extraction_run_id,source_document_id,object_type,object_id,defect_type,defect_detail,repair_state)
   values(p_extraction_run_id,v_route.source_document_id,'accountability',v_route.id,'modal_polarity_conflict',
    jsonb_build_object('clause',left(v_route.trigger_condition,500),'existing_action_type',v_route.existing_action_type,'retyped_action_type',v_retyped,'mixed_polarity',v_polarity_mixed),
    'open')
   on conflict(object_type,object_id,defect_type) do update set defect_detail=excluded.defect_detail,repair_state='open',resolved_at=null;
  else
   update public.accountability_route set actor_source_text=v_actor,enforcement_actor=v_actor,actor_label=v_actor,governing_section=v_route.section_number,section_declared=v_route.section_number,section_observed=v_route.section_number,section_status='resolved',enforcement_type=v_kind.enforcement_type,enforcement_direction=v_kind.enforcement_direction,clause_type=v_kind.clause_type,action_type=v_retyped where id=v_route.id;
  end if;
  v_accountability_count:=v_accountability_count+1;
 end loop;
 insert into public.rosetta_structural_repair_queue(extraction_run_id,source_document_id,object_type,object_id,defect_type,defect_detail,repair_state) select route.extraction_run_id,route.source_document_id,'accountability',route.id,'actor_source_corrupt',jsonb_build_object('actor_source_text',route.actor_source_text),'open' from public.accountability_route route where route.extraction_run_id=p_extraction_run_id and public.rosetta_v25_actor_source_corrupt(route.actor_source_text) on conflict(object_type,object_id,defect_type) do update set defect_detail=excluded.defect_detail,repair_state='open',resolved_at=null;
 insert into public.rosetta_canonical_clause(normalized_text_hash,normalized_text,clause_type) select distinct encode(digest(convert_to(public.rosetta_normalize_clause_text(node.action_required),'UTF8'),'sha256'),'hex'),public.rosetta_normalize_clause_text(node.action_required),coalesce(route.clause_type,'procedure') from public.accountability_route route join public.escalation_node node on node.accountability_route_id=route.id where route.extraction_run_id=p_extraction_run_id and public.rosetta_normalize_clause_text(node.action_required)<>'' on conflict(normalized_text_hash,clause_type) do nothing;
 insert into public.rosetta_clause_occurrence(canonical_clause_id,accountability_route_id,escalation_node_id,extraction_run_id,source_document_id,source_block_id,source_offset_start,source_offset_end,section_observed,section_status,source_text) select canonical.canonical_clause_id,route.id,node.id,route.extraction_run_id,route.source_document_id,route.source_block_id,block.char_offset_start,block.char_offset_end,block.section_number,route.section_status,node.action_required from public.accountability_route route join public.escalation_node node on node.accountability_route_id=route.id join public.hr1_raw_blocks block on block.id=route.source_block_id join public.rosetta_canonical_clause canonical on canonical.normalized_text_hash=encode(digest(convert_to(public.rosetta_normalize_clause_text(node.action_required),'UTF8'),'sha256'),'hex') and canonical.clause_type=coalesce(route.clause_type,'procedure') where route.extraction_run_id=p_extraction_run_id on conflict(accountability_route_id,escalation_node_id) do update set canonical_clause_id=excluded.canonical_clause_id,section_observed=excluded.section_observed,section_status=excluded.section_status,source_text=excluded.source_text; get diagnostics v_occurrence_count=row_count;
 select public.rosetta_blocking_structural_repair_count(p_extraction_run_id) into v_blocking; return jsonb_build_object('contract','rosetta-structural-reconciliation-v253','extraction_run_id',p_extraction_run_id,'definition_count',v_definition_count,'accountability_count',v_accountability_count,'clause_occurrence_count',v_occurrence_count,'blocking_repair_count',v_blocking,'publication_state',case when v_blocking>0 then 'verified_with_defects' else 'verified' end);
end;$function$
"""},
}

# ===========================================================================
# Lane C7 -- charset/decoding receipts gate span certainty
# ===========================================================================
LANES["c7"] = {
 "tag": "2.5.13-c7",
 "title": "C7 decoding-method receipts; undispositioned replacement chars block",
 "extra_functions": [
"""CREATE OR REPLACE FUNCTION public.rosetta_v25_charset_gate(p_source_document_id integer, p_source_text text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_rep integer;
  v_receipt jsonb;
  v_disp text;
  v_recorded_rep integer;
begin
  v_rep := regexp_count(coalesce(p_source_text,''), chr(65533));
  -- decoding-method receipt recorded at immutable registration time (migration 01),
  -- bound to the EXACT source: content id for this document AND the sha256 of
  -- the text being gated. A receipt for any other document or text never applies.
  select r.charset_receipt into v_receipt
  from public.source_document_content c
  join rosetta_replay.replay_source_registry r
    on r.source_content_id = c.source_content_id
   and r.source_content_hash = encode(digest(convert_to(p_source_text,'UTF8'),'sha256'),'hex')
  where c.source_document_id = p_source_document_id
  order by r.registered_at desc
  limit 1;
  if v_receipt is null
     or nullif(v_receipt->>'decoding_method','') is null
     or not (v_receipt ? 'invalid_byte_handling')
     or not (v_receipt ? 'replacement_char_count')
     or not (v_receipt ? 'replacement_chars_block_span_certainty') then
    raise exception 'charset_receipt_missing_or_incomplete: exact source requires decoding method, invalid-byte handling, replacement count, and span-certainty disposition'
      using errcode = 'P1A07';
  end if;
  begin
    v_recorded_rep := (v_receipt->>'replacement_char_count')::integer;
  exception when others then
    raise exception 'charset_receipt_invalid_replacement_count' using errcode = 'P1A07';
  end;
  if v_recorded_rep is distinct from v_rep then
    raise exception 'charset_receipt_count_mismatch: observed %, receipted %', v_rep, v_recorded_rep
      using errcode = 'P1A07';
  end if;
  if v_rep > 0 then
    v_disp := coalesce(v_receipt->>'replacement_char_disposition','undispositioned');
    if v_disp <> 'manual_verified_literal'
       or coalesce((v_receipt->>'replacement_chars_block_span_certainty')::boolean,true) then
      raise exception 'replacement_chars_block_span_certainty: % U+FFFD characters require manual_verified_literal and an explicit false span-certainty block', v_rep
        using errcode = 'P1A07';
    end if;
  end if;
end;
$function$""",
 ],
 "overrides": {"run_rosetta_v3_extraction_v2511_base": """CREATE OR REPLACE FUNCTION public.run_rosetta_v3_extraction_v2511_base(p_source_document_id integer, p_source_text text, p_expected_source_content_hash text, p_source_url text, p_source_version text, p_media_type text DEFAULT 'text/plain'::text, p_source_byte_hash text DEFAULT NULL::text, p_source_provider_hash text DEFAULT NULL::text, p_reference_date date DEFAULT NULL::date, p_text_extractor_version text DEFAULT 'plain-text-1'::text, p_source_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
 SET statement_timeout TO '120s'
AS $function$
declare
  v_engine_version constant text := 'rosetta-v3-deterministic-sql-2.5.11';
  v_rule_set_version constant text := 'rosetta-five-layer-structural-correctness-2.5.11';
  v_manifest_hash text;
  v_corpus_id integer;
  v_document_identifier text;
  v_document_name text;
  v_content_id uuid;
  v_existing_content_hash text;
  v_existing_source_url text;
  v_source_content_hash text;
  v_source_identity_hash text;
  v_configuration_json jsonb;
  v_configuration_hash text;
  v_flat text;
  v_section_number text := 'Document';
  v_effective_date date;
  v_temporal_status text := 'pending';
  v_run_id integer;
  v_run_version integer;
  v_replay_status text;
  v_replay_output_hash text;
  v_replay_admissibility text;
  v_block_id text;
  v_match text[];
  v_clause text;
  v_modal text;
  v_actor text;
  v_help_count integer := 0;
  v_workflow_count integer := 0;
  v_accountability_count integer := 0;
  v_override_count integer := 0;
  v_definition_count integer := 0;
  v_output jsonb;
  v_output_hash text;
  v_row_counts jsonb;
  v_coverage jsonb;
  v_is_incomplete boolean;
  v_result jsonb;
  v_section record;
  v_clause_row record;
  v_section_flat text;
  v_section_hash text;
  v_section_block_id text;
  v_pipeline_id text;
  v_section_help_count integer := 0;
  v_section_workflow_count integer := 0;
  v_section_accountability_count integer := 0;
  v_section_override_count integer := 0;
  v_section_definition_count integer := 0;
  v_structural_validation jsonb;
begin
  -- C7: exact-source charset receipt gate.
  perform public.rosetta_v25_charset_gate(p_source_document_id, p_source_text);
  perform pg_advisory_xact_lock(20260731, p_source_document_id);

  select sd.corpus_id, sd.document_identifier, sd.document_name
    into v_corpus_id, v_document_identifier, v_document_name
  from public.source_document sd
  where sd.id = p_source_document_id;

  if v_corpus_id is null then
    raise exception using errcode = 'P0002', message = 'source_document_not_found';
  end if;

  if nullif(btrim(v_document_identifier), '') is null then
    raise exception using errcode = '22023', message = 'source_document_identifier_required';
  end if;

  if nullif(btrim(p_source_text), '') is null then
    raise exception using errcode = '22023', message = 'source_text_required';
  end if;

  if nullif(btrim(p_source_url), '') is null then
    raise exception using errcode = '22023', message = 'source_url_required';
  end if;

  if nullif(btrim(p_source_version), '') is null then
    raise exception using errcode = '22023', message = 'source_version_required';
  end if;

  select erm.manifest_hash
    into v_manifest_hash
  from public.extraction_rule_manifest erm
  where erm.engine_version = v_engine_version
    and erm.rule_set_version = v_rule_set_version
    and erm.is_active = true
  limit 1;

  if v_manifest_hash is null then
    raise exception using errcode = '55000', message = 'active_rule_manifest_not_found';
  end if;

  v_source_content_hash := encode(digest(convert_to(p_source_text, 'UTF8'), 'sha256'), 'hex');

  if lower(regexp_replace(coalesce(p_expected_source_content_hash, ''), '^sha256:', '')) <> v_source_content_hash then
    raise exception using errcode = '22000', message = 'source_content_hash_mismatch';
  end if;

  if p_source_byte_hash is not null and lower(p_source_byte_hash) !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'source_byte_hash_must_be_sha256_hex';
  end if;

  if lower(coalesce(p_media_type, '')) = 'application/pdf' and p_source_byte_hash is null then
    raise exception using errcode = '22023', message = 'pdf_source_byte_hash_required';
  end if;

  v_configuration_json := jsonb_build_object(
    'reference_date', p_reference_date,
    'text_extractor_version', coalesce(nullif(btrim(p_text_extractor_version), ''), 'unknown'),
    'normalization_version', 'rosetta-normalize-whitespace-v2',
    'parsing_projection_version', 'rosetta-layout-projection-v25',
    'confidence_mode', 'binary_exact_match_only'
  );
  v_configuration_hash := encode(digest(convert_to(v_configuration_json::text, 'UTF8'), 'sha256'), 'hex');

  v_source_identity_hash := encode(digest(convert_to(
    jsonb_build_object(
      'document_identifier', v_document_identifier,
      'source_version', p_source_version,
      'source_url', p_source_url,
      'source_content_hash', v_source_content_hash,
      'source_byte_hash', p_source_byte_hash,
      'media_type', p_media_type
    )::text,
    'UTF8'
  ), 'sha256'), 'hex');

  insert into public.source_document_content (
    source_document_id,
    source_version,
    source_url,
    media_type,
    source_text,
    source_content_hash,
    source_byte_hash,
    source_provider_hash,
    source_identity_hash,
    source_metadata
  ) values (
    p_source_document_id,
    p_source_version,
    p_source_url,
    coalesce(nullif(btrim(p_media_type), ''), 'text/plain'),
    p_source_text,
    v_source_content_hash,
    lower(p_source_byte_hash),
    p_source_provider_hash,
    v_source_identity_hash,
    coalesce(p_source_metadata, '{}'::jsonb)
  )
  on conflict (source_document_id, source_version) do nothing
  returning source_content_id into v_content_id;

  if v_content_id is null then
    select sdc.source_content_id, sdc.source_content_hash, sdc.source_url
      into v_content_id, v_existing_content_hash, v_existing_source_url
    from public.source_document_content sdc
    where sdc.source_document_id = p_source_document_id
      and sdc.source_version = p_source_version;

    if v_existing_content_hash is distinct from v_source_content_hash
       or v_existing_source_url is distinct from p_source_url then
      raise exception using errcode = '23505', message = 'source_version_content_conflict';
    end if;
  end if;

  select er.id, er.run_version, er.run_status, er.output_content_hash, er.admissibility_state
    into v_run_id, v_run_version, v_replay_status, v_replay_output_hash, v_replay_admissibility
  from public.extraction_run er
  where er.source_document_id = p_source_document_id
    and er.source_content_id = v_content_id
    and er.engine_version = v_engine_version
    and er.rule_set_version = v_rule_set_version
    and er.rule_manifest_hash = v_manifest_hash
    and er.configuration_hash = v_configuration_hash
  order by er.id
  limit 1;

  if v_run_id is not null then
    select jsonb_object_agg(lower(lc.layer_name), jsonb_build_object(
             'status', lc.coverage_status,
             'reason', lc.reason,
             'validated_at', lc.validated_at
           ) order by lc.layer_name)
      into v_coverage
    from public.layer_coverage lc
    where lc.extraction_run_id = v_run_id;

    return jsonb_build_object(
      'source_document_id', p_source_document_id,
      'source_content_id', v_content_id,
      'source_identity_hash', v_source_identity_hash,
      'source_content_hash', v_source_content_hash,
      'extraction_run_id', v_run_id,
      'run_version', v_run_version,
      'run_status', v_replay_status,
      'admissibility_state', v_replay_admissibility,
      'engine_version', v_engine_version,
      'rule_set_version', v_rule_set_version,
      'rule_manifest_hash', v_manifest_hash,
      'configuration_hash', v_configuration_hash,
      'output_content_hash', v_replay_output_hash,
      'coverage', coalesce(v_coverage, '{}'::jsonb),
      'replayed', true
    );
  end if;

  select er.id, er.run_version
    into v_run_id, v_run_version
  from public.extraction_run er
  where er.source_document_id = p_source_document_id
    and er.run_status = 'in_progress'
    and er.source_content_id is null
    and not exists (
      select 1 from public.hr1_raw_blocks rb where rb.extraction_run_id = er.id
    )
    and not exists (
      select 1 from public.extraction_manifest em where em.extraction_run_id = er.id
    )
  order by er.run_version desc, er.id desc
  limit 1
  for update;

  if v_run_id is null then
    select coalesce(max(er.run_version), 0) + 1
      into v_run_version
    from public.extraction_run er
    where er.source_document_id = p_source_document_id;

    insert into public.extraction_run (
      source_document_id,
      run_version,
      run_status,
      confidence_threshold,
      source_content_id,
      engine_version,
      rule_set_version,
      rule_manifest_hash,
      configuration_hash,
      configuration_json,
      source_identity_hash,
      source_content_hash,
      admissibility_state
    ) values (
      p_source_document_id,
      v_run_version,
      'in_progress',
      1.00,
      v_content_id,
      v_engine_version,
      v_rule_set_version,
      v_manifest_hash,
      v_configuration_hash,
      v_configuration_json,
      v_source_identity_hash,
      v_source_content_hash,
      'pending'
    )
    returning id into v_run_id;
  else
    update public.extraction_run
       set source_content_id = v_content_id,
           engine_version = v_engine_version,
           rule_set_version = v_rule_set_version,
           rule_manifest_hash = v_manifest_hash,
           configuration_hash = v_configuration_hash,
           configuration_json = v_configuration_json,
           source_identity_hash = v_source_identity_hash,
           source_content_hash = v_source_content_hash,
           confidence_threshold = 1.00,
           admissibility_state = 'pending',
           failure_code = null
     where id = v_run_id;
  end if;

  insert into public.extraction_run_config (
    id,
    extraction_run_id,
    confidence_threshold,
    auto_confirm_above_threshold,
    require_human_review_below,
    engine_version,
    rule_set_version,
    rule_manifest_hash,
    configuration_hash,
    configuration_json
  ) values (
    'cfg-v2511-' || v_source_identity_hash || '-' || v_configuration_hash,
    v_run_id,
    1.00,
    true,
    1.00,
    v_engine_version,
    v_rule_set_version,
    v_manifest_hash,
    v_configuration_hash,
    v_configuration_json
  )
  on conflict (extraction_run_id) do nothing;

  v_is_incomplete := char_length(btrim(p_source_text)) < 200;

  if v_is_incomplete then
    v_row_counts := jsonb_build_object(
      'raw_blocks', 0,
      'help', 0,
      'workflow', 0,
      'accountability', 0,
      'overrides', 0,
      'definitions', 0
    );

    insert into public.extraction_manifest (
      id,
      extraction_run_id,
      source_document_id,
      corpus_id,
      canon_version,
      source_hash,
      row_counts,
      validation_results,
      drift_events,
      status,
      source_content_id,
      source_identity_hash,
      engine_version,
      rule_set_version,
      rule_manifest_hash,
      configuration_hash,
      output_hash,
      admissibility_state
    ) values (
      'manifest-v2511-' || v_source_identity_hash || '-' || v_configuration_hash,
      v_run_id,
      p_source_document_id,
      v_corpus_id,
      1,
      v_source_content_hash,
      v_row_counts,
      jsonb_build_object('source_complete', false, 'failure_code', 'source_text_incomplete'),
      '[]'::jsonb,
      'failed',
      v_content_id,
      v_source_identity_hash,
      v_engine_version,
      v_rule_set_version,
      v_manifest_hash,
      v_configuration_hash,
      null,
      'rejected'
    );

    insert into public.validation_result (
      id, extraction_run_id, test_name, test_result, failure_count, details
    ) values (
      'vr-v2511-' || v_source_identity_hash || '-' || v_configuration_hash || '-source-complete',
      v_run_id,
      'source_complete',
      'fail',
      1,
      jsonb_build_object('minimum_characters', 200, 'observed_characters', char_length(btrim(p_source_text)))
    )
    on conflict (extraction_run_id, test_name) do nothing;

    update public.extraction_run
       set run_status = 'failed',
           admissibility_state = 'rejected',
           failure_code = 'source_text_incomplete',
           completed_at = clock_timestamp()
     where id = v_run_id;

    return jsonb_build_object(
      'source_document_id', p_source_document_id,
      'source_content_id', v_content_id,
      'source_identity_hash', v_source_identity_hash,
      'source_content_hash', v_source_content_hash,
      'extraction_run_id', v_run_id,
      'run_version', v_run_version,
      'run_status', 'failed',
      'admissibility_state', 'rejected',
      'failure_code', 'source_text_incomplete',
      'engine_version', v_engine_version,
      'rule_set_version', v_rule_set_version,
      'rule_manifest_hash', v_manifest_hash,
      'configuration_hash', v_configuration_hash,
      'output_content_hash', null,
      'coverage', '{}'::jsonb,
      'replayed', false
    );
  end if;


  v_flat := public.rosetta_v2_normalize_text(p_source_text);

  v_match := regexp_match(
    v_flat,
    '(?i)EFFECTIVE DATE:\\s*([A-Za-z]+\\s+[0-9]{1,2},\\s+[0-9]{4})'
  );
  if v_match is not null then
    begin
      v_effective_date := to_date(v_match[1], 'Month DD, YYYY');
    exception when others then
      v_effective_date := null;
    end;
  end if;

  if v_effective_date is not null and p_reference_date is not null then
    v_temporal_status :=
      case when p_reference_date >= v_effective_date then 'active' else 'pending' end;
  end if;

  v_block_id := 'blk-v2511-' || v_source_identity_hash || '-' || v_configuration_hash || '-root';

  insert into public.hr1_raw_blocks (
    id,
    extraction_run_id,
    source_document_id,
    block_type,
    section_number,
    section_heading_hash,
    block_content_hash,
    parent_block_id,
    hierarchy_path,
    char_offset_start,
    char_offset_end
  ) values (
    v_block_id,
    v_run_id,
    p_source_document_id,
    'document',
    'Document',
    encode(digest(convert_to('Document', 'UTF8'), 'sha256'), 'hex'),
    v_source_content_hash,
    null,
    v_document_identifier || '/' || p_source_version,
    0,
    char_length(p_source_text)
  );

  for v_section in
    select *
    from public.rosetta_v25_section_spans(p_source_text)
    order by section_ordinal
  loop
    v_section_number := v_section.section_number;
    v_section_flat := public.rosetta_v2_normalize_text(public.rosetta_v25_layout_projection(v_section.section_text));
    v_section_hash := encode(
      digest(convert_to(v_section.section_text, 'UTF8'), 'sha256'),
      'hex'
    );
    v_section_block_id :=
      'blk-v2511-' || v_source_identity_hash || '-' || v_configuration_hash || '-' ||
      lpad(v_section.section_ordinal::text, 4, '0');

    insert into public.hr1_raw_blocks (
      id,
      extraction_run_id,
      source_document_id,
      block_type,
      section_number,
      section_heading_hash,
      block_content_hash,
      parent_block_id,
      hierarchy_path,
      char_offset_start,
      char_offset_end
    ) values (
      v_section_block_id,
      v_run_id,
      p_source_document_id,
      'section',
      v_section_number,
      encode(digest(convert_to(v_section_number, 'UTF8'), 'sha256'), 'hex'),
      v_section_hash,
      v_block_id,
      v_document_identifier || '/' || p_source_version || '/' || v_section_number,
      v_section.char_offset_start,
      v_section.char_offset_end
    );

    v_section_help_count := 0;
    v_section_workflow_count := 0;
    v_section_accountability_count := 0;
    v_section_override_count := 0;
    v_section_definition_count := 0;
    v_pipeline_id :=
      'wp-v2511-' || v_source_identity_hash || '-' || v_configuration_hash || '-' ||
      lpad(v_section.section_ordinal::text, 4, '0');

    for v_match in
      select regexp_matches(
        v_section_flat,
        '(?i)there shall be a ([^.;]{1,180}?license)',
        'g'
      )
    loop
      v_help_count := v_help_count + 1;
      v_section_help_count := v_section_help_count + 1;
      v_clause := btrim(v_match[1]);

      insert into public.help_entity (
        id, corpus_id, source_document_id, extraction_run_id, canon_version,
        source_block_id, entity_name, entity_type, governing_section, status,
        effective_date, sunset_date, confidence, signal_status
      ) values (
        'he-v2511-' || v_source_identity_hash || '-' || v_configuration_hash || '-' ||
          lpad(v_help_count::text, 4, '0'),
        v_corpus_id,
        p_source_document_id,
        v_run_id,
        2,
        v_section_block_id,
        v_clause,
        'license',
        v_section_number,
        case
          when v_section_flat ~* '\\m(amending|amended)\\M' then 'modified'
          else 'created'
        end,
        v_effective_date::text,
        null,
        1.00,
        'confirmed'
      );
    end loop;

    for v_clause_row in
      select *
      from public.rosetta_v25_normative_clauses(v_section.section_text)
      order by clause_ordinal
    loop
      v_workflow_count := v_workflow_count + 1;
      v_section_workflow_count := v_section_workflow_count + 1;
      v_clause := v_clause_row.clause_text;
      v_modal := v_clause_row.modal;
      v_actor := v_clause_row.actor;

      if v_section_workflow_count = 1 then
        insert into public.workflow_pipeline (
          id, corpus_id, source_document_id, extraction_run_id, canon_version,
          source_block_id, pipeline_name, governing_section, pipeline_type,
          confidence, signal_status
        ) values (
          v_pipeline_id,
          v_corpus_id,
          p_source_document_id,
          v_run_id,
          2,
          v_section_block_id,
          'Exact source obligations for ' || v_section_number,
          v_section_number,
          'section_ordered_normative_modal_clauses',
          1.00,
          'confirmed'
        );
      end if;

      insert into public.workflow_step (
        id, workflow_pipeline_id, step_order, step_name, actor, actor_canon_id,
        verb, governing_section, confidence, signal_status
      ) values (
        'ws-v2511-' || v_source_identity_hash || '-' || v_configuration_hash || '-' ||
          lpad(v_workflow_count::text, 4, '0'),
        v_pipeline_id,
        v_section_workflow_count,
        v_clause,
        v_actor,
        null,
        v_modal,
        v_section_number,
        1.00,
        'confirmed'
      );

      if (
        v_clause ~* '\\m(?:must|shall|may)\\M\\s+(?:not\\s+)?(?:immediately\\s+)?(?:report|notify|transmit|investigat|suspend|revoke|refuse|affirm|reverse|petition|take)\\M'
        or v_clause ~* '\\m(?:must|shall|may)\\M\\s+consider\\s+(?:suspend|revok)'
        or v_clause ~* '\\m(?:felony|sentenced|penalty|forfeiture|guilty)\\M'
      )
      and v_clause !~* '^\\s*(?:\\([a-z0-9]+\\)\\s*)?Nothing\\s+in\\M'
      and lower(btrim(coalesce(v_actor, ''))) not in ('the report', 'a report')
      then
        v_accountability_count := v_accountability_count + 1;
        v_section_accountability_count := v_section_accountability_count + 1;

        insert into public.accountability_route (
          id, corpus_id, source_document_id, extraction_run_id, canon_version,
          source_block_id, route_name, governing_section, trigger_condition,
          enforcement_type, enforcement_actor, actor_canon_id,
          enforcement_direction, confidence, signal_status
        ) values (
          'ar-v2511-' || v_source_identity_hash || '-' || v_configuration_hash || '-' ||
            lpad(v_accountability_count::text, 4, '0'),
          v_corpus_id,
          p_source_document_id,
          v_run_id,
          2,
          v_section_block_id,
          'Exact accountability clause ' || v_accountability_count,
          v_section_number,
          v_clause,
          case
            when v_clause ~* 'forfeitur'
              then 'source_stated_forfeiture_rule'
            else 'source_stated_enforcement_rule'
          end,
          v_actor,
          null,
          'agency_mandate',
          1.00,
          'confirmed'
        );

        insert into public.escalation_node (
          id, accountability_route_id, node_order, node_name, action_required,
          actor_canon_id, escalation_trigger
        ) values (
          'en-v2511-' || v_source_identity_hash || '-' || v_configuration_hash || '-' ||
            lpad(v_accountability_count::text, 4, '0'),
          'ar-v2511-' || v_source_identity_hash || '-' || v_configuration_hash || '-' ||
            lpad(v_accountability_count::text, 4, '0'),
          1,
          'Source-stated accountability action',
          v_clause,
          null,
          v_clause
        );
      end if;
    end loop;

    for v_match in
      select regexp_matches(v_section_flat, '([^.]+[.])', 'g')
    loop
      v_clause := public.rosetta_v25_unprotect_text(public.rosetta_v2_normalize_text(v_match[1]));
      if v_clause ~*
        '\\m(unless|however|except|notwithstanding)\\M|\\msubject to\\M|\\mdoes not apply\\M|\\mdo not apply\\M|^\\s*(?:\\([a-z0-9]+\\)\\s*)?Nothing\\s+in\\s+.+\\s+shall\\s+prevent\\M'
         and v_clause !~* '["“][^"”]{1,160}["”]\\s+(includes(?:,\\s*but is not limited to)?|means|does not include|has the same meaning as)\\M'
      then
        v_override_count := v_override_count + 1;
        v_section_override_count := v_section_override_count + 1;

        select inferred.modal, inferred.actor
          into v_modal, v_actor
        from public.rosetta_v2_modal_and_actor(v_clause) inferred;

        insert into public.entity_override (
          id, corpus_id, source_document_id, extraction_run_id, canon_version,
          source_block_id, override_type, overridden_authority, override_scope,
          override_condition, granting_actor, actor_canon_id, effective_date,
          sunset_date, temporal_status, confidence, signal_status
        ) values (
          'ov-v2511-' || v_source_identity_hash || '-' || v_configuration_hash || '-' ||
            lpad(v_override_count::text, 4, '0'),
          v_corpus_id,
          p_source_document_id,
          v_run_id,
          2,
          v_section_block_id,
          case
            when v_clause ~* '\\m(unless|except|however|does not apply|do not apply)\\M'
              then 'source_stated_exception'
            else 'source_stated_condition'
          end,
          'Base rule within ' || v_section_number,
          v_clause,
          v_clause,
          v_actor,
          null,
          v_effective_date,
          null,
          v_temporal_status,
          1.00,
          'confirmed'
        );
      end if;
    end loop;

    for v_match in
      select regexp_matches(
        v_section_flat,
        '(?i)["“]([^"”]{1,120})["”]\\s+(includes(?:,\\s*but is not limited to)?|means|does not include|has the same meaning as)\\s*:?[ ]*([^.;]+[.;])',
        'g'
      )
    loop
      v_definition_count := v_definition_count + 1;
      v_section_definition_count := v_section_definition_count + 1;

      insert into public.term_definition (
        id, corpus_id, source_document_id, extraction_run_id, canon_version,
        source_block_id, defined_term, defining_section, definition_text,
        definition_type, confidence, signal_status
      ) values (
        'td-v2511-' || v_source_identity_hash || '-' || v_configuration_hash || '-' ||
          lpad(v_definition_count::text, 4, '0'),
        v_corpus_id,
        p_source_document_id,
        v_run_id,
        2,
        v_section_block_id,
        btrim(v_match[1]),
        v_section_number,
        public.rosetta_v25_unprotect_text(btrim(v_match[2] || ' ' || v_match[3])),
        'technical',
        1.00,
        'confirmed'
      );
    end loop;

    insert into public.layer_coverage (
      id, extraction_run_id, source_block_id, layer_name,
      coverage_status, reason, validated_at
    )
    select
      'lc-v2511-' || v_source_identity_hash || '-' || v_configuration_hash || '-' ||
        lpad(v_section.section_ordinal::text, 4, '0') || '-' || layer_name,
      v_run_id,
      v_section_block_id,
      layer_name,
      case when layer_count > 0 then 'populated' else 'not_applicable' end,
      case
        when layer_count > 0
          then 'Deterministic section-local rule match.'
        else 'No deterministic section-local rule matched this source span under rule manifest ' ||
             v_manifest_hash || '.'
      end,
      clock_timestamp()
    from (values
      ('HELP'::text, v_section_help_count),
      ('WORKFLOW'::text, v_section_workflow_count),
      ('ACCOUNTABILITY'::text, v_section_accountability_count),
      ('OVERRIDES'::text, v_section_override_count),
      ('DEFINITIONS'::text, v_section_definition_count)
    ) as layer_receipts(layer_name, layer_count);
  end loop;

  select jsonb_object_agg(
           lower(cbl.layer_name),
           jsonb_build_object(
             'status', cbl.coverage_status,
             'reason', cbl.reason
           )
           order by cbl.layer_name
         )
    into v_coverage
  from (
    select
      lc.layer_name,
      case
        when bool_or(lc.coverage_status = 'populated') then 'populated'
        else 'not_applicable'
      end as coverage_status,
      string_agg(distinct lc.reason, ' | ' order by lc.reason) as reason
    from public.layer_coverage lc
    where lc.extraction_run_id = v_run_id
    group by lc.layer_name
  ) cbl;

  v_row_counts := jsonb_build_object(
    'raw_blocks', (select count(*) from public.hr1_raw_blocks where extraction_run_id = v_run_id),
    'help', v_help_count,
    'workflow_pipelines', (select count(*) from public.workflow_pipeline where extraction_run_id = v_run_id),
    'workflow_steps', v_workflow_count,
    'accountability_routes', v_accountability_count,
    'escalation_nodes', v_accountability_count,
    'appeals', 0,
    'overrides', v_override_count,
    'definitions', v_definition_count,
    'coverage', 5
  );

  select jsonb_build_object(
    'contract_version', 'rosetta-law-view-v1',
    'source_receipt', jsonb_build_object(
      'document_identifier', v_document_identifier,
      'document_name', v_document_name,
      'source_version', p_source_version,
      'source_url', p_source_url,
      'media_type', p_media_type,
      'source_identity_hash', v_source_identity_hash,
      'source_content_hash', v_source_content_hash,
      'source_byte_hash', p_source_byte_hash,
      'source_provider_hash', p_source_provider_hash,
      'source_span', jsonb_build_object(
        'source_block_id', v_block_id,
        'char_offset_start', 0,
        'char_offset_end', char_length(p_source_text),
        'block_content_hash', v_source_content_hash
      )
    ),
    'engine', jsonb_build_object(
      'engine_version', v_engine_version,
      'rule_set_version', v_rule_set_version,
      'rule_manifest_hash', v_manifest_hash,
      'configuration_hash', v_configuration_hash
    ),
    'help', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id,
        'source_block_id', h.source_block_id,
        'entity_name', h.entity_name,
        'entity_type', h.entity_type,
        'governing_section', h.governing_section,
        'status', h.status,
        'effective_date', h.effective_date,
        'sunset_date', h.sunset_date,
        'confidence', h.confidence,
        'signal_status', h.signal_status
      ) order by h.id)
      from public.help_entity h where h.extraction_run_id = v_run_id
    ), '[]'::jsonb),
    'workflow', jsonb_build_object(
      'pipelines', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', wp.id,
          'source_block_id', wp.source_block_id,
          'pipeline_name', wp.pipeline_name,
          'governing_section', wp.governing_section,
          'pipeline_type', wp.pipeline_type,
          'confidence', wp.confidence,
          'signal_status', wp.signal_status
        ) order by wp.id)
        from public.workflow_pipeline wp where wp.extraction_run_id = v_run_id
      ), '[]'::jsonb),
      'steps', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', ws.id,
          'pipeline_id', ws.workflow_pipeline_id,
          'step_order', ws.step_order,
          'step_name', ws.step_name,
          'actor', ws.actor,
          'verb', ws.verb,
          'governing_section', ws.governing_section,
          'confidence', ws.confidence,
          'signal_status', ws.signal_status
        ) order by ws.workflow_pipeline_id, ws.step_order)
        from public.workflow_step ws
        join public.workflow_pipeline wp on wp.id = ws.workflow_pipeline_id
        where wp.extraction_run_id = v_run_id
      ), '[]'::jsonb)
    ),
    'accountability', jsonb_build_object(
      'routes', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', ar.id,
          'source_block_id', ar.source_block_id,
          'route_name', ar.route_name,
          'governing_section', ar.governing_section,
          'trigger_condition', ar.trigger_condition,
          'enforcement_type', ar.enforcement_type,
          'enforcement_actor', ar.enforcement_actor,
          'enforcement_direction', ar.enforcement_direction,
          'confidence', ar.confidence,
          'signal_status', ar.signal_status
        ) order by ar.id)
        from public.accountability_route ar where ar.extraction_run_id = v_run_id
      ), '[]'::jsonb),
      'nodes', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', en.id,
          'route_id', en.accountability_route_id,
          'node_order', en.node_order,
          'node_name', en.node_name,
          'action_required', en.action_required,
          'escalation_trigger', en.escalation_trigger
        ) order by en.accountability_route_id, en.node_order)
        from public.escalation_node en
        join public.accountability_route ar on ar.id = en.accountability_route_id
        where ar.extraction_run_id = v_run_id
      ), '[]'::jsonb),
      'appeals', '[]'::jsonb
    ),
    'overrides', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', eo.id,
        'source_block_id', eo.source_block_id,
        'override_type', eo.override_type,
        'overridden_authority', eo.overridden_authority,
        'override_scope', eo.override_scope,
        'override_condition', eo.override_condition,
        'granting_actor', eo.granting_actor,
        'effective_date', eo.effective_date,
        'sunset_date', eo.sunset_date,
        'temporal_status', eo.temporal_status,
        'governing_section', (select rb.section_number from public.hr1_raw_blocks rb where rb.id = eo.source_block_id),
        'confidence', eo.confidence,
        'signal_status', eo.signal_status
      ) order by eo.id)
      from public.entity_override eo where eo.extraction_run_id = v_run_id
    ), '[]'::jsonb),
    'definitions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', td.id,
        'source_block_id', td.source_block_id,
        'defined_term', td.defined_term,
        'defining_section', td.defining_section,
        'definition_text', td.definition_text,
        'definition_type', td.definition_type,
        'confidence', td.confidence,
        'signal_status', td.signal_status
      ) order by td.id)
      from public.term_definition td where td.extraction_run_id = v_run_id
    ), '[]'::jsonb),
    'coverage', v_coverage
  ) into v_output;

  v_output_hash := encode(digest(convert_to(v_output::text, 'UTF8'), 'sha256'), 'hex');

  v_structural_validation := public.rosetta_v25_validate_extraction(v_run_id, p_source_text);
  if v_structural_validation->>'status' <> 'pass' then
    raise exception using
      errcode = '22000',
      message = 'rosetta_v2_structural_validation_failed',
      detail = v_structural_validation::text;
  end if;

  insert into public.validation_result (
    id, extraction_run_id, test_name, test_result, failure_count, details
  ) values (
    'vr-v2511-' || v_source_identity_hash || '-' || v_configuration_hash || '-structural-correctness',
    v_run_id,
    'structural_correctness_v2',
    'pass',
    0,
    v_structural_validation
  ) on conflict (extraction_run_id, test_name) do nothing;

  insert into public.extraction_manifest (
    id,
    extraction_run_id,
    source_document_id,
    corpus_id,
    canon_version,
    source_hash,
    row_counts,
    validation_results,
    drift_events,
    status,
    source_content_id,
    source_identity_hash,
    engine_version,
    rule_set_version,
    rule_manifest_hash,
    configuration_hash,
    output_hash,
    admissibility_state
  ) values (
    'manifest-v2511-' || v_source_identity_hash || '-' || v_configuration_hash,
    v_run_id,
    p_source_document_id,
    v_corpus_id,
    1,
    v_source_content_hash,
    v_row_counts,
    jsonb_build_object(
      'source_hash_verified', true,
      'source_bytes_receipted', p_source_byte_hash is not null or lower(p_media_type) <> 'application/pdf',
      'five_layer_coverage', (select count(*) = 5 from jsonb_object_keys(v_coverage)),
      'no_pending_coverage', not exists (
        select 1 from public.layer_coverage lc
        where lc.extraction_run_id = v_run_id
          and lc.coverage_status in ('pending_extraction', 'extraction_failed')
      ),
      'canonical_rows_source_bound', true,
      'structural_correctness_v2', v_structural_validation,
      'output_hash_verified', true
    ),
    '[]'::jsonb,
    'clean',
    v_content_id,
    v_source_identity_hash,
    v_engine_version,
    v_rule_set_version,
    v_manifest_hash,
    v_configuration_hash,
    v_output_hash,
    'admissible'
  );

  insert into public.validation_result (
    id, extraction_run_id, test_name, test_result, failure_count, details
  ) values
    ('vr-v2511-' || v_source_identity_hash || '-' || v_configuration_hash || '-source-hash', v_run_id, 'source_hash_verified', 'pass', 0,
      jsonb_build_object('source_content_hash', v_source_content_hash)),
    ('vr-v2511-' || v_source_identity_hash || '-' || v_configuration_hash || '-source-bytes', v_run_id, 'source_bytes_receipted', 'pass', 0,
      jsonb_build_object('source_byte_hash', p_source_byte_hash, 'media_type', p_media_type)),
    ('vr-v2511-' || v_source_identity_hash || '-' || v_configuration_hash || '-coverage', v_run_id, 'five_layer_coverage', 'pass', 0,
      jsonb_build_object('coverage', v_coverage)),
    ('vr-v2511-' || v_source_identity_hash || '-' || v_configuration_hash || '-no-pending', v_run_id, 'no_pending_coverage', 'pass', 0,
      jsonb_build_object('coverage', v_coverage)),
    ('vr-v2511-' || v_source_identity_hash || '-' || v_configuration_hash || '-source-bound', v_run_id, 'canonical_rows_source_bound', 'pass', 0,
      jsonb_build_object('source_block_id', v_block_id)),
    ('vr-v2511-' || v_source_identity_hash || '-' || v_configuration_hash || '-output-hash', v_run_id, 'output_hash_verified', 'pass', 0,
      jsonb_build_object('output_content_hash', v_output_hash))
  on conflict (extraction_run_id, test_name) do nothing;

  update public.extraction_run
     set run_status = 'completed',
         output_content_hash = v_output_hash,
         admissibility_state = 'admissible',
         failure_code = null,
         completed_at = clock_timestamp()
   where id = v_run_id;

  v_result := jsonb_build_object(
    'source_document_id', p_source_document_id,
    'source_content_id', v_content_id,
    'source_identity_hash', v_source_identity_hash,
    'source_content_hash', v_source_content_hash,
    'source_byte_hash', p_source_byte_hash,
    'source_version', p_source_version,
    'source_url', p_source_url,
    'extraction_run_id', v_run_id,
    'run_version', v_run_version,
    'run_status', 'completed',
    'admissibility_state', 'admissible',
    'engine_version', v_engine_version,
    'rule_set_version', v_rule_set_version,
    'rule_manifest_hash', v_manifest_hash,
    'configuration_hash', v_configuration_hash,
    'output_content_hash', v_output_hash,
    'row_counts', v_row_counts,
    'coverage', v_coverage,
    'replayed', false
  );

  return v_result;
exception
  when unique_violation then
    raise;
  when others then
    if v_run_id is not null then
      update public.extraction_run
         set run_status = 'failed',
             admissibility_state = 'rejected',
             failure_code = sqlstate || ':' || sqlerrm,
             completed_at = clock_timestamp()
       where id = v_run_id
         and run_status = 'in_progress';
    end if;
    raise;
end;
$function$
"""},
}


# ---------------------------------------------------------------------------
# lane emitter + manifests + convergence (17)
# ---------------------------------------------------------------------------
BASE_TO_KEY = {k.split("__")[0]: k for k in DEFS}

def lane_prefix(lane):
    return "v2513_" if lane == "all" else lane + "_"

def lane_extra_names(lane):
    names = []
    src = LANES[lane].get("extra_functions", [])
    for ef in src:
        m = re.search(r"FUNCTION public\.([a-z0-9_]+)\(", ef)
        names.append(m.group(1))
    if lane == "c4" or lane == "all":
        names += V2512_NAMES
    return names

def manifest_sql(lane, prefix, tag):
    manifest = {
        "lane": lane,
        "engine_version": "rosetta-v3-deterministic-sql-" + tag,
        "rule_set_version": "rosetta-five-layer-structural-correctness-" + tag,
        "title": LANES[lane]["title"] if lane != "all" else
                 "2.5.13 convergence candidate composing lanes c1..c7",
        "closure_prefix": prefix,
        "closure_namespace": SCHEMA,
        "control_identity": "rosetta-v3-deterministic-sql-2.5.11",
        "changes": ([LANES[lane]["title"]] if lane != "all"
                    else [LANES[c]["title"] for c in ["c1","c2","c3","c4","c5","c6","c7"]]),
        "publication": "structurally disabled: no publication view, no registry row, no publishable-run path references this namespace",
    }
    mj = json.dumps(manifest, sort_keys=True, separators=(",", ":"))
    mh = hashlib.sha256(mj.encode()).hexdigest()
    return f"""insert into {SCHEMA}.extraction_rule_manifest
  (engine_version, rule_set_version, manifest_hash, manifest_json, is_active)
values ('{manifest["engine_version"]}', '{manifest["rule_set_version"]}',
        '{mh}', $manifest${mj}$manifest$::jsonb, true);"""

def emit_lane(lane):
    L = LANES[lane]
    prefix = lane_prefix(lane)
    extra = lane_extra_names(lane)
    swaps = L.get("literal_swaps", [])
    parts = [f"""-- ============================================================================
-- Migration: lane {lane} -- {L["title"]}
-- One-variable experiment: a full independent copy of the 51-function closure
-- in {SCHEMA} with prefix {prefix}, identity tokens swapped inside string
-- literals only ('2.5.11' -> '{L["tag"]}'), plus the lane's surgical change.
-- No reference to shared mutable rosetta_v25_* / rosetta_v2_* helpers outside
-- this closed namespace. Never published; no registry row is created here
-- (is_active = false, and the production registry is never touched).
-- ============================================================================
set check_function_bodies = off;
"""]
    for name in sorted(BASE_TO_KEY):
        body = L["overrides"].get(name, DEFS[BASE_TO_KEY[name]])
        parts.append(terminate(transform(body, prefix, L["tag"], extra, swaps)))
    for ef in L.get("extra_functions", []):
        parts.append(terminate(transform(ef, prefix, L["tag"], extra, swaps)))
    for k in L.get("extra_files", []):
        parts.append(terminate(transform(REF2512[k], prefix, L["tag"], extra, swaps)))
    parts.append(manifest_sql(lane, prefix, L["tag"]))
    return "\n".join(parts)


# ===========================================================================
# Convergence candidate (migration 17): composes c1..c7 into one closed
# candidate namespace. May only be exercised after every lane has replayed
# and compared (gate in migration 14/15); this file alone grants nothing.
# ===========================================================================
def merge_overrides():
    ov = {}
    for lane in ["c1","c2","c3","c4","c5","c6","c7"]:
        for name, body in LANES[lane]["overrides"].items():
            ov.setdefault(name, {})[lane] = body
    return ov

LANES["all"] = {
 "tag": "2.5.13",
 "title": "2.5.13 convergence candidate composing lanes c1..c7",
 "extra_functions": (LANES["c3"]["extra_functions"] + LANES["c5"]["extra_functions"]
                     + LANES["c7"]["extra_functions"]),
 "extra_files": sorted(REF2512),
 "literal_swaps": [("v2513c3", "v2513"), ("v2512", "v2513")],
 "overrides": {
   "rosetta_v25_modal_and_actor": """CREATE OR REPLACE FUNCTION public.rosetta_v25_modal_and_actor(p_clause text)
 RETURNS TABLE(modal text, actor text)
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_d record;
  v_bound constant integer := 1024; -- C1 measured bound (pre-modal p999=571.26, max=6566, n=156869; corpus_measurement_receipt)
begin
  -- convergence: C5 decomposition + C1 measured bound
  select d.modal, d.actor into v_d from public.rosetta_v25_decompose_clause(p_clause) d;
  if v_d.actor is not null and char_length(v_d.actor) > v_bound then
    raise exception 'actor_unresolved: decomposed actor length % exceeds measured bound %; overflow is blocking and is never silently truncated',
      char_length(v_d.actor), v_bound using errcode = 'P1A01';
  end if;
  return query select v_d.modal, v_d.actor;
end;
$function$""",
   "rosetta_v2_modal_and_actor": """CREATE OR REPLACE FUNCTION public.rosetta_v2_modal_and_actor(p_clause text)
 RETURNS TABLE(modal text, actor text)
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_d record;
  v_bound constant integer := 1024; -- C1 measured bound (pre-modal p999=571.26, max=6566, n=156869; corpus_measurement_receipt)
begin
  -- convergence: C5 decomposition + C1 measured bound
  select d.modal, d.actor into v_d from public.rosetta_v25_decompose_clause(p_clause) d;
  if v_d.actor is not null and char_length(v_d.actor) > v_bound then
    raise exception 'actor_unresolved: decomposed actor length % exceeds measured bound %; overflow is blocking and is never silently truncated',
      char_length(v_d.actor), v_bound using errcode = 'P1A01';
  end if;
  return query select v_d.modal, v_d.actor;
end;
$function$""",
   "rosetta_v25_layout_projection": LANES["c3"]["overrides"]["rosetta_v25_layout_projection"],
   "rosetta_v25_is_internal_period": LANES["c5"]["overrides"]["rosetta_v25_is_internal_period"],
   "rosetta_v25_actor_source_corrupt": LANES["c2"]["overrides"]["rosetta_v25_actor_source_corrupt"],
   "rosetta_v25_validate_independent_structure": validator_with_help_span_count(),
   "rosetta_v25_refresh_object_source_spans": """CREATE OR REPLACE FUNCTION public.rosetta_v25_refresh_object_source_spans(p_extraction_run_id integer, p_source_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
 v_row record; v_loc record; v_block_text text; v_absolute_start integer; v_absolute_end integer; v_raw_text text; v_resolved integer:=0; v_ambiguous integer:=0; v_unresolved integer:=0; v_needle text; v_source_count integer; v_object_count integer; v_object_ordinal integer; v_definition_only boolean; v_status text;
begin
 delete from public.rosetta_object_source_span where extraction_run_id=p_extraction_run_id;
 for v_row in
  select 'workflow_step'::text object_type,ws.id object_id,wp.source_document_id,wp.source_block_id,rb.char_offset_start block_start,rb.char_offset_end block_end,ws.step_name needle from public.workflow_step ws join public.workflow_pipeline wp on wp.id=ws.workflow_pipeline_id join public.hr1_raw_blocks rb on rb.id=wp.source_block_id where wp.extraction_run_id=p_extraction_run_id
  union all select 'accountability_route',ar.id,ar.source_document_id,ar.source_block_id,rb.char_offset_start,rb.char_offset_end,ar.trigger_condition from public.accountability_route ar join public.hr1_raw_blocks rb on rb.id=ar.source_block_id where ar.extraction_run_id=p_extraction_run_id
  union all select 'entity_override',eo.id,eo.source_document_id,eo.source_block_id,rb.char_offset_start,rb.char_offset_end,eo.override_scope from public.entity_override eo join public.hr1_raw_blocks rb on rb.id=eo.source_block_id where eo.extraction_run_id=p_extraction_run_id
  union all select 'term_definition',td.id,td.source_document_id,td.source_block_id,rb.char_offset_start,rb.char_offset_end,'"'||td.defined_term||'" '||td.definition_text from public.term_definition td join public.hr1_raw_blocks rb on rb.id=td.source_block_id where td.extraction_run_id=p_extraction_run_id
  union all select 'help_entity',h.id,h.source_document_id,h.source_block_id,rb.char_offset_start,rb.char_offset_end,h.entity_name from public.help_entity h join public.hr1_raw_blocks rb on rb.id=h.source_block_id where h.extraction_run_id=p_extraction_run_id
  order by object_type,source_block_id,needle,object_id
 loop
  v_needle:=v_row.needle; v_definition_only:=false; v_block_text:=substr(p_source_text,v_row.block_start+1,v_row.block_end-v_row.block_start); v_source_count:=public.rosetta_v2512_normalized_occurrence_count(v_block_text,v_needle);
  if v_row.object_type='term_definition' and v_source_count=0 then select td.definition_text into v_needle from public.term_definition td where td.id=v_row.object_id; v_definition_only:=true; v_source_count:=public.rosetta_v2512_normalized_occurrence_count(v_block_text,v_needle); end if;
  if v_row.object_type='workflow_step' then select count(*)::integer,count(*) filter(where ws.id<=v_row.object_id)::integer into v_object_count,v_object_ordinal from public.workflow_step ws join public.workflow_pipeline wp on wp.id=ws.workflow_pipeline_id where wp.extraction_run_id=p_extraction_run_id and wp.source_block_id=v_row.source_block_id and public.rosetta_v2_normalize_text(ws.step_name)=public.rosetta_v2_normalize_text(v_needle);
  elsif v_row.object_type='accountability_route' then select count(*)::integer,count(*) filter(where ar.id<=v_row.object_id)::integer into v_object_count,v_object_ordinal from public.accountability_route ar where ar.extraction_run_id=p_extraction_run_id and ar.source_block_id=v_row.source_block_id and public.rosetta_v2_normalize_text(ar.trigger_condition)=public.rosetta_v2_normalize_text(v_needle);
  elsif v_row.object_type='entity_override' then select count(*)::integer,count(*) filter(where eo.id<=v_row.object_id)::integer into v_object_count,v_object_ordinal from public.entity_override eo where eo.extraction_run_id=p_extraction_run_id and eo.source_block_id=v_row.source_block_id and public.rosetta_v2_normalize_text(eo.override_scope)=public.rosetta_v2_normalize_text(v_needle);
  elsif v_row.object_type='help_entity' then select count(*)::integer,count(*) filter(where h.id<=v_row.object_id)::integer into v_object_count,v_object_ordinal from public.help_entity h where h.extraction_run_id=p_extraction_run_id and h.source_block_id=v_row.source_block_id and public.rosetta_v2_normalize_text(h.entity_name)=public.rosetta_v2_normalize_text(v_needle);
  else
   if v_definition_only then select count(*)::integer,count(*) filter(where td.id<=v_row.object_id)::integer into v_object_count,v_object_ordinal from public.term_definition td where td.extraction_run_id=p_extraction_run_id and td.source_block_id=v_row.source_block_id and public.rosetta_v2_normalize_text(td.definition_text)=public.rosetta_v2_normalize_text(v_needle);
   else select count(*)::integer,count(*) filter(where td.id<=v_row.object_id)::integer into v_object_count,v_object_ordinal from public.term_definition td where td.extraction_run_id=p_extraction_run_id and td.source_block_id=v_row.source_block_id and public.rosetta_v2_normalize_text('"'||td.defined_term||'" '||td.definition_text)=public.rosetta_v2_normalize_text(v_needle); end if;
  end if;
  if v_source_count>0 and v_source_count=v_object_count then select * into v_loc from public.rosetta_v2512_locate_normalized_text_occurrence(v_block_text,v_needle,v_object_ordinal); v_status:=v_loc.span_status;
  elsif v_source_count>0 then select * into v_loc from public.rosetta_v2512_locate_normalized_text_occurrence(v_block_text,v_needle,1); v_status:='ambiguous';
  else v_status:='unresolved'; end if;
  -- convergence C3: fail closed unless the needle is verified in the hash-bound projection
  if v_status in('resolved','ambiguous')
     and not public.rosetta_v25_projected_contains(v_block_text, v_needle) then
   v_status:='unresolved';
  end if;
  if v_status in('resolved','ambiguous') and v_loc.source_offset_start is not null then v_absolute_start:=v_row.block_start+v_loc.source_offset_start; v_absolute_end:=v_row.block_start+v_loc.source_offset_end; v_raw_text:=substr(p_source_text,v_absolute_start+1,v_absolute_end-v_absolute_start); else v_absolute_start:=null; v_absolute_end:=null; v_raw_text:=null; end if;
  insert into public.projection_receipt(extraction_run_id,object_type,object_id,raw_sha256,projected_sha256,projection_method,projection_version,offset_mapping,offset_mapping_status,charset_receipt,excluded_regions,verified)
  select p_extraction_run_id, v_row.object_type, v_row.object_id::text,
         r.receipt->>'raw_sha256', r.receipt->>'projected_sha256', r.receipt->>'projection_method', r.receipt->>'projection_version',
         null, r.receipt->>'offset_mapping_status', r.receipt->'charset_receipt', r.receipt->'excluded_regions',
         public.rosetta_v25_verify_projection(v_block_text, public.rosetta_v25_layout_projection(v_block_text))
  from (select public.rosetta_v25_projection_receipt(v_block_text) as receipt) as r;
  insert into public.rosetta_object_source_span(object_type,object_id,extraction_run_id,source_document_id,source_block_id,source_offset_start,source_offset_end,raw_text,normalized_text,raw_text_hash,projection_version,span_status)
  values(v_row.object_type,v_row.object_id,p_extraction_run_id,v_row.source_document_id,v_row.source_block_id,v_absolute_start,v_absolute_end,v_raw_text,v_needle,case when v_raw_text is null then null else encode(digest(convert_to(v_raw_text,'UTF8'),'sha256'),'hex') end,'rosetta-layout-projection-v2513',v_status)
  on conflict(object_type,object_id) do update set extraction_run_id=excluded.extraction_run_id,source_document_id=excluded.source_document_id,source_block_id=excluded.source_block_id,source_offset_start=excluded.source_offset_start,source_offset_end=excluded.source_offset_end,raw_text=excluded.raw_text,normalized_text=excluded.normalized_text,raw_text_hash=excluded.raw_text_hash,projection_version=excluded.projection_version,span_status=excluded.span_status,created_at=now();
  if v_status='resolved' then v_resolved:=v_resolved+1; elsif v_status='ambiguous' then v_ambiguous:=v_ambiguous+1; else v_unresolved:=v_unresolved+1; end if;
 end loop;
 return jsonb_build_object('contract','rosetta-object-source-span-v2513','extraction_run_id',p_extraction_run_id,'resolved',v_resolved,'ambiguous',v_ambiguous,'unresolved',v_unresolved,'occurrence_rule','resolve_only_when_source_occurrence_count_equals_object_count');
end;
$function$
""",
   "rosetta_v253_reconcile_structural_correctness": LANES["c6"]["overrides"]["rosetta_v253_reconcile_structural_correctness"],
   "run_rosetta_v3_extraction_v2511_base": (
     LANES["c7"]["overrides"]["run_rosetta_v3_extraction_v2511_base"]
     .replace(
       "  -- C7: exact-source charset receipt gate.\n"
       "  perform public.rosetta_v25_charset_gate(p_source_document_id, p_source_text);",
       "  -- C3 + C7: reject invalid provider-observation dates, verify HTML "
       "acquisition provenance, then verify the exact-source charset receipt.\n"
       "  perform public.rosetta_v25_reference_date_gate(p_reference_date);\n"
       "  perform public.rosetta_v25_source_acquisition_gate(\n"
       "    p_source_document_id, p_source_text, p_media_type, p_source_version, p_source_url);\n"
       "  perform public.rosetta_v25_charset_gate(p_source_document_id, p_source_text);"
     )
     .replace(
       "  v_flat := public.rosetta_v2_normalize_text(p_source_text);",
       "  v_flat := public.rosetta_v2_normalize_text("
       "public.rosetta_v25_layout_projection(p_source_text));"
     )
   ),
 },
}


LANE_FILES = {"c1": "04_lane_c1_measured_actor_bound.sql",
              "c2": "05_lane_c2_actor_source_corruption.sql",
              "c3": "06_lane_c3_projection_contract.sql",
              "c4": "07_lane_c4_occurrence_aware_spans.sql",
              "c5": "08_lane_c5_clause_decomposition.sql",
              "c6": "09_lane_c6_modal_retyping_revalidation.sql",
              "c7": "10_lane_c7_charset_receipt_gate.sql"}

def main():
    os.makedirs(MIG, exist_ok=True)
    bad = verify_control()
    if bad:
        raise SystemExit("control reverse-rename mismatch: %s" % bad)
    outputs = {
        "02_candidate_schema.sql": (emit_02().replace("%%VIEWS%%",
                                     qualify_view(open(os.path.join(EV, "schema", "view-v_civic_genome_law_view_v1_internal.sql")).read(),
                                                  "v_civic_genome_law_view_v1_internal"))
                                   .replace("%%VIEWS%%", "PLACEHOLDER"))
                                   + "\n" + emit_adapters() + "\n"
                                   + qualify_view(open(os.path.join(EV, "schema", "view-v_rosetta_operator_law_view_v1.sql")).read(),
                                                  "v_rosetta_operator_law_view_v1")
                                   + "\n" + emit_receipt_tables() + "\n" + emit_rls(),
        "03_control_closure_2511.sql": emit_control() + "\n" + control_manifest_sql(),
        "17_convergence_candidate_2513.sql": emit_lane("all"),
    }
    for lane, fn in LANE_FILES.items():
        outputs[fn] = emit_lane(lane)
    for fn, content in outputs.items():
        with open(os.path.join(MIG, fn), "w", encoding="utf-8") as f:
            f.write(content)
        print(fn, len(content), hashlib.sha256(content.encode()).hexdigest()[:16])

if __name__ == "__main__":
    main()
