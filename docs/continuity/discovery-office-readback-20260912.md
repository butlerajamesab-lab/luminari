# Discovery office readback — 2026-09-12

## Implemented connection

The existing discovery view exposes native government-office records, but Discover Benefits offered only telephone and website actions. A discovery office with neither contact field could not open its existing record. The existing `/resource/:id` route and `resourceDirectory.detail` API already support native `gof_…` office IDs.

The discovery reader now resolves a page's exact `source_lane = 'gov_offices'` and native `source_id` against active `gov_offices.office_id` values. It returns a `record_link` to the existing detail route, with `link_basis = 'exact_source_lane_and_office_id'`, office ID, locator source ID, source hash, and stored provenance. The page displays **View office record**, including when phone and website are absent. Failed identity resolution is explicit. Database read errors propagate.

The existing office detail projection now exposes the native office identity, office type, agency, locator source ID, source hash, and raw source provenance. Resource Record displays these alongside the existing provenance fields; absent source provenance is shown as **Not recorded**. Its existing Commit to Case action retains the native office ID and now carries the `gov_offices` source lane.

This is a read-only projection over existing records. It does not create resource entities, crosswalk rows, inferred program relationships, source registrations, or duplicated registries. It does not modify contact fields, office roles, or verification status. Legacy domain/name/telephone candidates do not qualify for this link.

## Live evidence

Read-only Supabase project `wepxlinwbjrkqdzkqpar`, observed at **2026-09-12 06:37:23.3506+00**:

| Check | Count |
| --- | ---: |
| Published `resource_office_xwalk` rows | 0 |
| Active `gov_offices` records | 3,423 |
| Legacy resource-catalog office identities where `resource_uid = 'govoff:' || source_id` | 3,423 |
| Current resource/program catalog office references | 0 |
| Discovery records in the exact `gov_offices` source lane | 3,423 |
| Discovery identities resolving to an active native office ID accepted by the existing detail API | 3,423 |
| Unresolved discovery office identities | 0 |

A second read at **2026-09-12 06:39:50.211669+00** confirmed all 3,423 active offices have a locator source ID and source hash; 2,241 have a stored provenance narrative and 1,182 have `provenance IS NULL`. The projection preserves these nulls rather than supplying a narrative. An available native link proves current identity resolution, not complete provenance or substantive verification.

Example: discovery source `gof_07c46cecd10c4191006b` resolves to Everett Vet Center, locator source `va_vha_facilities_arcgis`, hash `6a262fa0`. The stored source narrative identifies the VA facility source and says its phone field is pending. The new action reaches this existing native record without substituting a resource or program ID.

## Validation

- Focused discovery, resource drill-through, office-map, and rendered office-action tests pass. Cases cover exact source lanes, native IDs, absence/supersession, cross-lane lookalikes, malformed candidate IDs, missing provenance, read failures, daily discovery, and opening an office with no contact fields.
- TypeScript check passes.
- Existing native detail routing remains `/resource/:id` → `resourceDirectory.detail` → `getGovOfficeDetail` for accepted `gof_…` IDs.

## Remaining work

The historical 873 crosswalk candidates and 656 source identities still need recoverable source identity and matching evidence before publication. Their legacy numeric IDs do not identify current canonical resources; name/domain/phone similarity alone is insufficient. No candidate is promoted by this change. The current resource/program catalog still has no native office references; this patch closes the existing office-discovery consumer path only.

No production mutation or deployment was performed from this worktree. Release status belongs to the integrating PR and deployment checks.
