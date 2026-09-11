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
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from xml.etree import ElementTree
import zipfile

SUPPORTED_SUFFIXES = {".sql", ".json", ".jsonl", ".csv", ".xlsx", ".zip"}
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


def split_sql_statements(sql_text: str) -> list[str]:
    statements: list[str] = []
    current: list[str] = []
    in_single = False
    in_double = False
    in_line_comment = False
    in_block_comment = False
    dollar_quote: str | None = None
    i = 0

    while i < len(sql_text):
        ch = sql_text[i]
        nxt = sql_text[i + 1] if i + 1 < len(sql_text) else ""

        if in_line_comment:
            current.append(ch)
            if ch == "\n":
                in_line_comment = False
            i += 1
            continue

        if in_block_comment:
            current.append(ch)
            if ch == "*" and nxt == "/":
                current.append(nxt)
                i += 2
                in_block_comment = False
                continue
            i += 1
            continue

        if dollar_quote is not None:
            current.append(ch)
            if sql_text.startswith(dollar_quote, i):
                for _ in range(1, len(dollar_quote)):
                    current.append(sql_text[i + _])
                i += len(dollar_quote)
                dollar_quote = None
                continue
            i += 1
            continue

        if ch == "-" and nxt == "-" and not in_single and not in_double:
            current.extend([ch, nxt])
            i += 2
            in_line_comment = True
            continue

        if ch == "/" and nxt == "*" and not in_single and not in_double:
            current.extend([ch, nxt])
            i += 2
            in_block_comment = True
            continue

        if not in_single and not in_double and ch == "$":
            match = re.match(r"\$[a-zA-Z0-9_]*\$", sql_text[i:])
            if match:
                token = match.group(0)
                current.extend(token)
                i += len(token)
                dollar_quote = token
                continue

        if ch == "'" and not in_double:
            if in_single and nxt == "'":
                current.extend([ch, nxt])
                i += 2
                continue
            in_single = not in_single
            current.append(ch)
            i += 1
            continue

        if ch == '"' and not in_single:
            in_double = not in_double
            current.append(ch)
            i += 1
            continue

        if ch == ";" and not in_single and not in_double:
            statement = "".join(current).strip()
            if statement:
                statements.append(statement)
            current = []
            i += 1
            continue

        current.append(ch)
        i += 1

    tail = "".join(current).strip()
    if tail:
        statements.append(tail)

    return statements


def split_top_level(text: str, delimiter: str = ",") -> list[str]:
    pieces: list[str] = []
    current: list[str] = []
    depth_paren = 0
    depth_bracket = 0
    in_single = False
    in_double = False

    i = 0
    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""

        if ch == "'" and not in_double:
            current.append(ch)
            if in_single and nxt == "'":
                current.append(nxt)
                i += 2
                continue
            in_single = not in_single
            i += 1
            continue

        if ch == '"' and not in_single:
            in_double = not in_double
            current.append(ch)
            i += 1
            continue

        if not in_single and not in_double:
            if ch == "(":
                depth_paren += 1
            elif ch == ")":
                depth_paren = max(0, depth_paren - 1)
            elif ch == "[":
                depth_bracket += 1
            elif ch == "]":
                depth_bracket = max(0, depth_bracket - 1)
            elif ch == delimiter and depth_paren == 0 and depth_bracket == 0:
                pieces.append("".join(current).strip())
                current = []
                i += 1
                continue

        current.append(ch)
        i += 1

    last = "".join(current).strip()
    if last:
        pieces.append(last)
    return pieces


def find_top_level_keyword(text: str, keyword: str) -> int:
    lower = text.lower()
    target = keyword.lower()
    in_single = False
    in_double = False
    depth_paren = 0
    depth_bracket = 0
    i = 0
    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""

        if ch == "'" and not in_double:
            if in_single and nxt == "'":
                i += 2
                continue
            in_single = not in_single
            i += 1
            continue

        if ch == '"' and not in_single:
            in_double = not in_double
            i += 1
            continue

        if in_single or in_double:
            i += 1
            continue

        if ch == "(":
            depth_paren += 1
        elif ch == ")":
            depth_paren = max(0, depth_paren - 1)
        elif ch == "[":
            depth_bracket += 1
        elif ch == "]":
            depth_bracket = max(0, depth_bracket - 1)

        if depth_paren == 0 and depth_bracket == 0 and lower.startswith(target, i):
            return i

        i += 1
    return -1


