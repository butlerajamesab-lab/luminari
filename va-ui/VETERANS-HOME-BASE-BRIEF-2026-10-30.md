# Veterans Home Base — Alexander's design brief (2026-10-30, evening)

## His words, as given

Build a **home base for veterans**: a UI that pulls all the resources
through each of the APIs and connects them into one overarching API
database — every state, every agency, everything we've been working
on for data, pulled through that avenue.

- Anything that has a location gets **projected onto the Civic Map**.
- Anything that doesn't have a location carries **websites** — portals,
  forms, filings. A lot of this is access: forms and filings, portals.
- It could be one of the existing UIs, with access.
- We need to be able to **link different resources to pages**. There is
  already a system in place that links statutes and laws to our cases —
  reuse that pattern for resource-to-page linking.

Scenario he gave: somebody comes in needing to do something — they
find the avenue, and from it the place, the form, the portal, or the
agency that handles it.

## What exists to build on (verified state, 2026-10-30)

- **va-ui scaffolding** in this workspace (README, DESIGN, draft DDL
  for `va_facilities`, draft router in the legislators pattern) — the
  seed for this home base; its open questions (route, CLOSED toggle,
  ZIP semantics, card actions) now sit inside this larger design.
- **Staged veterans sources (files only, nothing loaded):** 234 rows —
  41 VET cards (all VERIFIED 2026-09-07), routing notes, statutes,
  56-jurisdiction contacts, SAIS Doc 12 resources/statutes/agencies.
- **Receipted baselines with source coordinates:**
  VA Facilities sandbox full pull (2,591 facilities; production pull
  still waits on VA production access); CareerOneStop AJC all-centers
  (2,129 centers, 39 WA); BIA offices GeoJSON (93 points);
  NPS parks (API live; WA 17 with source lat/long).
- **Verified API connections:** VA (sandbox), api.data.gov umbrella
  (incl. Congress.gov), NPS, CareerOneStop — all live 2026-10-30.
  CMS provider data and SAMHSA FindTreatment need no key (open).
- **Federal anchor catalog** (`FEDERAL-FACILITY-SOURCES.md`): HUD PHA
  (3,300+, lat/long, no key), HRSA health centers, CMS provider data
  (hospitals / nursing homes / home health / hospice / dialysis),
  SSA field offices (1,182-record file already held), VA Forms and
  Benefits Reference Data in the VA developer program (the forms and
  filings avenue).

## Standing rules that govern the build

- **Civic Map rule (Alexander, 2026-10-30):** every resource with an
  address goes into the Civic Map; coordinates only as supplied by
  the source, never invented; absent is null.
- Dataset-first (legislators pattern): pull once into a receipted
  local baseline; the live API serves as reconciler on refresh; zero
  external calls at runtime.
- Deterministic constitution: source-bound, reproducible, receipts;
  unknown stays unknown; no probabilistic model as factual authority.
- The federal page design note (`FEDERAL-PAGE-DESIGN-2026-10-30.md`)
  is the parent design — the veterans home base is one avenue's home
  under that overarching page, and its "every avenue carries its
  reporting pair" rule applies here too.

## The linking question (for the thread that builds it)

Alexander: "We have a system in place that already links like
statutes and laws to our cases." Main-chat walkthrough (2026-10-30)
verified the surrounding pieces — cases carry registered sources,
entities, and events; a legal-authority layer exists (#706's fast
view is still repo-only, not in production); Sovereign workflow
coverage counts 301 source-bound vs 144 "needs claim binding" — but
it did **not** isolate a statute-to-case linking surface by name.
The build thread should name the exact mechanism from the codebase
and mirror it for resource-to-page links.


## Linking question — ANSWERED (2026-10-30, this thread)

The mechanism is the **case-state "commit" pattern**
(`server/routers/case-state.ts` + `server/legal-reference-runtime.ts`):
typed refs (`kind:id`; bare id for statute) stored on the case,
commit gated on the ref resolving to exactly one current record,
resolve-at-read with resolved/unresolved/unavailable labels. The
resource side already exists as **`case_resource_links`**
(migration 20260905100000) with `case_state.commit_resource` —
append-only, link_hash = sha256(case_id:resource_ref), soft-remove.
Page linking renders `/legal-library?legal_ref=<committed_ref>`.
Full naming and the home-base mirror (resource ref grammar,
per-kind resolver, reuse commit_resource for Attach to Case) are in
`va-ui/LINKING-MECHANISM.md`. Source: GitHub main @ 68aad55e;
production application of the migration is a separate check (the
code degrades open if it is absent).
