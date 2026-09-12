# Batch source hold follow-through — 2026-09-12

This follows the independently merged #636 and #637 release at main
046f6785f4f1c68492518fc9ba3a8aa6d22ed6ee. It preserves that release's
exact-run worker, public/private source separation, migration receipt,
legal-reference kinds, and current UI.

A repeated resource ID within one DOCX metadata table previously left the
first retained resource marked as an ordinary source observation even though
the document had a duplicate-ID hold. Both identical and conflicting repeats
now hold the resource itself and retain every contributing row locator. Raw
table observations remain preserved. Compatible metadata split across different
tables can still contribute to the same declared resource ID.

The admin lineage reader now returns unavailable when the current manifest
record is absent. It only reports empty after establishing a completed current
source extraction and successfully finding no matching records.

DOCX and Batch adapter versions advance to 1.0.1. The adapter version participates
in atomic identity hashing; prior extraction records are not rewritten.

Validation: the integrated suite passed 1,802 tests (342 files, three opt-in
skips); the subsequent targeted suite also checks identical duplicate rows
with complete canonical identity fields. CI TypeScript, the owned-contract
guard, and 20 Python source/reconciliation regressions passed. A separate
bounded review found no blocking issue. No original-source replay, source
registration, production data write, or worker activation was performed here.
