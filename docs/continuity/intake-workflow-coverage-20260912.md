# Intake workflow coverage

This read-only connection extends PR #635. Intake already loads source-bound
workflows and records rejected source bindings in its governed manifest, but
those holds and unmatched workflow types had no application reader. They were
visible only in a verification script.

## Implemented path

`Sovereign Control → Admin Control → Workflow coverage` calls the existing
`analyze` router's admin-only `get_workflow_coverage` query. That query reads
`load_governed_legal_registry()` and projects its actual workflow identities,
source references, held source IDs and reasons. Search and status filters use
bounded pages of at most 100 records. No case ID is required.

The displayed categories retain distinct grains:

- Source registry records = source-bound workflows + held registry records.
- Source-bound workflows = claim type matched + missing claim binding.
- Existing master workflows are counted separately.

Claim matching uses Layer 14's existing claim IDs and explicit issue aliases.
This global report does not evaluate a case's jurisdiction, legal applicability
or completed procedural footholds. It creates no aliases, workflows, deadlines,
crosswalks or database rows. Held bindings have null source-reference and step
fields because those structures were not admitted by the loader.

Each successful response exposes the governed manifest hash. A failed read
propagates as an error and the UI shows unavailable counts. A successful zero
result is explicitly empty; a zero-match filter does not label the registry
empty. Pagination reads the current manifest on each request, so the hash can
change if another process updates source bindings.

## Verification

- Behavioral tests exercise the actual loader/query projection, alias agreement
  with Layer 14, cross-jurisdiction exclusion in Layer 14, disjoint counts,
  source identity retention, filtering/pagination, and unavailable versus empty.
- Actual tRPC caller tests verify administrator access and reject non-admin,
  unauthenticated and unbounded requests before database reads.
- UI rendering tests verify visible native IDs, reasons and source gaps, and
  hide stale counts when the current request fails.
- The saved read-only query snapshot used by the original #635 verification
  produces the same hash `f3587fd515f372214c7ab0b6926db9c6376f28019a6afdc6bdc61b8c2d5a7fac`:
  6 master workflows; 482 registry records = 301 source-bound + 181 held;
  301 source-bound = 157 claim type matched + 144 missing claim bindings;
  1,555 source steps across 55 source jurisdictions. These are reproduced
  snapshot counts, not a new live database observation.

The remaining 144 claim mappings and 181 held source connections require source
evidence. Making them inspectable does not resolve those mappings. Production
deployment and authenticated browser readback remain release verification.
