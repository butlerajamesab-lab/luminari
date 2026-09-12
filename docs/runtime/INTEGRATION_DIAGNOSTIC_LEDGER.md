# Integration diagnostic ledger and case context

The ledger fixture is `config/integration-diagnostic-ledger-v1.json`, served under the existing administrator/system-read authentication for `/api/system/integration-ledger`. It records source families, relation counts, declared consumers, and explicit graph/link coverage. A relation count is not a distinct entity count or evidence that a UI workflow ran.

Legal visibility is measured through `read_current_legal_authorities`, the existing reader shared by `canonicalCore.legalAuthorities` and Legal Library's Source Authorities tab (#639). Its inventory distinguishes ready references from held references. Readiness describes typed/jurisdiction-resolved source records; it does not verify legal accuracy or applicability. Held records retain their history and are not exposed as eligible source details. Statute/case-law compatibility readers remain separate and keep their original IDs.

A mismatch requires a successful zero result from the public reader while catalog-ready records exist. Failed counts remain null. Resource/workflow UI coverage remains `not_measured` until exercised. Missing relations and failed queries remain distinguishable from successful empty reads. The new ledger queries have acquisition/execution time limits; other pre-existing administrative endpoints are outside this change.

## Case identity and authorization

`luminari.get_action_context` and the Sunam `get_case_action_context` tool use **public.cases** IDs, matching `case_state`, `case_resource_links`, and `signal_artifact_case_links_v1`. The caller's authenticated user ID is passed outside tool arguments, and ownership is checked before reading private context. The legacy `getContext` uses its separate `luminari_cases` namespace and now requires ownership too. An unavailable legacy relation stays an error; equal numeric IDs never create a bridge.

Context surfaces have `items`, `availability`, `scope`, `returned`, and `has_more`. A failed surface does not erase successful surfaces. Browser lookup requires an explicit requested jurisdiction or the saved case-state jurisdiction; empty text results are not broadened. Search results are labeled browsing context, not case relationships.

Workflow references reuse Intake's governed registry and exact declared jurisdiction/claim bindings, including its explicit workflow aliases. Deadline references use the registry's claim-to-domain mapping and are labeled `domain_candidate_not_claim_specific`; this reader calculates no filing dates. Workflow steps are never counted as deadlines. Enforcement references require exact jurisdiction and the case's declared pipeline category. Signals are limited to existing reviewer-authored case links and retain their relationship, source snapshot, and hash.

## Legal attachment lifecycle

Existing `case_state.committed_statute_ids` holds legal references; no parallel attachment table is introduced. Bare statute IDs stay compatible. Namespaced `runtime_statute:`, `case_law:`, and `legal_authority:` references are resolved exactly before a new attachment is saved. Empty or ambiguous identities cannot become browse queries. Source detail joins bind the original artifact, candidate hash, run, source locator, and source hash.

Control Room lists saved references, opens the exact source through Legal Library, and removes the complete saved reference. Unavailable or no-longer-eligible records remain visible as saved unresolved references. Append/removal queries preserve other entries atomically. Mutations invalidate the commitment, reference-list, and case-context caches.

## Verification boundaries

Regression coverage includes denied ownership, distinct case namespaces, malformed/ambiguous identities, reference round trips, preservation of partial failures, empty searches, exact scope, deadline domain semantics, held-publication counts, and pagination beyond the final page. Actual emitted legal queries are captured by the opt-in `LEGAL_QUERY_CAPTURE_PATH` fixture and can be executed read-only against the live schema. Build/test results and deployed checks are recorded separately in the dated release evidence. Tests are not proof of source legal accuracy, canonical promotion, or statistical correlation validity.
