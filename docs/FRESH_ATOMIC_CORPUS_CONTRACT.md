# Fresh Atomic Corpus Contract

## Purpose

The atomic corpus layer measures and preserves source-bound data units before semantic promotion. It exists so Lighthouse can account for the full registry/backbone corpus without confusing raw/source occurrences with unique public resources.

## Invariant

`storage artifact != atomic source record != typed candidate != deduped identity != public projection`

The layers are intentionally non-additive and must be reported separately.

## Atomic records

An atomic record is a deterministic source-bound unit extracted from current Storage bytes, including:

- SQL `COPY ... FROM stdin` data rows, parsed as text and never executed
- SQL `INSERT ... VALUES` tuples, parsed as text and never executed
- DOCX table rows
- DOCX body paragraphs outside tables
- XLSX data rows
- CSV rows
- scalar-bearing JSON/JSONL records
- bounded Markdown/text blocks
- supported members of ZIP bundles, with container member path retained

Every atomic record retains a source-file SHA-256, parser version, relation/member identity where available, row ordinal, content hash, and one or more provenance origins.

## Deduplication

Identical atomic records may share one content-addressed record while retaining multiple origin rows. Therefore both values matter:

- `atomic_record_count`: deduplicated atomic records
- `origin_count`: source occurrences/provenance locations

Neither count is a count of unique public resources.

## Promotion boundary

The atomic layer does not automatically promote anything into resources, statutes, claims, workflows, signals, findings, or other canonical objects. Typed derivation and identity resolution remain separate governed operations.

## Coverage oracle

Historical/legacy digestions may be compared as coverage oracles to identify under-extraction. They do not override the current Storage bytes as source of record and do not become canonical merely because an older ingestion produced more rows.
