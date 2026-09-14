# Enforcement parent-model and step repair

The inspected public pathway reader returned 36 current objects, all individual process steps. It did not return Colorado's stored `state_wage_co` model. Its agency and jurisdiction existed in `enforcement_pathway_models`, but its source has no `process_steps`.

This change reads valid parent model references alongside current source objects. It preserves the existing model UUIDs and pathway IDs. A row is a model only when its explicit `pathway_id` equals its original record's ID; the legacy container rows are excluded. Stored references do not become operational legal records or case-routable action paths.

## Exact source binding

The source artifact is `Everything backbone related/enforcement_pathway_models_complete(1).json`, SHA-256 `900f6f9934285346f360da45de862a1a1a1388ec3b30374601ef924b571d102f`.

Eleven parent records were individually inspected and compared to the stored original JSON: Colorado and the ten parents of the existing 36 process-step objects. `server/enforcement-pathway-source-review.ts` records their existing IDs, source positions, jurisdiction and content fingerprints. These fingerprints attest content identity, not the validity of legal assertions.

A child joins a parent only when all of these match:

- Existing model UUID, pathway ID, jurisdiction and source context.
- Full reviewed parent content fingerprint, excluding only the import-added `_key`.
- Current child's artifact path, complete source-file hash and exact JSON location.
- Full child payload equality with the parent's array member.
- Exactly one current candidate for that member.

Changed or ambiguous candidates remain visible as unlinked source objects. Legacy metadata hashes are not relabeled as file hashes. The other stored models remain explicitly unverified references with unknown source-version identity.

## Both reader and consuming surfaces

`enforcementIntel.get_enforcement_pathway` emits an owned snake_case contract. Its boundary accepts legacy camelCase filter fields, normalizes them immediately, and does not re-emit them. The page and case-context consumers move to the new contract together. Existing external React, tRPC, browser, Node and driver API identifiers remain unchanged.

`/enforcement-pathway?pathway_id=state_wage_co&jurisdiction=CO` reaches the Colorado reference. A current child object's ID can also select its exact linked parent. Full agency names are usable without fabricating agency abbreviations. All supplied filters must match; jurisdiction is applied before the response limit.

The page distinguishes parent models from unlinked steps, preserves source array order, and explicitly identifies models without recorded steps. It does not generate a substitute sequence. Dedicated source timelines, action arrays, remedy amounts, deadline rules and success-rate fields are not emitted. Source descriptions remain visibly unverified source text, including when they contain legal assertions. `CaseActionPaths` and its existing routing gates are unchanged.

## Verification and limits

The revised read-only SQL ran against the inspected Supabase schema and returned 63 valid model references, 36 current steps and 43 agency-form associations. Passing that snapshot through the new DTO produced 63 models, 36 exact child links, zero unlinked steps and 11 reviewed parent bindings. Colorado retained UUID `e27c8480-7ef3-4bc2-a9a0-75be3cf29198`, its agency and jurisdiction, and zero recorded steps.

Twenty-two focused reader, context-boundary and rendered-page tests passed. Fifteen adjacent case-context tests passed. Full `tsc --noEmit` passed. Tests include changed source hashes, changed paths/payloads, changed parents, ambiguous children, exclusion of container pseudo-models, jurisdiction mismatch, and Colorado's absent sequence.

No production data was written. The read snapshot does not prove current legal accuracy, case eligibility, intake availability, or completion of the remaining document review. Agency/workflow object classes are not falsely claimed as covered by this model reader. Colorado still needs a reviewed claim/domain association and a verified procedural source before it can supply case-specific action guidance.
