#!/usr/bin/env python3
"""Build a reproducible seed registry database from mixed corpus sources."""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import shutil
import os
import tempfile
from seed_source_parsers import parse_sql_rows, parse_workbook
from seed_document_adapter import parse_document_source
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from xml.etree import ElementTree
import zipfile

SUPPORTED_SUFFIXES = {".docx", ".md", ".txt", ".html", ".mjs", "", ".sql", ".json", ".jsonl", ".ndjson", ".csv", ".xlsx", ".zip"}
DEFAULT_ROUTE = "/architecture-map"

ROUTE_KEYWORDS: list[tuple[str, str, str]] = [
    ("legal", "/legal-library", "Legal authorities and doctrine"),
    ("case law", "/legal-library", "Case law analysis"),
    ("enforcement", "/enforcement-pathway", "Enforcement pathways"),
    ("intake", "/intake", "Intake and triage"),
    ("weak joint", "/diagnostics", "Weak joints and diagnostics"),
    ("resource", "/resources", "Resource directory"),
    ("workflow", "/investigation-workflow", "Workflow and accountability"),
    ("signal", "/signal-registry", "Signal registry"),
    ("advocacy", "/mission-control/governance", "Advocacy intelligence"),
    ("coalition", "/mission-control/governance", "Coalition intelligence"),
    ("legislator", "/mission-control/governance", "Legislator intelligence"),
    ("agenc", "/mission-control/governance", "Agency intelligence"),
    ("target", "/mission-control/governance", "Advocacy targets"),
    ("media", "/mission-control/governance", "Media intelligence"),
    ("campaign", "/mission-control/governance", "Campaign intelligence"),
]

