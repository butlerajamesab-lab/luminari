# Resource reader continuity and source access

Base: `3ee351a9dfe7adfff6fc461398dec30eba59fba8`. Read-only live recheck on September 14/15, 2026; no production mutation in this track.

The resource detail query omitted the category expression used in search. This change applies the same expression in both readers. It also incorporates the service-level VI/USVI normalization from PR #612, including summary totals and filters; the raw source jurisdiction remains separately available. URL input accepts the historical USVI alias and normalizes it at the boundary.

Resource Record now opens the original document when the catalog-bound artifact is in a public bucket, exists in Storage, has the expected recorded hash and has the same observed Storage update time. The link is an ordinary public object URL. No service key, signed URL or private case/Batch document access is added. Missing, changed and restricted sources have explicit unavailable states. The page displays the source filename, source locator and recorded document hash; source attachment is not described as independent factual verification.

The directory's address count now says “source address context,” matching the existing unverified location projection. Exact map eligibility is unchanged.

## Colorado source review

The downloaded original `luminari-colorado-ENRICHED-PASS2-2026.docx` is 27,818 bytes and hashes to `8b37624175d4b9d6f31c8d207ac1ffb0a4c2648c479cfaba0c1405600e3fb24d`, matching the current source artifact and the 24 affected resource candidates. Each of the 24 entries was read as a bounded source block. The accompanying JSON records exact current identities, before fields, proposed literal fields, source paragraph/XPath spans and separate role/category decisions.

This restores transcription evidence, not external factual verification. The source itself contains a WIC `undefined` contact field, combined institution names, questionable service-area/hotline assertions and dated eligibility/legal text. Colorado Legal Services appears in two different service contexts; these references are not automatically merged. The IHS office's physical Arizona address must remain distinct from its source-claimed Colorado service area. AS OPAD/ASG-HR shared-phone identity remains unresolved.

The existing whole-document reviewed overlay activation requires all pages and expected records plus corresponding action bindings. A bounded resource review does not satisfy that gate. The correction packet does not activate that whole-document overlay or alter the legacy entity/publication tables. A parallel correction track supplies a narrow append-only transcription ledger and `v_lighthouse_resource_program_transcribed_v1`; summary, search and detail all consume that wrapper. The original source name and the correction receipt remain available, and verification/admission states are unchanged. Category adjudication remains a separate append-only relation, bound to the exact source/version and original category/layer. It carries 24 primary classifications from individually reviewed source headings and 19 secondary memberships explicitly marked as interpretations of quoted services. Denver Rescue Mission now appears under Housing and Food & Nutrition in both list filters and detail, while its original stored category remains available in provenance. The category projection cannot change transcription, publication, readiness or legal verification fields.

## Overlapping work inspected

- PR #612: reused supported alias handling; its three review threads were resolved. Its unrelated Civic Map/CDN changes are outside this patch.
- PR #646: inspected current DOCX audit/repair tooling and empty review-thread list. It does not supply a runtime per-record correction overlay.
- PR #523: reviewed the explicit positive verification allowlist and resolved review finding. This patch does not broaden person-facing eligibility or alter its enforcement reader.

## Validation

Seven focused suites, 35 tests, pass, including runtime search/detail identity/category/location continuity and source access restrictions. The source lookup SQL was executed read-only against the live Denver artifact and returned a public bucket, existing object and matching observed update timestamps. Original bytes were independently downloaded and hash-checked. Full TypeScript validation initially encountered a transient missing Axios dependency while the shared dependency installation was in progress; final combined validation is owned by the integration track.

Owned names touched in the active service were normalized to snake_case, and import consumers were updated. The old `resourceEntityId` request shape is accepted only in the tRPC boundary transform; the updated page sends `resource_entity_id`. Vendor APIs such as `URL`, `getTime`, `useQuery`, `refetchOnWindowFocus`, and React component props retain their library-required names. Existing public router endpoint names remain compatibility boundaries for current clients.

## Deployment dependency and physical location boundary

The reader integration requires the resource transcription migration (installed by the integration track as `20260914215454_resource_transcription_correction_ledger.sql`) followed by the resource category review migration and their guarded 24-record receipt transactions before deployment. The category migration file timestamp must follow the installed transcription migration. The application transaction checks all current bindings and original category/layer values, exact stored receipts, active memberships, and preservation of every transcribed base field. Do not deploy a reader pointing to an absent relation.

A full source address is not parsed into structured geography. Its nested `state` remains null, rather than copying service jurisdiction into physical location. This prevents the reviewed Phoenix IHS address in Arizona from acquiring Colorado as its physical state. Top-level service jurisdiction still normalizes VI/USVI. The complete address remains visible, and exact map eligibility remains false.

PR #403 was also inspected: it expands an older resource reader by admitting source-attached/staging provenance alongside promoted/verified states and changes knowledge-ingestion SQL handling. None of that broad eligibility expansion is included here; its review-thread list was empty at retrieval.

The source access timestamp check is performed in PostgreSQL at full stored precision (`storage_version_matches`), as well as checking timestamp presence in the server. This confirms an unchanged recorded Storage observation, not a fresh per-request byte hash.

## Category membership validation

The final six focused suites pass 31 tests, and the complete TypeScript check passes. The new PostgreSQL suite executes the guarded application transaction, identical replay, rejection of superseded replay, and actual directory summary, category search and detail queries against all 24 exact source-bound reviewed identities. It verifies 43 category memberships while resource and jurisdiction totals remain 24, and checks append-only permissions, conflicting replay, stale source/category/readiness, and retraction. Source headings and all 19 secondary service quotes were independently checked against the exact DOCX XPath/paragraphs. Category totals intentionally overlap; the directory explains this and each detail exposes its quoted section and interpretation evidence. This is a bounded placement correction, not certification of the remaining nationwide corpus.

Independent joint validation also applied both schema migrations and both reviewed-data transactions against the 24 retrieved current rows: all 144 literal transcription changes, 24 primary memberships and 19 secondary memberships were present, with all other fields, identities, admission states and transcription receipts preserved. The category application script is `supabase/reviewed-data/20260914_colorado_resource_categories.sql`; no production mutation was performed by this track.

## Installed Colorado category receipts

Production migration `20260914220207_resource_category_review_ledger.sql` is byte-identical to the reviewed prepared migration. Its guarded application returned 24 stored receipts, 24 currently classified resources and 43 category memberships (24 primary plus 19 separately identified service interpretations). All 24 transcription receipts and all other source/admission fields remained intact. This database activation precedes the application release; it does not by itself establish public frontend verification.
