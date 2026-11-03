# The linking mechanism, named from the codebase (2026-10-30)

Alexander's brief asked for the exact system that "links statutes
and laws to our cases," to mirror it for resource-to-page linking in
the veterans home base. Found in the GitHub repo (main @ 68aad55e —
the pre/partial-rebuild baseline; production application of each
migration is a separate check, and the code is written to degrade
open where a migration is missing).

## It is the case-state "commit" pattern

Core files: `server/routers/case-state.ts`,
`server/legal-reference-runtime.ts`,
`server/services/current-legal-authority-reader.ts`,
`server/legal-library-runtime-db.ts`. UI: `CommitToCase.tsx`,
`CaseLegalReferences.tsx`, `CaseActionContextPanel.tsx`.

### 1. Typed committed references
`legal_commit_ref(kind, id)` mints the stored identity: a bare id
for `statute`; `kind:id` for `runtime_statute`, `case_law`,
`legal_authority`, `enforcement`, `settlement_formula`. Refs live
in `public.case_state.committed_statute_ids` (JSONB array,
append-with-dedupe in SQL). Nothing about the target record is
copied into the case — only the typed identity is stored.

### 2. Commit only what resolves
`commit_legal_reference()` resolves the ref FIRST via
`resolve_legal_reference()` and refuses the commit unless it
resolves to exactly one current record. Router surface:
`case_state.commit_statute`, `commit_runtime_statute`,
`commit_case_law`, `commit_legal_authority`,
`commit_source_reference`. (Sibling arrays on case_state —
committedFindingIds / BarrierIds / BenefitIds / SignalIds /
FoiaIds / FilingIds — run the same pattern for other kinds.)

### 3. Resolve at read, label honestly
`resolve_legal_reference(ref)` re-resolves the saved identity
against the CURRENT sources at read time: legal_authority goes
through the current-legal-authority reader (the #706 legal-
authority-current layer); statutes / case law / enforcement
through the legal-library runtime searches. Every item comes back
`resolved`, `unresolved` (with a reason: no current eligible
record, or the identity matches several), or `unavailable`
(source read failed; the saved reference is preserved, never
dropped). `case_state.get_legal_references` serves a case's refs
paged at 25. `server/services/case-action-context.ts` resolves
the same refs for the case action context.

### 4. The resource side already exists: `case_resource_links`
Migration `20260905100000_case_resource_links.sql` — an append-
only side table "so resource references — which are UUIDs or
hash-derived gof_ keys, not numeric ids — get their own hash-
keyed home": `case_id`, `user_id`, `resource_ref`,
`resource_name`, `source_lane`, `link_hash` =
sha256(case_id + ':' + resource_ref), UNIQUE, `created_at`,
`removed_at`. `case_state.commit_resource` inserts with
`on conflict (link_hash) do nothing` — a repeat commit is a
no-op receipt. Removal is a soft remove (`removed_at`), never a
delete. `case_state.remove_commit` covers all kinds including
"resource". Reads degrade to an empty list if the migration is
not yet applied.

### 5. Page linking
`CaseLegalReferences.tsx` renders each committed ref as a link to
the record's own page: `/legal-library?legal_ref=<committed_ref>`
— the case stores the identity; the library page resolves and
renders the current record. That is the resource-to-page pattern
to mirror.

## Mirror for the veterans home base

- **Ref grammar:** extend the same `kind:id` scheme to resources —
  e.g. `va_facility:vha_526`, `ajc:<id>`, `va_form:<form_id>`,
  `state_resource:<id>`. A page (or case) stores the ref, never a
  copy of the resource.
- **Resolver:** one resolver per kind against the new baseline
  tables (va_facilities, AJC baseline, forms), returning the same
  resolved / unresolved / unavailable labels with reasons.
- **Attach to case:** reuse `commit_resource` /
  `case_resource_links` as-is — resource_ref + resource_name +
  source_lane (e.g. source_lane "va_facilities" / "ajc" /
  "veterans_cards"). This also settles DESIGN.md's open question 4:
  the #759-style Attach to Case action has a ready-made home.
- **Map and page surfaces** link by ref: the Civic Map point and
  the home-base card both resolve the same identity against the
  current baseline, so a refreshed baseline updates every surface
  at once and a stale identity shows as unresolved, never as
  silently wrong data.
