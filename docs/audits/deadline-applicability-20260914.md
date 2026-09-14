# Deadline applicability repair

Base inspected: `3ee351a9dfe7adfff6fc461398dec30eba59fba8`. Live schema and read-only query verification: September 15, 2026 UTC (September 14 in the user's local time).

## Retrieved findings

- Resolve previously selected deadline rules by overlapping claim words, sorted source durations and returned “File within N days” without a bound forum, trigger event or event date. Its Where to File reader also matched jurisdiction **or** domain.
- `deadline_rules` has 71 source reference rows. Its physical columns are snake_case, unlike the legacy Drizzle declarations used by these Resolve procedures.
- The replacement SELECTs were executed read-only against the live database: 71 deadlines, 6 workflows, 31 agency references, 11 courts and 29 escalation rows. All selected columns exist.
- The deadline catalog has no bound forum, verified source URL/version or calendar computation contract. A numeric source interval is insufficient to establish a deadline.
- `claim_detection_results` and `claim_viability` were absent from the live public schema. Their existing T3/T7 implementation is hardened here, but this change does not make those stages operational or create new tables.

## Changed behavior

`find_agency_and_forum`, `get_next_action`, `evaluate_deadlines` and `compute_viability` use one deadline applicability assessment. Exact claim identity and normalized jurisdiction select reference rows. Different claim names are not silently treated as aliases. Unknown, mixed, tribal and local jurisdiction scopes require an explicit mapping; territorial records are not given federal applicability by inference.

Source duration, source trigger, authority reference and extension conditions remain available. The assessment always reports unresolved applicability until a reviewed authority version, forum, trigger event and calendar/exception rule establish an operative calculation. Remaining days, urgency and deadline date stay null. An empty reference set explicitly does not establish that no deadline exists.

Resolve accepts optional forum/event/date context and links to the existing agency deadline instructions page. It no longer substitutes Federal for missing user jurisdiction. Agency response intervals remain separately labeled. Workflows and courts use exact normalized jurisdiction matching; escalation references follow an actual `workflow_id`. Agency and workflow suggestions remain catalog references requiring applicability review.

T3 no longer treats a generic incident timestamp as the event starting every time limit. T7 cannot mark a claim expired, apply a deadline score penalty or recommend filing based on those unbound intervals. It preserves the existing authentication boundary and case filters. No live case was created or changed.

The existing Filing Deadline Calculator source-text-only guard remains unchanged. Its tests run with this repair so a cautious calculator cannot coexist with an unsafe Resolve shortcut.

## Verification

- Behavioral tests cover cross-jurisdiction and overlapping-name exclusions, state/territory aliases, source intervals versus remaining days, missing context, extensions, absent identities and no automatic federal inheritance into a territory.
- Actual tRPC caller tests exercise Resolve, Where to File, T3 and T7, including legacy input normalization, persisted unknown SOL, no invented score penalty, private-route authentication and catalog read failures.
- Source queries were executed against the live catalog; no production write or migration was performed.

## Still unresolved

This repair does not independently verify the catalog's legal propositions or supply missing claim alias relationships. It does not calculate an operative filing date. The inspected viability tables are unavailable in production. Source-authority review and explicit claim/forum/event relationships remain necessary before activating deadline calculations.

Owned new request/response fields and touched procedures use snake_case. Legacy request keys are normalized at the transport boundary. Existing Drizzle case-model keys remain isolated to database read/write boundaries; package APIs and React props retain externally required spelling.
