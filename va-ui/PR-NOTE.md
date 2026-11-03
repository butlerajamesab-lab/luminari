# Status of this snapshot — read first

This folder is a snapshot of the VA / veterans build from the
database-reset workspace (built 2026-10-30), brought into this repo
as a pull request on 2026-11-01 so it has a durable, reviewable home.

## What this is

- Design: `DESIGN.md`, `HOME-BASE-DESIGN.md`, `LINKING-MECHANISM.md`,
  `VETERANS-HOME-BASE-BRIEF-2026-10-30.md` — the veterans home base
  under the federal Benefits & Resources page; VA is one subcategory
  of the overarching API database design.
- Draft schema: `schema/20261030000001_va_facilities_new_format_schema.sql`
  creates new `va_facilities` / `va_facility_services` tables beside
  the old schema. It deliberately does not reuse legacy
  `sais_resources`.
- Draft server resolver: `server/va-facilities-router.draft.ts`
  (read-only, parameterized, mirrors the legislators router).
- Draft client: `client/VaFacilityCard.draft.tsx`,
  `client/VaFacilities.draft.tsx` (syntax-checked drafts).
- Staged data: `staged-data/` — the reset staging output: the VA
  facilities staged set plus 234 veterans content rows (statutes,
  state contacts, routing notes, deep-dive resources, SAIS doc-12
  resources), each row carrying verification status, source, and
  date per the reset staging method.

## What this is NOT

- The schema has **not** been applied. No migration has run.
- The router and client drafts are **not wired** into the app:
  no route is registered, nothing is reachable in the live product,
  and there are no veterans tables or pages in production.
- The staged data has **not** been loaded anywhere. It remains
  behind the database-reset approval gates (mapping, load, scrub —
  each a separate approval).
- The raw VA Facilities sandbox source pull (2,591 facilities;
  SHA-256 95afd269f7d35b1d8997d126789ea87ea5466a70427edd2e1d6b9f605a61e2fd)
  stays in the reset workspace `sources/` folder; the staged set in
  this snapshot is the worked product derived from it.
- VA production API access (VA Facilities, VA Forms, Benefits
  Reference Data) was requested 2026-10-30 for the Northwest Hope
  Foundation and is still pending VA review; the sandbox is what
  this build runs against.

Merging this PR preserves the build in the repo. It does not
approve applying the schema, loading the data, or wiring the UI —
each of those remains its own decision.
