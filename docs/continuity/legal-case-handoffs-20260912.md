# Legal/case handoff integration — September 12, 2026

This completes the runtime handoffs proposed in PR #636 on top of #634, #635, #638, #639, and #640. The source-authority reader and catalog added by #639 remain the shared implementation. Office detail routing and workbook/parser changes are preserved.

## Corrected handoffs

- Public source detail binds the recorded candidate hash, artifact, run, locator, and original source hash. Existing reference IDs remain intact; empty identities never broaden into list queries.
- Statute/case-law readers retain original IDs, separate runtime identity, and eligible publication status. Dedupe uses declared identity rather than a title/citation guess. Stats count the actual combined list query; missing counts fail visibly. New statistics fields are snake_case, with both Legal Library consumers updated.
- Source-authority, runtime-statute, and case-law attachments resolve exactly before saving into the existing case-state reference array. Control Room can inspect, open, and remove them. Atomic append/removal preserves other entries and existing numeric history. Mutation completion refreshes all affected caches.
- New case context uses public.cases, the established owner/collaborator access gate, and exact case/intake identity bridges. Sealed action-path outputs retain hashes, source IDs, and projection currentness. The separate legacy registry case namespace is never joined by coincident numeric IDs; both context endpoints use explicit workspace identities. Both context APIs and Sunam dispatch receive caller identity, and other legacy case service tools now verify ownership before accessing private case data.
- Case-context browsing is scoped and labeled. Empty search results remain empty. Registry workflows use declared claim aliases and jurisdiction. Deadline rules use the declared claim-domain mapping, stay domain candidates, and produce no calculated dates. Partial read failures remain distinct from successful empty results.
- The integration ledger measures actual public legal-reader visibility, keeps held counts separate, and labels unmeasured consumers. It remains under the existing admin/system-read route boundary.

## Evidence collected before publication

Read-only emitted queries executed successfully against Lighthouse: 1,940 statute/compatibility rows; 292 case-law/compatibility rows; 245 enforcement records; 60 weak-joint records; four contradiction records. These counts describe separate reader collections and must not be summed as unique legal entities.

The shared current source-authority reader returned 1,939 source references: 1,762 ready to view, 177 held (121 jurisdiction conflicts, 56 unresolved jurisdiction). A WA/labor text query successfully returned an empty matching set. SQL fixture evaluation confirmed removal of one namespaced reference while preserving unrelated strings and a historical numeric entry, followed by append of the new reference.

Local verification includes public-case ownership, namespace separation, exact/malformed/ambiguous references, pagination after the final page, source hashes, empty scope, declared deadline-domain semantics, partial failures, source catalog rendering, and cache wiring. The integrated full suite initially exposed one stale static assertion about the relocated count conversion; it was corrected to follow validated counting. TypeScript's CI configuration, production client/server builds, health/auth contracts, and the owned-contract guard pass. Final CI results and deployment commit are recorded by GitHub and Render; this document alone does not certify deployment.

## Limits

No production data, source publication state, historical receipt, or schema was modified by this repair. No real case attachment was created as a deployment test. Source legal accuracy, source promotion, statistical correlation validity, private Batch execution, and corpus replay remain separately governed operations. Browser checks of public records do not constitute authenticated case-workflow acceptance.
