# VA facilities interface — design contract (draft, 2026-10-30)

> Scope update (2026-10-30 evening): Alexander's veterans
> home-base brief makes this facilities interface one surface
> inside the larger home base. The home-base design — resource
> inventory, the located/unlocated shapes, ref linking, build
> order, and the reframed open questions — is in
> `HOME-BASE-DESIGN.md` in this folder. This contract stands as
> the facilities surface's own design.

Modeled directly on the legislator hub (PR #758) and the veterans
decisions in the 2026-10-29 organization record. This is a design
draft for Alexander's review; nothing in it is a decision he has
not already made, and open questions are marked as such.

## Placement

- The veterans area is the first group structure: Mudroom card +
  intake route into it (org record). This facilities interface is
  the directory surface inside that area — one resource set, many
  surfaces (org record): the same staged rows also feed the Civic
  Map and the resource directory.
- Route (proposed, mirroring /legislators): /veterans/facilities.
  Final route is Alexander's call.

## Flow — scoped, never a dump

1. Landing: coverage box first (counts, source, last refreshed —
  the legislators face labels), and a state picker. No facility
  cards on landing.
2. State chosen → facility type picker: Health / Benefits /
  Cemeteries / Vet Centers (the API's four types).
3. Type chosen → scope picker: city list for that state+type, or a
  ZIP entry. Cards render only inside a scope.
4. Unknown state, type, or city → held notice with the valid list
  as clickable options (the legislators held pattern), never an
  error page and never a silent empty list.
5. Every resolve is capped (LIMIT 100, as in the legislators
  router). A scope broader than the cap narrows by city/ZIP, it
  does not page through a dump.

## Resolver contract (draft router implements this)

- `states` — jurisdictions present in the base, with counts.
- `types` — the four facility types, with counts, optionally
  per state.
- `cities` — cities for a state+type, with counts.
- `resolve` — { state, type, city? , zip? } → cards, or
  { held: true, valid: [...] } for an unknown scope. Default
  excludes operating_status CLOSED (the legislators status=current
  rule, carried over); CLOSED rows stay in the base, labeled.
- `facility` — one facility by facility_key, with its services
  (the doorway/detail path, as legislators' `member`).
- `meta` — totals, per-type counts, jurisdictions, last refreshed.
- All procedures public, read-only, parameterized SQL against the
  seeded tables only. No external calls at runtime. Zero.

## Card contract (draft card implements this)

Name; type + classification line; city/state; operating status
shown whenever it is not NORMAL (LIMITED, NOTICE, TEMPORARY_CLOSURE
and the rest are facts a veteran needs before traveling); phone as
a tel: link when present, "Not listed" when absent; website link
when present, "Official page not listed" when absent; street
address block; hours when the source carries them; services list
(names only at card level, detail in the facility view); a
"View on Civic Map" link whenever coordinates exist; and the
source line — source name + fetched date + verification status —
on every card, as the legislators cards carry theirs.

## Civic Map integration

- Every staged facility with source coordinates is a map point
  (Alexander's rule: any resource with an address goes into the
  Civic Map). All 2,591 sandbox records carry VA-supplied lat/long.
- The 4 records without a street address keep their point (their
  coordinates are source-supplied) but carry a hold on the address
  itself, shown honestly on the card.
- Mobile facilities (190 records carry the flag) get a map caution:
  VA's own docs warn mobile-unit coordinates may be inaccurate.
- Map points are a read of the same staged rows — no second copy,
  no second truth (one resource set, many surfaces).

## Data and refresh

- Baseline: the receipted pull (sandbox file in hand; production
  pull when VA production access lands). Staged by
  `stage_va_facilities.py` into canonical rows: jurisdiction from
  the facility's physical address (content, never a label),
  verification_status DIRECTORY while the baseline is sandbox,
  holds flagged with reasons, nothing silently fixed.
- Refresh: re-pull, diff against the baseline, changes land as
  supersession receipts (the reset's standing rule). The API is
  the reconciler, never the page's engine.
- Services: 2,000 of 2,591 staged records carry at least one
  service (a services payload is present on 2,007; 7 payloads are
  empty). The remaining 591 are a per-facility detail pull at
  refresh time — bounded, receipted, and never a page-view cost.

## Open questions for Alexander

1. Route and placement inside the veterans area (above is a
   proposal, not a decision).
2. CLOSED facilities: excluded from default results (drafted) —
   or shown, labeled, under their own toggle?
3. ZIP scope: exact-ZIP only, or radius via the API's /nearby
   semantics at refresh time? (Runtime radius calls are off the
   table — they would break the zero-API-view rule.)
4. Does the card get the #759 treatment at first build (clickable
   contacts, Attach to Case with facility_key as the resource
   ref), or does that land as its own follow-up PR, as it did for
   legislators?