FAMILY_HINTS: list[tuple[str, str]] = [
    ("case_law", "case_law"),
    ("legal", "legal"),
    ("enforcement", "enforcement"),
    ("intake", "intake"),
    ("weak", "weak_joints"),
    ("resource", "resources"),
    ("workflow", "workflows"),
    ("signal", "signals"),
    ("advocacy", "advocacy"),
    ("coalition", "coalition"),
    ("legislator", "legislators"),
    ("agenc", "agencies"),
    ("target", "targets"),
    ("media", "media"),
    ("campaign", "campaigns"),
]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def slugify_identifier(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")
    return slug or "unnamed"


def detect_family(*hints: str) -> str:
    lower = " ".join(hints).lower()
    for needle, family in FAMILY_HINTS:
        if needle in lower:
            return family
    return "uncategorized"


def parse_sql_records(source_name: str, raw: bytes) -> list[tuple[str, dict[str, Any]]]:
    return parse_sql_rows(raw)


def parse_csv_records(raw: bytes) -> list[dict[str, Any]]:
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")), strict=True)
    rows = [dict(row) for row in reader]
    if not reader.fieldnames or len(set(reader.fieldnames)) != len(reader.fieldnames):
        raise ValueError("missing or duplicate CSV headers")
    if any(None in row or None in row.values() for row in rows):
        raise ValueError("CSV column/value cardinality mismatch")
    return rows


def parse_json_records(source_name: str, raw: bytes) -> list[tuple[str, dict[str, Any]]]:
    payload = json.loads(raw.decode("utf-8-sig"))
    stem = slugify_identifier(Path(source_name).stem)

    if isinstance(payload, list):
        return [(stem, normalize_record(item)) for item in payload]

    if isinstance(payload, dict):
        records: list[tuple[str, dict[str, Any]]] = []
        exploded = False
        for key, value in payload.items():
            if isinstance(value, list):
                exploded = True
                table_name = f"{stem}__{slugify_identifier(key)}"
                records.extend((table_name, normalize_record(item)) for item in value)
        if exploded:
            metadata = {key: value for key, value in payload.items() if not isinstance(value, list)}
            if metadata:
                records.append((f"{stem}__source_metadata", {"values": metadata, "__source__": {"row_role": "metadata"}}))
            return records
        return [(stem, normalize_record(payload))]

    return [(stem, {"value": payload})]


def parse_jsonl_records(source_name: str, raw: bytes) -> list[tuple[str, dict[str, Any]]]:
    stem = slugify_identifier(Path(source_name).stem)
    output: list[tuple[str, dict[str, Any]]] = []
    for line in raw.decode("utf-8-sig").splitlines():
        if not line.strip():
            continue
        output.append((stem, normalize_record(json.loads(line))))
    return output


def parse_xlsx_records(source_name: str, raw: bytes) -> list[tuple[str, dict[str, Any]]]:
    records, _ = parse_workbook(raw)
    stem = slugify_identifier(Path(source_name).stem)
    return [(f"{stem}__{slugify_identifier(sheet)}", record) for sheet, record in records]


def normalize_record(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    return {"value": value}


def read_loose_records(source_name: str, raw: bytes) -> list[tuple[str, dict[str, Any]]]:
    suffix = Path(source_name).suffix.lower()
    if suffix in {'.docx', '.md', '.txt', '.html', '.mjs', ''}:
        parsed = parse_document_source(source_name, raw)
        observations = [(row['source_kind'], row) for row in parsed['observations']]
        observations.append(('source_receipt', {'source_sha256': parsed['source_sha256'],
            'publication_state': parsed['publication_state'], 'holds': parsed['holds'], 'parts': parsed['parts']}))
        return observations
    if suffix == ".sql":
        return parse_sql_records(source_name, raw)
    if suffix == ".json":
        return parse_json_records(source_name, raw)
    if suffix in {".jsonl", ".ndjson"}:
        return parse_jsonl_records(source_name, raw)
    if suffix == ".csv":
        rows = parse_csv_records(raw)
        table = slugify_identifier(Path(source_name).stem)
        return [(table, row) for row in rows]
    if suffix == ".xlsx":
        return parse_xlsx_records(source_name, raw)
    if suffix == ".zip":
        return []  # Container has its own receipt; members are handled separately.
    raise ValueError(f"unsupported source format: {source_name}")


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        create table if not exists worksheet_receipt (
          asset_sha256 text not null, sheet_name text not null, counts_json text not null,
          primary key(asset_sha256, sheet_name)
        );
        create table if not exists source_manifest (
          id integer primary key,
          source_path text not null,
          logical_source text not null,
          source_type text not null,
          table_name text,
          family text not null,
          sha256 text not null,
          row_count integer not null default 0,
          is_duplicate integer not null default 0,
          duplicate_of text,
          ingested_at text not null
        );

        create table if not exists data_asset (
          asset_sha256 text primary key,
          source_path text not null,
          source_type text not null,
          family text not null,
          byte_size integer not null,
          created_at text not null
        );

        create table if not exists roots_route (
          route_path text primary key,
          description text not null
        );

        create table if not exists correlation_keyword (
          keyword text primary key,
          route_path text not null references roots_route(route_path)
        );

        create table if not exists registry_record (
          id integer primary key,
          table_name text not null,
          family text not null,
          payload_json text not null,
          record_sha256 text not null,
          asset_sha256 text not null references data_asset(asset_sha256),
          source_path text not null
        );

        create table if not exists record_correlation (
          id integer primary key,
          record_id integer not null references registry_record(id) on delete cascade,
          route_path text not null references roots_route(route_path),
          keyword text not null,
          family text not null
        );

        create index if not exists idx_registry_record_table on registry_record(table_name);
        create index if not exists idx_record_correlation_route on record_correlation(route_path);

        drop view if exists v_table_index;
        create view v_table_index as
        select
          table_name,
          family,
          count(*) as row_count,
          count(distinct asset_sha256) as asset_count
        from registry_record
        group by table_name, family
        order by row_count desc, table_name;

        drop view if exists v_registry_coverage;
        create view v_registry_coverage as
        select
          rr.route_path,
          rr.description,
          count(distinct rc.record_id) as correlated_records,
          'keyword_hint' as measurement_kind,
          0 as runtime_integration_verified,
          case when count(rc.id) > 0 then 1 else 0 end as is_covered,
          coalesce(group_concat(distinct rc.family), '') as covered_families
        from roots_route rr
        left join record_correlation rc on rc.route_path = rr.route_path
        group by rr.route_path, rr.description
        order by rr.route_path;
        """
    )

    conn.executemany(
        "insert or ignore into roots_route(route_path, description) values (?, ?)",
        sorted({(route, description) for _, route, description in ROUTE_KEYWORDS} | {(DEFAULT_ROUTE, "General registry routing")}),
    )
    conn.executemany(
        "insert or ignore into correlation_keyword(keyword, route_path) values (?, ?)",
        [(keyword, route) for keyword, route, _ in ROUTE_KEYWORDS],
    )
    conn.commit()


def correlated_routes(table_name: str, source_name: str, record: dict[str, Any]) -> list[tuple[str, str]]:
    blob = f"{table_name} {source_name} {json.dumps(record, sort_keys=True, ensure_ascii=False)}".lower()
    matches: list[tuple[str, str]] = []
    for keyword, route, _ in ROUTE_KEYWORDS:
        if keyword in blob:
            matches.append((route, keyword))
    if not matches:
        return [(DEFAULT_ROUTE, "default")]
    deduped: list[tuple[str, str]] = []
    seen: set[str] = set()
    for route, keyword in matches:
        key = f"{route}:{keyword}"
        if key in seen:
            continue
        seen.add(key)
        deduped.append((route, keyword))
    return deduped


def manifest_source(
    conn: sqlite3.Connection,
    *,
    source_path: str,
    logical_source: str,
    source_type: str,
    table_name: str | None,
    family: str,
    sha256_value: str,
    row_count: int,
    is_duplicate: int,
    duplicate_of: str | None,
) -> None:
    conn.execute(
        """
        insert into source_manifest(
          source_path, logical_source, source_type, table_name, family,
          sha256, row_count, is_duplicate, duplicate_of, ingested_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            source_path,
            logical_source,
            source_type,
            table_name,
            family,
            sha256_value,
            row_count,
            is_duplicate,
            duplicate_of,
            now_iso(),
        ),
    )


def process_source(conn: sqlite3.Connection, source_path: str, logical_source: str, raw: bytes) -> None:
    suffix = Path(source_path).suffix.lower()
    digest = hashlib.sha256(raw).hexdigest()

    existing = conn.execute(
        "select sha256 from source_manifest where sha256 = ? and is_duplicate = 0 limit 1",
        (digest,),
    ).fetchone()

    base_family = detect_family(source_path, logical_source)

    if existing:
        manifest_source(
            conn,
            source_path=source_path,
            logical_source=logical_source,
            source_type=suffix.lstrip("."),
            table_name=None,
            family=base_family,
            sha256_value=digest,
            row_count=0,
            is_duplicate=1,
            duplicate_of=existing[0],
        )
        return

    if suffix == ".xlsx":
        worksheet_records, sheet_receipts = parse_workbook(raw)
        stem = slugify_identifier(Path(source_path).stem)
        records = [(f"{stem}__{slugify_identifier(sheet)}", record) for sheet, record in worksheet_records]
        conn.executemany("insert into worksheet_receipt values (?, ?, ?)", [(digest, sheet["sheet"], json.dumps(sheet, sort_keys=True)) for sheet in sheet_receipts])
    else:
        records = read_loose_records(source_path, raw)
    row_total = 0
    families_seen: set[str] = set()
    tables_seen: set[str] = set()

    conn.execute(
        "insert or replace into data_asset(asset_sha256, source_path, source_type, family, byte_size, created_at) values (?, ?, ?, ?, ?, ?)",
        (digest, source_path, suffix.lstrip("."), base_family, len(raw), now_iso()),
    )

    for table_name, record in records:
        row_total += 1
        table_family = detect_family(table_name, source_path, logical_source)
        families_seen.add(table_family)
        tables_seen.add(table_name)
        payload_json = json.dumps(record, ensure_ascii=False, sort_keys=True)
        record_sha = hashlib.sha256(payload_json.encode("utf-8")).hexdigest()
        cursor = conn.execute(
            "insert into registry_record(table_name, family, payload_json, record_sha256, asset_sha256, source_path) values (?, ?, ?, ?, ?, ?)",
            (table_name, table_family, payload_json, record_sha, digest, source_path),
        )
        record_id = int(cursor.lastrowid)
        for route, keyword in correlated_routes(table_name, source_path, record):
            conn.execute(
                "insert into record_correlation(record_id, route_path, keyword, family) values (?, ?, ?, ?)",
                (record_id, route, keyword, table_family),
            )

    family = ",".join(sorted(families_seen)) if families_seen else base_family
    table_hint = ",".join(sorted(tables_seen)) if tables_seen else None
    if table_hint and len(table_hint) > 200:
        table_hint = "multiple"

    manifest_source(
        conn,
        source_path=source_path,
        logical_source=logical_source,
        source_type=suffix.lstrip("."),
        table_name=table_hint,
        family=family,
        sha256_value=digest,
        row_count=row_total,
        is_duplicate=0,
        duplicate_of=None,
    )


def collect_input_files(paths: list[Path]) -> list[Path]:
    files: list[Path] = []
    for root in paths:
        if not root.exists():
            raise FileNotFoundError(f"missing input: {root}")
        if root.is_file():
            if root.suffix.lower() not in SUPPORTED_SUFFIXES:
                raise ValueError(f"unsupported input: {root}")
            files.append(root)
            continue
        if root.is_dir():
            for candidate in root.rglob("*"):
                if candidate.is_file():
                    if candidate.suffix.lower() not in SUPPORTED_SUFFIXES:
                        raise ValueError(f"unsupported input: {candidate}")
                    files.append(candidate)
    if not files:
        raise ValueError("no input sources found")
    return sorted(set(files))


def process_zip_members(conn: sqlite3.Connection, archive_path: Path) -> None:
    raw_archive = archive_path.read_bytes()
    process_source(conn, archive_path.as_posix(), archive_path.as_posix(), raw_archive)
    with zipfile.ZipFile(io.BytesIO(raw_archive)) as archive:
        names = [member.filename for member in archive.infolist() if not member.is_dir()]
        if len(set(names)) != len(names):
            raise ValueError(f"duplicate ZIP member name: {archive_path}")
        for member in archive.infolist():
            if member.is_dir():
                continue
            member_suffix = Path(member.filename).suffix.lower()
            if member_suffix not in SUPPORTED_SUFFIXES - {".zip"}:
                raise ValueError(f"unsupported ZIP member: {archive_path}::{member.filename}")
            virtual_path = f"{archive_path.as_posix()}::{member.filename}"
            process_source(conn, virtual_path, archive_path.as_posix(), archive.read(member))


def print_summary(conn: sqlite3.Connection) -> None:
    table_count = conn.execute("select count(distinct table_name) from registry_record").fetchone()[0]
    row_count = conn.execute("select count(*) from registry_record").fetchone()[0]
    orphan_assets = conn.execute(
        """
        select count(*)
        from data_asset d
        left join registry_record r on r.asset_sha256 = d.asset_sha256
        where r.id is null
        """
    ).fetchone()[0]
    uncovered_routes = conn.execute(
        "select count(*) from v_registry_coverage where is_covered = 0"
    ).fetchone()[0]

    print("REGISTRY VERIFICATION SUMMARY")
    print(f"tables={table_count}")
    print(f"rows={row_count}")
    print(f"orphans={orphan_assets}")
    print(f"uncovered_route_hints={uncovered_routes}")
    print("runtime_integration_verified=false")
    print("top_tables=")
    for table_name, count in conn.execute(
        "select table_name, count(*) as c from registry_record group by table_name order by c desc, table_name limit 10"
    ):
        print(f"  - {table_name}: {count}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--spine-db",
        default="",
        help="Optional SQLite spine database file to copy before loading data.",
    )
    parser.add_argument(
        "--output-db",
        required=True,
        help="Output SQLite database path.",
    )
    parser.add_argument(
        "--inputs",
        nargs="*",
        default=["supabase/migrations", "supabase/migration_sources", "data"],
        help="Directories/files containing seed corpus files.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output_path = Path(args.output_db).resolve()
    input_paths = [Path(path).resolve() for path in args.inputs]
    failure_path = output_path.with_suffix(output_path.suffix + ".failure.json")
    for root in input_paths:
        for result_path in [output_path, failure_path]:
            if result_path == root or root.is_dir() and result_path.is_relative_to(root):
                raise ValueError("output and failure receipt must be outside preserved inputs")
    output_path.parent.mkdir(parents=True, exist_ok=True)

    spine_path = Path(args.spine_db).resolve() if args.spine_db else None
    if spine_path and (not spine_path.is_file() or spine_path in {output_path, failure_path}):
        raise ValueError("spine must exist and differ from output")
    descriptor, temporary_name = tempfile.mkstemp(dir=output_path.parent, suffix=".sqlite3")
    os.close(descriptor)
    temporary_path = Path(temporary_name)
    if spine_path:
        shutil.copy2(spine_path, temporary_path)
    conn = sqlite3.connect(temporary_path)
    try:
        ensure_schema(conn)
        files = collect_input_files(input_paths)
        for path in files:
            if path.suffix.lower() == ".zip":
                process_zip_members(conn, path)
            else:
                process_source(conn, path.as_posix(), path.as_posix(), path.read_bytes())

        conn.commit()
        print_summary(conn)
    except Exception as error:
        conn.close()
        temporary_path.unlink(missing_ok=True)
        failure_path.write_text(json.dumps({"status": "failed", "error_type": type(error).__name__,
          "error": str(error), "output_replaced": False, "runtime_integration_verified": False}, indent=2))
        raise
    else:
        conn.close()
        os.replace(temporary_path, output_path)


if __name__ == "__main__":
    main()