def decode_sql_literal(token: str) -> Any:
    value = token.strip()
    if not value:
        return None

    value = re.sub(r"::[a-zA-Z0-9_\[\]\.]+$", "", value).strip()

    if value.upper() == "NULL":
        return None
    if value.upper() == "TRUE":
        return True
    if value.upper() == "FALSE":
        return False

    if value.startswith("ARRAY[") and value.endswith("]"):
        inner = value[6:-1]
        return [decode_sql_literal(piece) for piece in split_top_level(inner)]

    if value.startswith("{") and value.endswith("}"):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value

    if value.startswith("'") and value.endswith("'"):
        inner = value[1:-1].replace("''", "'")
        return inner

    if re.fullmatch(r"-?\d+", value):
        return int(value)
    if re.fullmatch(r"-?\d+\.\d+", value):
        return float(value)

    return value


def parse_insert_rows(statement: str) -> list[tuple[str, dict[str, Any]]]:
    match = re.match(
        r"^insert\s+into\s+(?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+)\s*\((.*?)\)\s*values\s*(.+)$",
        statement.strip(),
        flags=re.IGNORECASE | re.DOTALL,
    )
    if not match:
        return []

    table = match.group(1)
    columns = [piece.strip().strip('"') for piece in split_top_level(match.group(2))]
    values_part = match.group(3).strip()

    conflict_idx = find_top_level_keyword(values_part, "on conflict")
    if conflict_idx >= 0:
        values_part = values_part[:conflict_idx].strip()

    rows: list[tuple[str, dict[str, Any]]] = []
    depth = 0
    start: int | None = None
    in_single = False
    in_double = False

    for i, ch in enumerate(values_part):
        nxt = values_part[i + 1] if i + 1 < len(values_part) else ""
        if ch == "'" and not in_double:
            if in_single and nxt == "'":
                continue
            in_single = not in_single
        elif ch == '"' and not in_single:
            in_double = not in_double

        if in_single or in_double:
            continue

        if ch == "(":
            if depth == 0:
                start = i + 1
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0 and start is not None:
                row_text = values_part[start:i]
                raw_values = split_top_level(row_text)
                row = {
                    columns[idx]: decode_sql_literal(raw_values[idx]) if idx < len(raw_values) else None
                    for idx in range(len(columns))
                }
                rows.append((table, row))
                start = None

    return rows


def parse_sql_records(source_name: str, raw: bytes) -> list[tuple[str, dict[str, Any]]]:
    text = raw.decode("utf-8", errors="replace")
    output: list[tuple[str, dict[str, Any]]] = []
    for statement in split_sql_statements(text):
        output.extend(parse_insert_rows(statement))
    if not output:
        stem = slugify_identifier(Path(source_name).stem)
        output.append((stem, {"raw_sql": text.strip()}))
    return output


def parse_csv_records(raw: bytes) -> list[dict[str, Any]]:
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8", errors="replace")))
    return [dict(row) for row in reader]


def parse_json_records(source_name: str, raw: bytes) -> list[tuple[str, dict[str, Any]]]:
    payload = json.loads(raw.decode("utf-8", errors="replace"))
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
            return records
        return [(stem, normalize_record(payload))]

    return [(stem, {"value": payload})]


def parse_jsonl_records(source_name: str, raw: bytes) -> list[tuple[str, dict[str, Any]]]:
    stem = slugify_identifier(Path(source_name).stem)
    output: list[tuple[str, dict[str, Any]]] = []
    for line in raw.decode("utf-8", errors="replace").splitlines():
        if not line.strip():
            continue
        output.append((stem, normalize_record(json.loads(line))))
    return output


