#!/usr/bin/env python3
"""Build the authoritative advocacy/reform intelligence SQL import lane."""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
from pathlib import Path
from typing import Any
import zipfile

from build_registry import parse_sql_records, slugify_identifier

EXPECTED_SOURCES = [
    "sais_escalation_advocacy_registry.json",
    "legal_case_law_priority1.json",
    "20260417095403_023_seed_legislators_agencies_coalitions.sql",
    "lighthouse_legislators_complete(2).zip",
    "coalition_agencies_import_snake_case.json",
    "coalition_advocacy_orgs_import_snake_case.json",
    "advocacy_organizations_import_snake_case.json",
    "advocacy_targets_import_snake_case.json",
    "coalition_intelligence_complete.REPAIRED.json",
]


def sql_literal(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, list):
        return "ARRAY[" + ", ".join(sql_literal(item) for item in value) + "]"
    if isinstance(value, dict):
        return "'" + json.dumps(value, ensure_ascii=False).replace("'", "''") + "'::jsonb"
    return "'" + str(value).replace("'", "''") + "'"


def normalize_record(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    return {"value": value}


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def read_json_records(path: Path) -> list[dict[str, Any]]:
    payload = read_json(path)
    if isinstance(payload, list):
        return [normalize_record(item) for item in payload]
    if isinstance(payload, dict):
        return [normalize_record(payload)]
    return [{"value": payload}]


def read_csv_records(raw: bytes) -> list[dict[str, Any]]:
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8", errors="replace")))
    return [dict(row) for row in reader]


def read_zip_records(path: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    with zipfile.ZipFile(path) as archive:
        for member in archive.infolist():
            if member.is_dir():
                continue
            suffix = Path(member.filename).suffix.lower()
            raw = archive.read(member.filename)
            if suffix == ".json":
                payload = json.loads(raw.decode("utf-8", errors="replace"))
                if isinstance(payload, list):
                    records.extend(normalize_record(item) for item in payload)
                elif isinstance(payload, dict):
                    for value in payload.values():
                        if isinstance(value, list):
                            records.extend(normalize_record(item) for item in value)
            elif suffix == ".csv":
                records.extend(read_csv_records(raw))
    return records


def canonical_key(record: dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = record.get(key)
        if value:
            return str(value).strip().lower()
    return slugify_identifier(str(record))


def dedupe(records: list[dict[str, Any]], *keys: str) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    seen: set[str] = set()
    for record in records:
        key = canonical_key(record, *keys)
        if key in seen:
            continue
        seen.add(key)
        output.append(record)
    return output


def extract_023(path: Path) -> dict[str, list[dict[str, Any]]]:
    data = {
        "legislator_contacts": [],
        "coalition_agencies": [],
        "coalition_networks": [],
        "advocacy_targets": [],
    }
    for table_name, record in parse_sql_records(path.name, path.read_bytes()):
        if table_name in data:
            data[table_name].append(record)
    return data


def flatten_list(payload: Any, key_options: list[str]) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [normalize_record(item) for item in payload]
    if isinstance(payload, dict):
        for key in key_options:
            value = payload.get(key)
            if isinstance(value, list):
                return [normalize_record(item) for item in value]
        flattened: list[dict[str, Any]] = []
        for value in payload.values():
            if isinstance(value, list):
                flattened.extend(normalize_record(item) for item in value)
        return flattened
    return []


def render_insert_block(table: str, rows: list[dict[str, Any]], conflict_column: str) -> list[str]:
    if not rows:
        return [f"-- no rows for {table}"]

    columns: list[str] = []
    seen: set[str] = set()
    for row in rows:
        for key in row.keys():
            if key not in seen:
                seen.add(key)
                columns.append(key)

    if conflict_column not in columns:
        columns.insert(0, conflict_column)
        for row in rows:
            row.setdefault(conflict_column, slugify_identifier(json.dumps(row, sort_keys=True)))

    updates = [col for col in columns if col != conflict_column]
    update_clause = ", ".join(f"{col} = excluded.{col}" for col in updates) if updates else f"{conflict_column} = excluded.{conflict_column}"

    statements: list[str] = []
    for row in rows:
        values = ", ".join(sql_literal(row.get(col)) for col in columns)
        statements.append(
            f"insert into {table} ({', '.join(columns)}) values ({values}) "
            f"on conflict ({conflict_column}) do update set {update_clause};"
        )
    return statements


def section(title: str, statements: list[str]) -> str:
    body = "\n".join(statements)
    return f"-- {title}\nbegin;\n{body}\ncommit;\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", required=True, help="Directory containing advocacy lane source files.")
    parser.add_argument("--output", required=True, help="Output SQL file path.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    root = Path(args.source_root).resolve()
    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)

    missing = [name for name in EXPECTED_SOURCES if not (root / name).exists()]

    sais_payload = read_json(root / "sais_escalation_advocacy_registry.json") if (root / "sais_escalation_advocacy_registry.json").exists() else {}
    sais_resources = flatten_list(sais_payload, ["resources", "sais_resources"])
    sais_routing = flatten_list(sais_payload, ["routing_items", "routing", "route_items"])

    case_law = read_json_records(root / "legal_case_law_priority1.json") if (root / "legal_case_law_priority1.json").exists() else []

    migration_023 = extract_023(root / "20260417095403_023_seed_legislators_agencies_coalitions.sql") if (root / "20260417095403_023_seed_legislators_agencies_coalitions.sql").exists() else {
        "legislator_contacts": [],
        "coalition_agencies": [],
        "coalition_networks": [],
        "advocacy_targets": [],
    }

    legislators_zip = read_zip_records(root / "lighthouse_legislators_complete(2).zip") if (root / "lighthouse_legislators_complete(2).zip").exists() else []
    legislators = dedupe(migration_023["legislator_contacts"] + legislators_zip, "legislator_id", "name")

    agencies_v2 = read_json_records(root / "coalition_agencies_import_snake_case.json") if (root / "coalition_agencies_import_snake_case.json").exists() else []
    agencies = dedupe(migration_023["coalition_agencies"] + agencies_v2, "agency_id", "name")

    coalition_networks = migration_023["coalition_networks"]

    coalition_orgs = read_json_records(root / "coalition_advocacy_orgs_import_snake_case.json") if (root / "coalition_advocacy_orgs_import_snake_case.json").exists() else []

    canonical_50 = coalition_orgs
    comparison_49 = read_json_records(root / "advocacy_organizations_import_snake_case.json") if (root / "advocacy_organizations_import_snake_case.json").exists() else []
    advocacy_orgs = dedupe(canonical_50 + comparison_49, "org_id", "name")

    preferred_targets = read_json_records(root / "advocacy_targets_import_snake_case.json") if (root / "advocacy_targets_import_snake_case.json").exists() else []
    targets = dedupe(preferred_targets + migration_023["advocacy_targets"], "target_id", "name")

    repaired_payload = read_json(root / "coalition_intelligence_complete.REPAIRED.json") if (root / "coalition_intelligence_complete.REPAIRED.json").exists() else {}
    media_outlets = flatten_list(repaired_payload, ["media_outlets", "media", "outlets"])
    campaigns = flatten_list(repaired_payload, ["campaigns", "active_campaigns"])

    sql_sections = [
        "-- Authoritative advocacy/reform intelligence import lane",
        "-- Generated by scripts/advocacy_lane_import.py",
        f"-- Source root: {root.as_posix()}",
        "-- Missing sources: " + (", ".join(missing) if missing else "none"),
        "-- Deduplication: canonical advocacy org set retained; comparison set only fills missing IDs.",
        "",
        section(
            "SAIS escalation resources and routing items",
            render_insert_block("sais_resources", dedupe(sais_resources, "resource_id", "name"), "resource_id")
            + render_insert_block("sais_routing_items", dedupe(sais_routing, "route_id", "name"), "route_id"),
        ),
        section(
            "Case law priority corpus",
            render_insert_block("legal_case_law", dedupe(case_law, "case_id", "citation", "case_name"), "case_id"),
        ),
        section(
            "Legislators",
            render_insert_block("legislator_contacts", legislators, "legislator_id"),
        ),
        section(
            "Agencies",
            render_insert_block("coalition_agencies", agencies, "agency_id"),
        ),
        section(
            "Coalition networks",
            render_insert_block("coalition_networks", dedupe(coalition_networks, "coalition_id", "name"), "coalition_id")
            + render_insert_block("coalition_advocacy_orgs", dedupe(coalition_orgs, "org_id", "name"), "org_id"),
        ),
        section(
            "Advocacy organizations",
            render_insert_block("advocacy_organizations", advocacy_orgs, "org_id"),
        ),
        section(
            "Advocacy targets",
            render_insert_block("advocacy_targets", targets, "target_id"),
        ),
        section(
            "Media outlets",
            render_insert_block("reform_media_outlets", dedupe(media_outlets, "outlet_id", "outlet_name"), "outlet_id"),
        ),
        section(
            "Active campaigns",
            render_insert_block("reform_campaigns", dedupe(campaigns, "campaign_id", "campaign_name"), "campaign_id"),
        ),
    ]

    output.write_text("\n".join(sql_sections), encoding="utf-8")
    print(f"generated={output.as_posix()}")
    print(f"missing_sources={len(missing)}")
    print(f"advocacy_orgs={len(advocacy_orgs)}")
    print(f"targets={len(targets)}")
    print(f"case_law={len(case_law)}")


if __name__ == "__main__":
    main()
