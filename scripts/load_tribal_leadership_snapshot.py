#!/usr/bin/env python3
"""Turn a BIA Tribal Leaders Directory GeoJSON export into insert SQL for
public.tribal_leadership_snapshot_v1.

Each feature's properties are stored verbatim in `record`; the leader's name
is assembled only from the directory's own name fields. Rows are keyed by
(snapshot_id, tribe_full_name), and existing rows are never overwritten.

Usage:
  load_tribal_leadership_snapshot.py <export.geojson> <snapshot_id> <captured_date> \
      [--chunk 150] [--out-dir DIR]
Writes one .sql file per chunk to --out-dir (default: current directory).
"""
import argparse
import hashlib
import json
import pathlib
import sys

SOURCE = "BIA Tribal Leaders Directory (bia.gov), GeoJSON export"
NAME_FIELDS = ("salutation", "firstname", "middlename", "lastname", "suffix")


def sql_text(value):
    if value is None or str(value).strip() == "":
        return "null"
    return "'" + str(value).replace("'", "''") + "'"


def leader_full_name(props):
    parts = [str(props.get(k)).strip() for k in NAME_FIELDS if props.get(k)]
    return " ".join(p for p in parts if p) or None


def build_rows(features, snapshot_id, captured_date, file_sha256):
    seen = set()
    rows = []
    for feature in features:
        props = feature["properties"]
        tribe = (props.get("tribefullname") or "").strip()
        if not tribe:
            raise SystemExit("feature without tribefullname: OBJECTID %s" % props.get("OBJECTID"))
        if tribe in seen:
            raise SystemExit("duplicate tribefullname in export: %s" % tribe)
        seen.add(tribe)
        record = json.dumps(props, ensure_ascii=False, sort_keys=True)
        rows.append(
            "(%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s)"
            % (
                sql_text(snapshot_id),
                sql_text(tribe),
                sql_text(props.get("GlobalID")),
                sql_text(leader_full_name(props)),
                sql_text(props.get("jobtitle")),
                sql_text(props.get("dateelected")),
                sql_text(props.get("nextelection")),
                sql_text(record),
                sql_text(SOURCE),
                sql_text(file_sha256),
                sql_text(captured_date),
            )
        )
    return rows


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("geojson")
    parser.add_argument("snapshot_id")
    parser.add_argument("captured_date")
    parser.add_argument("--chunk", type=int, default=150)
    parser.add_argument("--out-dir", default=".")
    args = parser.parse_args(argv)

    raw = pathlib.Path(args.geojson).read_bytes()
    file_sha256 = hashlib.sha256(raw).hexdigest()
    features = json.loads(raw)["features"]
    rows = build_rows(features, args.snapshot_id, args.captured_date, file_sha256)

    out_dir = pathlib.Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    head = (
        "insert into public.tribal_leadership_snapshot_v1 (snapshot_id, tribe_full_name, "
        "bia_global_id, leader_full_name, title, date_elected, next_election, record, "
        "source, source_file_sha256, captured_date) values\n"
    )
    tail = "\non conflict (snapshot_id, tribe_full_name) do nothing;\n"
    for index in range(0, len(rows), args.chunk):
        part = out_dir / ("%s_%03d.sql" % (args.snapshot_id, index // args.chunk))
        part.write_text(head + ",\n".join(rows[index:index + args.chunk]) + tail, encoding="utf-8")
    print("rows=%d sha256=%s chunks=%d" % (len(rows), file_sha256, -(-len(rows) // args.chunk)), file=sys.stderr)


if __name__ == "__main__":
    main()
