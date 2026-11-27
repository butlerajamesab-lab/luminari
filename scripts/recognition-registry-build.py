"""Build the recognition registry migration from the reviewed research files.

Inputs (data/recognition_research_20261125/):
  us_unrecognized.csv      nations in the US not federally recognized (OFA, state, other records)
  canada_unrecognized.csv  nations in Canada without federal recognition
  success_routes.csv       nations that went from unrecognized to recognized, and reversals

Output: the data section of supabase/migrations/<version>_recognition_registry_v1.sql.

Only facts from official records and each nation's own name and website are
loaded. Nothing describes a nation. Every row keeps its source URLs.

Run: python3 scripts/recognition-registry-build.py > /tmp/recognition_registry_data.sql
"""
from __future__ import annotations

import csv
import json
import re
import sys
import unicodedata
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data" / "recognition_research_20261125"
REGISTRY_SNAPSHOT = DATA / "registry_snapshot_20261127.json"

# Nations already in native_nation_registry_v1 from the Recognition Atlas packets.
EXISTING_SELF_KEYS = {"57": "self:chinook", "25": "self:duwamish", "111": "self:muwekma"}

# Success-route names that differ from the BIA list; mapped by hand, checked against the list.
ROUTE_NAME_OVERRIDES = {
    "Paiute Indian Tribe of Utah": "Paiute Indian Tribe of Utah (Cedar Band of Paiutes, Kanosh Band of Paiutes, Koosharem Band of Paiutes, Indian Peaks Band of Paiutes, and Shivwits Band of Paiutes)",
    "Mi'kmaq Nation": "Mi'kmaq Nation (previously listed as Aroostook Band of Micmacs)",
    "Match-E-Be-Nash-She-Wish Band of Pottawatomi": "Match-E-Be-Nash-She-Wish Band of Pottawatomi (previously listed as Match-E-Be-Nash-She-Wish Band of Pottawatomi Indians of Michigan)",
}
# Reversed acknowledgments: the nation is in the unrecognized list under its petition number.
ROUTE_PETITION_OVERRIDES = {
    "Chinook Indian Tribe / Chinook Nation": "57",
    "Historical Eastern Pequot Tribe": "35",
    "Schaghticoke Tribal Nation": "79",
}

US_STATUS = {
    "ofa_petition_active", "ofa_letter_of_intent", "ofa_proposed_finding_negative",
    "ofa_final_determination_negative", "ofa_determination_reversed", "ofa_withdrawn_or_inactive",
    "federal_terminated_not_restored", "no_federal_petition_on_record", "unknown",
}
CA_STATUS = {
    "no_band_status_seeking", "declared_extinct", "non_status_organized",
    "metis_seeking_recognition", "other", "unknown",
}
ROUTES = {
    "ofa_acknowledgment", "congressional_recognition", "congressional_restoration",
    "court_or_settlement", "secretarial_reaffirmation", "canada_order_in_council_or_band_creation", "other",
}


def lit(v: str | None) -> str:
    if v is None or str(v).strip() == "":
        return "null"
    return "'" + str(v).strip().replace("'", "''") + "'"


def arr(values: list[str]) -> str:
    values = [v.strip() for v in values if v and v.strip()]
    if not values:
        return "'{}'::text[]"
    return "array[" + ", ".join(lit(v) for v in values) + "]::text[]"