def parse_xlsx_records(source_name: str, raw: bytes) -> list[tuple[str, dict[str, Any]]]:
    namespace = {
        "ns": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
        "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
    }
    stem = slugify_identifier(Path(source_name).stem)

    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            shared_root = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
            for si in shared_root.findall("ns:si", namespace):
                text_parts = [t.text or "" for t in si.findall(".//ns:t", namespace)]
                shared_strings.append("".join(text_parts))

        workbook = ElementTree.fromstring(archive.read("xl/workbook.xml"))
        rel_root = ElementTree.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        rel_map = {
            rel.attrib.get("Id"): rel.attrib.get("Target")
            for rel in rel_root.findall("rel:Relationship", namespace)
        }

        output: list[tuple[str, dict[str, Any]]] = []

        for sheet in workbook.findall("ns:sheets/ns:sheet", namespace):
            sheet_name = sheet.attrib.get("name", "Sheet")
            rel_id = sheet.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
            target = rel_map.get(rel_id)
            if not target:
                continue
            sheet_path = f"xl/{target}" if not target.startswith("xl/") else target
            sheet_root = ElementTree.fromstring(archive.read(sheet_path))

            rows: list[list[str]] = []
            for row in sheet_root.findall("ns:sheetData/ns:row", namespace):
                parsed_cells: dict[int, str] = {}
                for cell in row.findall("ns:c", namespace):
                    ref = cell.attrib.get("r", "A1")
                    col_letters = re.sub(r"\d", "", ref)
                    col_idx = column_index(col_letters)
                    value_node = cell.find("ns:v", namespace)
                    raw_value = value_node.text if value_node is not None else ""
                    if cell.attrib.get("t") == "s" and raw_value.isdigit():
                        idx = int(raw_value)
                        parsed_cells[col_idx] = shared_strings[idx] if idx < len(shared_strings) else ""
                    else:
                        parsed_cells[col_idx] = raw_value

                max_col = max(parsed_cells.keys(), default=-1)
                rows.append([parsed_cells.get(col, "") for col in range(max_col + 1)])

            if not rows:
                continue

            headers = [slugify_identifier(col or f"col_{idx + 1}") for idx, col in enumerate(rows[0])]
            table = f"{stem}__{slugify_identifier(sheet_name)}"
            for row in rows[1:]:
                record = {headers[idx]: row[idx] if idx < len(row) else "" for idx in range(len(headers))}
                if any((value or "").strip() for value in record.values()):
                    output.append((table, record))

        return output


def column_index(col: str) -> int:
    value = 0
    for ch in col:
        value = value * 26 + (ord(ch.upper()) - 64)
    return max(0, value - 1)


def normalize_record(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    return {"value": value}


def read_loose_records(source_name: str, raw: bytes) -> list[tuple[str, dict[str, Any]]]:
    suffix = Path(source_name).suffix.lower()
    if suffix == ".sql":
        return parse_sql_records(source_name, raw)
    if suffix == ".json":
        return parse_json_records(source_name, raw)
    if suffix == ".jsonl":
        return parse_jsonl_records(source_name, raw)
    if suffix == ".csv":
        rows = parse_csv_records(raw)
        table = slugify_identifier(Path(source_name).stem)
        return [(table, row) for row in rows]
    if suffix == ".xlsx":
        return parse_xlsx_records(source_name, raw)
    return []


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
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
          count(rc.id) as correlated_records,
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
            continue
        if root.is_file() and root.suffix.lower() in SUPPORTED_SUFFIXES:
            files.append(root)
            continue
        if root.is_dir():
            for candidate in root.rglob("*"):
                if candidate.is_file() and candidate.suffix.lower() in SUPPORTED_SUFFIXES:
                    files.append(candidate)
    return sorted(set(files))


def process_zip_members(conn: sqlite3.Connection, archive_path: Path) -> None:
    raw_archive = archive_path.read_bytes()
    process_source(conn, archive_path.as_posix(), archive_path.as_posix(), raw_archive)
    with zipfile.ZipFile(io.BytesIO(raw_archive)) as archive:
        for member in archive.infolist():
            if member.is_dir():
                continue
            member_suffix = Path(member.filename).suffix.lower()
            if member_suffix not in SUPPORTED_SUFFIXES - {".zip"}:
                continue
            virtual_path = f"{archive_path.as_posix()}::{member.filename}"
            process_source(conn, virtual_path, archive_path.as_posix(), archive.read(member.filename))


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
    print(f"uncovered_routes={uncovered_routes}")
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
    output_path.parent.mkdir(parents=True, exist_ok=True)

    spine_path = Path(args.spine_db).resolve() if args.spine_db else None
    if output_path.exists():
        output_path.unlink()

    if spine_path and spine_path.exists():
        shutil.copy2(spine_path, output_path)

    conn = sqlite3.connect(output_path)
    try:
        ensure_schema(conn)
        input_paths = [Path(path).resolve() for path in args.inputs]
        files = collect_input_files(input_paths)

        for path in files:
            if path.suffix.lower() == ".zip":
                process_zip_members(conn, path)
            else:
                process_source(conn, path.as_posix(), path.as_posix(), path.read_bytes())

        conn.commit()
        print_summary(conn)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
