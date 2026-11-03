# Veterans home base — design (2026-10-30)

Alexander's brief (`../VETERANS-HOME-BASE-BRIEF-2026-10-30.md`):
a home base for veterans. **Scope correction (Alexander,
2026-10-30 20:01 PDT): the overarching API database is bigger
than this home base — VA is only ONE subcategory of it.**
Social Security, mental health, and the other federal avenues
are sibling subcategories in the same one database (designed at
`../API-DATABASE-DESIGN.md`). This document designs the
**veterans subcategory's home** inside that database; the
facilities interface contract in `DESIGN.md` is one surface
inside this home.

Status: design only. Files only, like everything in the reset —
no schema applied, nothing loaded; the reset's gates (canonical-ID
rule, dataset approval, mapping check) are still Alexander's.

## Placement

- The home base is the veterans avenue's home under the federal
  Benefits & Resources page (the parent design,
  `../FEDERAL-PAGE-DESIGN-2026-10-30.md`), inside the veterans
  group structure (Mudroom card + intake route, org record).
- Proposed route: `/veterans` for the home base, with
  `/veterans/facilities` (the DESIGN.md interface) inside it.
  This supersedes DESIGN.md's open question 1 framing — the
  decision itself is still Alexander's.

## The two shapes every resource takes

1. **Located** — the resource has an address. An address IS the
   location (Alexander, 2026-10-30: "If there is an address, that
   is coordinates — it's just not geospaced") → it projects onto
   the **Civic Map** and renders as scoped cards (the facilities
   flow: state → type → city/ZIP, never a dump). Coordinates come
   in two labeled kinds: **source-supplied** (the source gave
   lat/long) or **derived** (geocoded from the source's own
   address by a declared transformation). What is never allowed
   is a location with no source address behind it — that is the
   invention the rule bars, not the geocoding of a real address.
2. **Unlocated** — no location → it carries its **website**: the
   portal, the form, the filing. Much of this avenue is access,
   not geography. These render as a directory of doors: name, what
   it's for, the official link, phone if any, and the source line.

Both shapes are reads of one staged registry — one resource set,
many surfaces (org record). A resource can be both (a facility
with a website carries a map point AND its door).

## Resource inventory

The veterans rows are this home's own. The SSA / AJC / BIA / NPS
rows below are **sibling subcategories of the overarching
database**, listed here only where the veterans home surfaces
them as cross-avenue reads (e.g. AJC veteran representatives) —
they are not veterans resources and this home does not own them.

| Kind | Source / baseline | Shape | State |
|---|---|---|---|
| VA facilities | VA Facilities API; sandbox baseline 2,591 receipted | located | staged; production pull waits on the VA grant (request submitted 2026-10-30) |
| VA forms | VA Forms API (nightly, SHA-256 + revision history) | unlocated (forms/filings) | production access in the same submitted VA request; baseline pull at grant |
| Benefits reference data | VA Benefits Reference Data API (daily, no PII) | unlocated (lookups) | same VA request |
| VET cards + routing notes + statutes + state contacts + SAIS Doc 12 | Alexander's documents; 234 rows staged | mixed (cards carry doors; statutes link to the legal library) | staged, files only; HELD-AMBIGUOUS mapping per the reset rules |
| American Job Centers | CareerOneStop API; baseline 2,129 receipted (39 WA), all source lat/long; records carry VeteranRep flags/contacts | located | verified live 2026-10-30; the Labor avenue's anchor, shared here for veteran services |
| BIA offices | GeoJSON, 93 points, source lat/long | located | baselined |
| SSA field offices | file held, 1,182 records, street addresses but no lat/long in source | located — map points via geocoding of the source addresses, coordinates labeled DERIVED | baselined as a file; staged with the federal avenues |
| NPS parks | NPS API; WA 17 with source lat/long | located | live; recreation, not benefits — include only if Alexander wants a lands layer here (open question) |
| CMS / SAMHSA / HRSA / HUD PHA | `../FEDERAL-FACILITY-SOURCES.md` anchors; CMS + SAMHSA need no key | located mostly | later avenues; the home base takes veteran-relevant slices when staged, not a parallel copy |

## Linking (per LINKING-MECHANISM.md)

- Every resource carries a typed ref in the commit pattern's
  grammar: `va_facility:<facility_key>`, `ajc:<id>`,
  `va_form:<form_number>`, `vet_card:<VET-id>`,
  `state_resource:<id>`, `ssa_office:<id>`.
- One resolver per kind against the staged baseline tables,
  returning resolved / unresolved (reason) / unavailable (ref
  preserved) — the legal-reference labels, reused verbatim.
- Pages link by ref (a card, a map point, and a case attachment
  all resolve the same identity against the current baseline, so
  a refresh updates every surface at once).
- **Attach to Case** reuses `case_state.commit_resource` /
  `case_resource_links` (resource_ref = the typed ref,
  source_lane = the avenue, e.g. "veterans"). Prerequisite check
  before build: confirm migration 20260905100000 is applied in
  production (the code degrades to an empty list if not).
- Statutes inside the veterans content (34 staged) link through
  the EXISTING legal-reference commits to the legal library —
  they are legal references, not a new kind.

## Reporting pair

Per the federal page's rule, every help avenue carries its
reporting pair — where to report, beside where to get help. For
veterans: the accountability content already staged from SAIS
Doc 12 and the VET cards (VA OIG and related reporting doors)
renders in the home base alongside the help doors, never behind
them.

## Build order (each phase still gated by the reset approvals)

1. Unified registry: new tables for the resource kinds above
   (beside the old schema, never a reshape), ref resolver
   skeleton; load facilities + AJC from the receipted baselines.
2. Home-base landing + Civic Map layer + the facilities scoped
   flow as designed in DESIGN.md.
3. Doors avenue: VET cards, SAIS resources, state contacts as
   unlocated doors; VA Forms + Benefits Reference Data join when
   the VA grant lands.
4. Attach to Case via commit_resource (after the production
   migration check), and case-side rendering of veteran refs.
5. Refresh discipline: re-pull, diff, supersession receipts —
   the API as reconciler, zero external calls at runtime.

## Open questions for Alexander

1. Route: `/veterans` as the home with `/veterans/facilities`
   inside it — or a different placement? (DESIGN.md Q1, reframed.)
2. CLOSED facilities: excluded by default (drafted) or a labeled
   toggle? (DESIGN.md Q2, stands.)
3. ZIP scope: exact-ZIP only, or radius computed at refresh time
   from source coordinates? (DESIGN.md Q3, stands — runtime calls
   stay off the table.)
4. Attach to Case: mechanism is ready-made (commit_resource) —
   first build, or follow-up? (DESIGN.md Q4, reframed: the
   mechanism question is answered; only timing remains.)
5. NPS parks: a recreation/lands layer inside the veterans home
   base, or out of scope here?
6. The staged veterans rows are HELD-AMBIGUOUS across sources —
   their reconciliation rides the reset's mapping gate, same as
   Washington's. No separate shortcut proposed.
