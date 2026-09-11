#!/usr/bin/env python3
"""Compile the recovered SAIS seed into bounded, conflict-checked transactions.

Requires pglast==7.7. No database connection and no source SQL execution.
The locked source SHA identifies this recovery; unsupported expressions fail.
Generated transactions preserve existing rows and compare immutable fields on
both sides of each INSERT. Publication and legal verification are separate.
"""
import argparse
import hashlib
import json
from collections import OrderedDict
from pathlib import Path

from pglast import ast, parse_sql

SEED_SHA256 = "50280f17266285322ef3a6e7491bff5fc0afbffab950f666e49fede6e4c7c44e"
RUN_ID = "77407ee8-b9da-554e-8194-617378e7a7ef"
EXPECTED = OrderedDict(import_run=1, source_document=26, resource_candidate=192,
                       routing_item=260, deadline_field=656, overlap_candidate=19)
KEYS = dict(import_run="run_id", source_document="document_id",
            resource_candidate="candidate_id", routing_item="routing_id",
            deadline_field="deadline_id", overlap_candidate="overlap_id")
MUTABLE = {"import_run": {"status"},
           "resource_candidate": {"match_status", "promotion_status"},
           "overlap_candidate": {"review_state"}}


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def literal(node):
    if isinstance(node, ast.TypeCast):
        value = literal(node.arg)
        names = [n.sval for n in node.typeName.names]
        if names[-1] in ("json", "jsonb"):
            return json.loads(value) if value is not None else None
        if names[-1] not in ("text", "uuid", "date", "int4", "int8", "bool"):
            raise ValueError(f"Unsupported source cast: {names}")
        return value
    if isinstance(node, ast.A_ArrayExpr):
        return [literal(item) for item in node.elements or ()]
    if isinstance(node, ast.A_Const):
        if node.isnull:
            return None
        for typ, attr in ((ast.String, "sval"), (ast.Integer, "ival"), (ast.Boolean, "boolval")):
            if isinstance(node.val, typ):
                return getattr(node.val, attr)
    raise ValueError(f"Unsupported source expression: {type(node).__name__}")


def parse_seed(data):
    if hashlib.sha256(data).hexdigest() != SEED_SHA256:
        raise ValueError("Seed bytes do not match the inspected recovery source")
    grouped = OrderedDict((table, {"columns": None, "rows": []}) for table in EXPECTED)
    for raw in parse_sql(data.decode("utf-8")):
        stmt = raw.stmt
        # The original transaction wrapper and status update are not executed.
        # The exact source hash above pins their contents as well.
        if isinstance(stmt, (ast.TransactionStmt, ast.UpdateStmt)):
            continue
        if not isinstance(stmt, ast.InsertStmt):
            raise ValueError(f"Not a seed INSERT: {type(stmt).__name__}")
        table = stmt.relation.relname
        if stmt.relation.schemaname != "sais_import" or table not in EXPECTED:
            raise ValueError("Seed writes outside the recovered SAIS source schema")
        cols = [c.name for c in stmt.cols]
        if len(cols) != len(set(cols)):
            raise ValueError("Duplicate source columns")
        group = grouped[table]
        if group["columns"] is not None and group["columns"] != cols:
            raise ValueError("Inconsistent column order; no positional concatenation allowed")
        group["columns"] = cols
        if not stmt.selectStmt.valuesLists:
            raise ValueError("Only literal VALUES are supported")
        for values in stmt.selectStmt.valuesLists:
            if len(values) != len(cols):
                raise ValueError("Source row width mismatch")
            row = dict(zip(cols, map(literal, values), strict=True))
            if row["run_id"] != RUN_ID:
                raise ValueError("Unexpected import run")
            group["rows"].append(row)
    for table, group in grouped.items():
        if len(group["rows"]) != EXPECTED[table]:
            raise ValueError(f"Source count mismatch: {table}")
        keys = [row[KEYS[table]] for row in group["rows"]]
        if len(set(keys)) != len(keys):
            raise ValueError(f"Duplicate source primary keys: {table}")
    return grouped


def quote(value):
    return "'" + value.replace("'", "''") + "'"


def compile_batch(table, columns, rows):
    relation = f'sais_import."{table}"'
    pk = f'"{KEYS[table]}"'
    immutable = [c for c in columns if c not in MUTABLE.get(table, set())]
    expected = f"select * from jsonb_populate_recordset(null::{relation}, {quote(canonical(rows))}::jsonb)"
    def row(alias):
        return "row(" + ",".join(f'{alias}."{c}"' for c in immutable) + ")"
    conflict = f"{row('a')} is distinct from {row('e')}"
    preflight = f"""with expected as ({expected})
select {quote(table)} as table_name, count(*)::int as expected_rows,
 count(a.{pk})::int as existing_rows,
 count(*) filter(where a.{pk} is null)::int as missing_rows,
 count(*) filter(where a.{pk} is not null and {conflict})::int as conflicting_rows
from expected e left join {relation} a on a.{pk}=e.{pk};
"""
    col_sql = ",".join(f'"{c}"' for c in columns)
    body = f"""begin;
set local statement_timeout='30s';
set local lock_timeout='5s';
lock table {relation} in share row exclusive mode;
do $sais_reconcile$
begin
 if exists(with expected as ({expected})
   select 1 from expected e join {relation} a on a.{pk}=e.{pk} where {conflict}) then
   raise exception 'SAIS source conflict in {table}; existing row preserved';
 end if;
 insert into {relation} ({col_sql}) select {col_sql} from ({expected}) e
 on conflict ({pk}) do nothing;
 if exists(with expected as ({expected})
   select 1 from expected e left join {relation} a on a.{pk}=e.{pk}
   where a.{pk} is null or {conflict}) then
   raise exception 'SAIS source readback failed in {table}';
 end if;
end
$sais_reconcile$;
commit;
{preflight}"""
    if "$sais_reconcile$" in canonical(rows):
        raise ValueError("Source contains transaction delimiter")
    return preflight, body


def batches(rows, max_bytes):
    batch, size = [], 0
    for row in rows:
        length = len(canonical(row).encode("utf-8"))
        if batch and size + length > max_bytes:
            yield batch
            batch, size = [], 0
        batch.append(row)
        size += length
    if batch:
        yield batch


def compile_recovery(seed, output):
    grouped = parse_seed(seed.read_bytes())
    output.mkdir(parents=True, exist_ok=False)
    manifest = {"source_sha256": SEED_SHA256, "run_id": RUN_ID,
                "source_counts": EXPECTED, "batches": [], "canonical_promotion": False}
    for table, group in grouped.items():
        for batch in batches(group["rows"], 28_000):
            index = len(manifest["batches"])
            name = f"{index:03d}-{table}"
            preflight, apply = compile_batch(table, group["columns"], batch)
            (output / f"{name}.preflight.sql").write_text(preflight)
            (output / f"{name}.apply.sql").write_text(apply)
            manifest["batches"].append({"name": name, "table": table, "rows": len(batch),
                "apply_sha256": hashlib.sha256(apply.encode()).hexdigest()})
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    result = compile_recovery(args.seed, args.out)
    print(json.dumps({"source_counts": result["source_counts"], "batches": len(result["batches"])}))