def slug(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")[:60]


def split_urls(s: str) -> list[str]:
    return [u.strip() for u in re.split(r"[;\s]+", s or "") if u.strip().startswith("http")]


def norm(s: str) -> str:
    s = s.lower().replace("—", " ").replace("-", " ")
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    stop = {"the", "of", "tribe", "tribes", "indian", "indians", "nation", "band", "inc", "and", "in", "a",
            "california", "rancheria", "community", "reservation", "confederated"}
    return " ".join(w for w in s.split() if w not in stop)


def first_petition(p: str) -> str | None:
    m = re.match(r"\s*(\d+[A-Za-z]?)\b", p or "")
    return m.group(1).upper() if m else None


def main() -> int:
    out: list[str] = []
    problems: list[str] = []
    registry = json.loads(REGISTRY_SNAPSHOT.read_text())
    by_name = {n: k for k, n, _ in registry}
    by_norm = {norm(n): k for k, n, _ in registry}

    petition_key: dict[str, str] = {}
    seen_keys: set[str] = set()

    # --- US, not federally recognized ---
    for r in csv.DictReader((DATA / "us_unrecognized.csv").open()):
        name = r["nation_name_as_self_named"].strip()
        status = r["federal_status"].strip()
        if status not in US_STATUS:
            problems.append(f"us status {status!r} for {name}")
            continue
        pet = first_petition(r["ofa_petition_number"])
        if pet and pet in EXISTING_SELF_KEYS:
            key = EXISTING_SELF_KEYS[pet]
        elif pet:
            key = f"ofa:{pet.lower()}"
        else:
            states = re.split(r"[;,/ ]+", r["state_or_states"].strip())
            key = f"us:{(states[0] or 'xx').lower()}:{slug(name)}"
        if key in seen_keys and "duplicate number in source" in (r["ofa_petition_number"] or ""):
            # OFA's own list gives this number to two groups; key this one by state and name.
            states = re.split(r"[;,/ ]+", r["state_or_states"].strip())
            key = f"us:{(states[0] or 'xx').lower()}:{slug(name)}"
        if key in seen_keys:
            problems.append(f"duplicate key {key} ({name})")
            continue
        seen_keys.add(key)
        for p in re.findall(r"\d+[A-Za-z]?", r["ofa_petition_number"] or ""):
            petition_key.setdefault(p.upper(), key)
        sources = split_urls(r["source_urls"])
        if not sources:
            problems.append(f"no source for {name}")
            continue
        if not key.startswith("self:"):
            out.append(
                "insert into public.native_nation_registry_v1 (nation_key, nation_name, federal_status, website_url, registry_source, registry_source_ref) "
                f"values ({lit(key)}, {lit(name)}, 'not_federally_recognized', {lit(r['own_website_url'])}, 'Recognition research 2026-11-25', {lit(sources[0])}) "
                "on conflict (nation_key) do nothing;"
            )
        out.append(
            "insert into public.nation_recognition_record_v1 (nation_key, country, jurisdictions, federal_status_detail, ofa_petition_numbers, state_recognition, other_recognition, own_website_url, other_names, notes_factual_only, source_urls) "
            f"values ({lit(key)}, 'US', {arr(re.split(r'[;,/]+', r['state_or_states']))}, {lit(status)}, "
            f"{arr(re.findall(r'R?\d+[A-Za-z]?', r['ofa_petition_number'] or ''))}, {lit(r['state_recognition'])}, {lit(r['other_recognition'])}, "
            f"{lit(r['own_website_url'])}, {lit(r['other_names'])}, {lit(r['notes_factual_only'])}, {arr(sources)}) on conflict do nothing;"
        )
        for doc in [d.strip() for d in (r["federal_decision_documents"] or "").split(";") if d.strip()]:
            out.append(
                "insert into public.recognition_decision_document_v1 (nation_key, citation, decision_date, document_url, source_dataset) "
                f"values ({lit(key)}, {lit(doc)}, null, null, 'us_unrecognized') on conflict do nothing;"
            )

    # --- Canada, not federally recognized ---
    for r in csv.DictReader((DATA / "canada_unrecognized.csv").open()):
        name = r["nation_name_as_self_named"].strip()
        status = r["federal_status"].strip()
        if status not in CA_STATUS:
            problems.append(f"ca status {status!r} for {name}")
            continue
        key = f"ca:{slug(name)}"
        if key in seen_keys:
            problems.append(f"duplicate key {key}")
            continue
        seen_keys.add(key)
        sources = split_urls(r["source_urls"])
        if not sources:
            problems.append(f"no source for {name}")
            continue
        out.append(
            "insert into public.native_nation_registry_v1 (nation_key, nation_name, federal_status, website_url, registry_source, registry_source_ref) "
            f"values ({lit(key)}, {lit(name)}, 'not_federally_recognized', {lit(r['own_website_url'])}, 'Recognition research 2026-11-25', {lit(sources[0])}) "
            "on conflict (nation_key) do nothing;"
        )
        out.append(
            "insert into public.nation_recognition_record_v1 (nation_key, country, jurisdictions, federal_status_detail, ofa_petition_numbers, state_recognition, other_recognition, own_website_url, other_names, notes_factual_only, source_urls) "
            f"values ({lit(key)}, 'CA', {arr(re.split(r'[;,]+', re.sub(r'\(.*?\)', '', r['province_or_provinces'])))}, {lit(status)}, "
            f"'{{}}'::text[], null, {lit(r['provincial_recognition'])}, {lit(r['own_website_url'])}, {lit(r['other_names'])}, "
            f"{lit(r['notes_factual_only'])}, {arr(sources)}) on conflict do nothing;"
        )
        for doc in [d.strip() for d in (r["court_or_decision_documents"] or "").split(";;") if d.strip()]:
            parts = [p.strip() for p in doc.split(";")]
            url = next((p for p in parts if p.startswith("http")), None)
            date = next((p for p in parts if re.fullmatch(r"\d{4}-\d{2}-\d{2}", p)), None)
            out.append(
                "insert into public.recognition_decision_document_v1 (nation_key, citation, decision_date, document_url, source_dataset) "
                f"values ({lit(key)}, {lit(parts[0])}, {lit(date)}, {lit(url)}, 'canada_unrecognized') on conflict do nothing;"
            )

    # --- Success routes (and reversals) ---
    for r in csv.DictReader((DATA / "success_routes.csv").open()):
        name = r["nation_name_current_official"].strip()
        route = r["route"].strip()
        if route not in ROUTES:
            problems.append(f"route {route!r} for {name}")
            continue
        key = None
        bare = re.sub(r"\s*\(.*\)\s*$", "", name)
        for prefix, pet in ROUTE_PETITION_OVERRIDES.items():
            if name.startswith(prefix):
                key = petition_key.get(pet) or EXISTING_SELF_KEYS.get(pet)
        if key is None and r["country"] == "US":
            target = ROUTE_NAME_OVERRIDES.get(bare, name)
            key = by_name.get(target) or by_norm.get(norm(target))
        if key is None and r["country"] in ("Canada", "CA"):
            key = f"ca:{slug(name)}"
            out.append(
                "insert into public.native_nation_registry_v1 (nation_key, nation_name, federal_status, website_url, registry_source, registry_source_ref) "
                f"values ({lit(key)}, {lit(name)}, 'federally_recognized', {lit(r['own_website_url'])}, 'Recognition research 2026-11-25', "
                f"{lit((split_urls(r['source_urls']) or [None])[0])}) on conflict (nation_key) do nothing;"
            )
        if key is None:
            problems.append(f"route nation not matched: {name}")
            continue
        out.append(
            "insert into public.recognition_route_v1 (nation_key, country, route, route_status, petition_filed_date, decision_date, statute_citation, years_to_recognition, notes_factual_only, source_urls, name_in_source) "
            f"values ({lit(key)}, {lit('CA' if r['country'] in ('Canada', 'CA') else r['country'])}, {lit(route)}, {lit(r['status'])}, "
            f"{lit(r['petition_filed_date'] if re.fullmatch(r'\d{4}-\d{2}-\d{2}', r['petition_filed_date'] or '') else None)}, "
            f"{lit(r['decision_date'] if re.fullmatch(r'\d{4}-\d{2}-\d{2}', r['decision_date'] or '') else None)}, "
            f"{lit(r['statute_citation'])}, {lit(r['years_from_first_petition_to_recognition'] if re.fullmatch(r'\d+', r['years_from_first_petition_to_recognition'] or '') else None)}, "
            f"{lit(r['notes_factual_only'])}, {arr(split_urls(r['source_urls']))}, {lit(name)}) on conflict do nothing;"
        )
        for doc in [d.strip() for d in (r["decision_documents"] or "").split(";") if d.strip()]:
            parts = [p.strip() for p in doc.split("|")]
            date = next((p for p in parts if re.fullmatch(r"\d{4}-\d{2}-\d{2}", p)), None)
            url = next((p for p in parts if p.startswith("http")), None)
            out.append(
                "insert into public.recognition_decision_document_v1 (nation_key, citation, decision_date, document_url, source_dataset) "
                f"values ({lit(key)}, {lit(parts[0])}, {lit(date)}, {lit(url)}, 'success_routes') on conflict do nothing;"
            )

    for p in problems:
        sys.stderr.write(f"problem: {p}\n")
    sys.stderr.write(f"statements {len(out)}, problems {len(problems)}\n")
    sys.stdout.write("\n".join(out) + "\n")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
