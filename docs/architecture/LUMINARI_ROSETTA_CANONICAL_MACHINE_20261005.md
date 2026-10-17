# Luminari / Rosetta Canonical Machine

**Status:** architecture continuity record  
**Snapshot date:** 2026-10-05  
**Scope:** Docket Room, Lighthouse worker plane, Rosetta, Civic Genome, Prism, public surfaces, individual/private intake boundary  
**Change authority:** documentation only. This file does not authorize code, schema, worker, migration, provider, queue, engine, publication, or production changes.

## 0. Retrieval rule

This file exists so the architecture does not have to be reconstructed from memory.

When answering questions about how the legislative machine works:

1. Start from this document.
2. Treat the ownership boundaries and execution order below as the canonical architecture model unless later governed work explicitly replaces them.
3. Re-verify all **dynamic state** before making a current operational claim: deployment SHAs, queue counts, cron jobs, generation targets, production counts, failures, active workers, and promoted engine state can change.
4. Do not infer a new architecture from a migration name, PR title, old campaign, historical engine, stale worker, or UI label.
5. Preserve the distinction between:
   - installed processor,
   - actively executing processor,
   - promoted/current consumer generation.
6. Never collapse historical Rosetta "execution lanes" into the current Lighthouse worker lanes. They are different concepts.
7. Never route around Docket current-authority lineage to feed Rosetta.
8. Never let a downstream surface overwrite upstream truth.

The governing rule is: **one canonical truth per concept, explicit ownership, immutable provenance, no silent fallback.**

---

# 1. Whole-machine topology

```text
PUBLIC LEGISLATIVE SIDE

LegiScan / official provider
        │
        ▼
┌───────────────────────────────────────┐
│ 1. DOCKET ROOM / SOURCE OBSERVATION  │
│ Lighthouse / Luminari                │
│ Supabase: wepxlinwbjrkqdzkqpar       │
└──────────────────┬────────────────────┘
                   │
                   │ immutable observations + versions
                   ▼
 Docket state/session cache
        ↓
 bill-detail observation
        ↓
 docket_bill_source_document
        ↓
 docket_bill_source_document_observation
        ↓
 Civic Genome bill/version registration
        ↓
 predecessor/version graph
        ↓
 ONE current Docket authority leaf
                   │
                   ▼
┌───────────────────────────────────────┐
│ 2. LIGHTHOUSE ROSETTA WORKER PLANE   │
│ dedicated background runtime         │
└──────────────────┬────────────────────┘
                   │
                   │ exact source only
                   ▼
 legislative-version queue
        ↓
 preserve/fetch exact source
        ↓
 register exact source with Rosetta
                   │
                   │ key + hashes + provenance
                   ▼
┌───────────────────────────────────────┐
│ 3. ROSETTA SOURCE / EXECUTION PLANE  │
│ Separate Rosetta Supabase            │
│ kjzytnzkkdpdxtqtjlew                 │
└──────────────────┬────────────────────┘
                   │
                   ▼
 source_document
        ↓
 source_document_content
        ↓
 replay/source registry + Docket authority receipt
        ↓
 deterministic decomposition
        ↓
 validation / terminal receipt
        ↓
 current result projection
                   │
                   │ exact key + exact hash
                   ▼
┌───────────────────────────────────────┐
│ 4. CIVIC GENOME CONSUMPTION PLANE    │
│ back in Lighthouse                   │
└──────────────────┬────────────────────┘
                   │
                   ▼
 source binding
        ↓
 generation binding
        ↓
 structural DNA assembly
        ↓
 family resolution
        ↓
 traits / relationships / events / lineage
        ↓
 Prism verification
                   │
                   ▼
┌───────────────────────────────────────┐
│ 5. SURFACES                          │
│ Rosetta = decomposition/proof        │
│ Luminari = civic/public experience   │
└───────────────────────────────────────┘
```

The systems do not own each other's truth.

---

# 2. Ownership boundaries

## Docket Room

**Role:** source observation and legislative current-authority selection.

Docket owns:

- provider/session observation;
- bill-detail observation;
- official source-document identity;
- version preservation;
- currentness and lineage inputs;
- the current Docket authority leaf.

Docket does **not** own:

- Rosetta engine generation;
- decomposition;
- Prism verification;
- Civic Genome family identity;
- Rosetta publication state.

Canonical state/federal route:

```text
provider observation
→ Docket state/session cache
→ bill detail
→ Docket bill source documents
→ Civic Genome bill/version registration
→ version lineage / predecessor graph
→ current Docket authority leaf
→ ordinary legislative-version queue
→ Rosetta main entrance
```

Do not:

- collapse legitimate successive bill versions;
- deduplicate version history merely to maintain the 100-current-bill acquisition window;
- add a second current-authority selector;
- route directly around Docket lineage into Rosetta;
- treat a historical Rosetta campaign as current-Docket proof.

Provider differences belong at acquisition. They should not create separate Rosetta engines.

## Civic Genome

**Role:** legislative identity and civic structural state.

Civic Genome begins **before** Rosetta and continues **after** Rosetta.

Before Rosetta it owns:

- bill identity;
- bill-version identity;
- version ordering;
- predecessor/currentness lineage;
- source-document binding to the legislative object.

After Rosetta it owns:

- explicit Rosetta source binding;
- Rosetta generation binding;
- structural DNA assembly;
- family resolution;
- traits;
- relationships;
- events;
- lineage;
- momentum and Genome projections.

Civic Genome does not own Rosetta's decomposition truth.

## Rosetta

**Role:** deterministic source preservation, law decomposition, provenance and execution receipts.

Rosetta owns:

- exact registered source content;
- source hashes and identity receipts;
- admitted source registry identity;
- engine/rules/configuration identity;
- deterministic decomposition;
- validation evidence;
- terminal execution evidence;
- current result read models;
- operator/proof surfaces.

Rosetta does not own:

- bill family identity;
- legislative currentness;
- Civic Genome relationship identity;
- Prism's independent verification finding.

## Prism

**Role:** deterministic independent verification.

Prism:

- independently replays immutable Rosetta-bound source evidence;
- verifies declared structural claims;
- records support, contradiction, missing evidence and unresolved conditions;
- does not rewrite Rosetta decomposition;
- does not rewrite Civic Genome identity.

## Lighthouse / Luminari

**Role:** governed civic-facing control and presentation layer.

Lighthouse presents and coordinates upstream truth. It does not silently redefine it.

Public doctrine:

- Rosetta owns deterministic law decomposition and source receipts.
- Civic Genome owns legislative identity, version lineage, families, events and structural traits.
- Prism owns deterministic verification receipts.
- Atlas owns signal correlation.
- Kaleidoscope owns state-response projection.
- Lighthouse presents governed outputs without silently overwriting upstream truth.

---

# 3. The four current Lighthouse worker lanes

The dedicated legislative/background runtime has four distinct operational lanes.

## Lane 1 — Docket lane

Starts:

- Docket state-cache warmer;
- Docket bill activation queue worker.

Purpose:

- observe current provider state;
- obtain/maintain exact Docket authority inputs;
- enqueue eligible bill/version work.

## Lane 2 — legislative-version lane

Starts:

- legislative-version queue worker.

Purpose:

- take the exact Docket/Civic Genome version toward Rosetta;
- preserve exact source;
- register exact Rosetta source content;
- register Docket operational authority where applicable;
- stop before inventing a result.

## Lane 3 — current-result observation lane

Starts:

- current-result observation worker.

Purpose:

- observe Rosetta's result for the exact immutable selector;
- reconnect the result to the waiting Genome version;
- continue assembly only when the exact result exists.

This is a consumer/observer. It does not launch an alternate Rosetta engine.

## Lane 4 — Prism-Rosetta verification lane

Starts:

- Prism-Rosetta queue worker.

Purpose:

- independently verify assembled Rosetta-derived Genome evidence;
- record deterministic verification receipts.

### Naming warning

Historical Rosetta class-stage processing also used multiple parallel `lane:N` execution shards.

Those historical shards are **not** the four Lighthouse worker lanes above.

Never use "four lanes" without establishing which meaning is intended.

---

# 4. Exact Lighthouse → Rosetta handoff

The modern legislative pipeline does **not** select a Rosetta engine from Lighthouse.

Current shape:

```text
exact Civic Genome bill version
↓
ensure exact Rosetta source_document
↓
extract exact Docket source
↓
public.rosetta_register_source_content_v1(...)
↓
public.rosetta_admit_docket_operational_source_v1(...) when operational authority applies
↓
persist source-ingested/binding state
↓
wait for Rosetta-owned processing
↓
read exact current result by source key + content hash
```

The identity contract is exact:

- `source_document_key`
- `source_content_hash`
- provider/source provenance
- immutable source-content identity.

Lighthouse must not say "run the latest Rosetta."

Rosetta owns routing and execution.

---

# 5. Rosetta source identity sits below engine generation

Rosetta's canonical source substrate is generation-independent.

Important source objects:

- `public.corpus`
- `public.source_document`
- `public.source_document_content`

`source_document_content` stores:

- source-content UUID;
- source-document ID;
- source version;
- source URL;
- media type;
- exact source text;
- source-content SHA-256;
- source-byte hash;
- provider hash;
- source-identity hash;
- source metadata.

The source-content row is immutable. Production has a mutation-rejection trigger preventing update/delete.

The consequences are fundamental:

```text
SOURCE IDENTITY
      ↓
independent of
      ↓
V9 / R6 / 2.5.11 / future engine
```

An engine generation consumes an exact source. The engine does not define the source's identity.

---

# 6. Docket operational admission inside Rosetta

For the current Docket authority path, Rosetta's admission RPC:

`public.rosetta_admit_docket_operational_source_v1(...)`

verifies:

- activation identity;
- state/session;
- source bill ID;
- source-document key;
- provider document ID;
- provider hash/date;
- exact source-content hash;
- Docket authority receipt hash;
- Docket cache/detail observation times;
- current Docket authority epoch.

It then:

1. verifies exact preserved source bytes/text;
2. mirrors the exact preserved source into the controlled Rosetta execution substrate;
3. registers it in the Rosetta replay/source registry;
4. appends an exact Docket operational-authority receipt.

Docket selects authoritative source state.

Docket does not select the Rosetta engine generation.

---

# 7. Rosetta currently contains two result/execution planes

This is a critical continuity fact.

## Plane A — promoted/current-generation five-layer Rosetta

The formal promoted/current generation remains the historic five-layer generation until explicitly changed by Rosetta's promotion contract.

At the 2026-10-05 snapshot, Rosetta's formal current-generation receipt reported:

```text
engine_version:
rosetta-v3-deterministic-sql-2.5.11

rule_set_version:
rosetta-five-layer-structural-correctness-2.5.11

rule_manifest_hash:
3602eb80fee71a4009bf7a04c521fec62e2d1f17f8ea5b027500905cd8366639
```

Civic Genome's stored current generation target matched that receipt at the snapshot.

Current consumer contracts include:

- `public.rosetta_current_source_result_v1`
- `public.rosetta_public_current_docket_result_v1`

These are the exact-result contracts consumed by the current Civic Genome path.

## Plane B — rule-line V9 / V10-R6 candidate family

The newer rule-line result storage includes:

- `rosetta_rule_out.decomposition`
- `rosetta_rule_out.decomposition_section`
- `rosetta_rule_out.decomposition_unit`
- rule-line review/read functions.

V9 identifier:

`rosetta-rule-ref-v9`

The currently installed V10 revision-6 candidate is an upstream operative-text/preflight gate that preserves the downstream V9/V7 semantic decomposition model unless its governed candidate explicitly changes that contract.

### Critical rule

Do not treat presence of V9/R6 SQL/functions as a promotion event.

The rule-line plane and the formal current-generation plane are not the same thing merely because both exist in the same Rosetta project.

---

# 8. Installed ≠ executing ≠ promoted

These are three separate states.

## Installed processor

The functions/schema exist in the database or deployment.

## Executing processor

A worker, governed runner, authorized queue, cron launch or explicit operator action is actually invoking that processor on sources.

## Promoted/current consumer generation

The system's governed current-generation/promotion contract declares that generation authoritative for current consumers, and downstream generation targets have reconciled to it.

Therefore:

```text
installed
   ≠
executing
   ≠
promoted/current
```

A migration does not prove execution.

Execution does not prove promotion.

A PR title does not prove either.

A UI label does not prove either.

---

# 9. Current-result consumption contract

Lighthouse/Civic Genome reads Rosetta by exact immutable selector.

Current reader:

`GET /api/public/current-docket-result`

Lighthouse sends:

- exact `source_document_key`;
- exact `source_content_hash`.

Rosetta reads both:

- `rosetta_current_source_result_v1`;
- `rosetta_public_current_docket_result_v1`.

Identity mismatch fails.

A read must not:

- repair processing;
- enqueue work;
- retry execution;
- choose another source;
- fall back to an ancestor success;
- silently select a different engine.

---

# 10. Current execution gap observed on 2026-10-05

This section is **dynamic operational state**, not a permanent architectural rule.

At the snapshot:

1. Source registration was active as a distinct operation.
2. Historical Rosetta class-stage jobs had launch receipts, including current-Docket canaries.
3. Those historical class-stage cron jobs were no longer active.
4. The active Rosetta cron job was a bounded current-Docket **read-model refresh**.
5. That refresh explicitly does not execute source processing.
6. The newer rule-line V9/R6 plane did not have a continuously active production executor visible in the inspected runtime.
7. Therefore the intended handoff:

```text
register exact source
→ Rosetta-owned processing
→ result appears
→ current-result observer consumes it
```

contained a live execution discontinuity between source admission and rule-line processing.

This must be re-verified before making any later claim that the gap still exists.

Do not "repair" this gap by adding a fallback or routing around the canonical source/authority contract.

---

# 11. Generation upgrade machinery

Luminari already contains generation-reconciliation machinery.

The intended model is:

```text
observe Rosetta current-generation receipt
↓
persist Civic Genome generation target
↓
discover exact sources bound to a different generation
↓
enqueue exact-source generation replay
↓
obtain governed Rosetta receipt
↓
update exact version binding
↓
reassemble Genome structural DNA
↓
continue downstream verification
```

Relevant concepts include:

- Rosetta generation target;
- generation activation queue;
- generation upgrade queue;
- generation binding;
- source binding.

A generation upgrade is therefore a **reconciliation of exact-source evidence**, not a rebuild of bill identity.

Dynamic warning: whether the generation-sync/upgrade loops are active in the deployed worker must be re-verified from the actual runtime before relying on them.

---

# 12. Prism boundary

The sequence is:

```text
Rosetta decomposition
↓
Civic Genome assembly
↓
Prism verification
```

Interpretation:

- Rosetta answers: what structure did the deterministic decomposition produce?
- Civic Genome answers: what legislative object/version/family does that exact structure belong to?
- Prism answers: does the claimed structure survive independent deterministic verification?

Prism may contradict or hold.

Prism may not rewrite Rosetta output to make it pass.

---

# 13. Public surfaces

## Rosetta standalone

Rosetta standalone is the decomposition/proof/operator surface.

It may expose:

- law review;
- source/detail views;
- processing evidence;
- engine comparison;
- proof;
- governed operator intake.

## Lighthouse / Luminari

Luminari owns the civic-facing environment:

- Docket Room;
- Living Civic Genome;
- Lighthouse;
- Viewfinder;
- resource/navigation surfaces;
- downstream governed views.

Luminari references Rosetta evidence.

It does not become Rosetta's canonical owner.

---

# 14. Individual/private intake boundary

The old personal/operator intake front door still exists in Rosetta as an upload/intake route.

The surviving route:

`POST /api/intake`

can:

1. accept a file;
2. parse/extract text;
3. hash exact bytes and extracted text;
4. create/reuse source identity;
5. preserve source metadata;
6. invoke an older extraction path.

What is **not** represented in the current Rosetta core source substrate is a complete modern user-ownership boundary such as:

- owner user identity;
- private/public visibility;
- user-scoped corpus ownership;
- share grants;
- end-user canonical access controls.

The platform doctrine already requires user-supplied sources and their derivatives to remain user-owned.

Therefore the missing forward-port is:

> preserve the individual-owned entrance and its ownership/visibility contract while routing the exact source into the same modern canonical Rosetta execution path.

It is **not** a request to invent a separate private decomposition engine.

Do not implement this boundary merely by exposing the existing operator route to end users.

---

# 15. Current jurisdiction architecture

State/federal canonical path:

- Federal `US`;
- 50 states;
- DC;
- LegiScan-backed current state/federal acquisition.

Seattle municipal is presently a separate Legistar-backed live path.

County and Tribal are not yet connected to the same canonical persisted legislative substrate.

Future adapters may differ at acquisition, but must converge on one normalized downstream identity/provenance/currentness/handoff model before Rosetta.

---

# 16. Testing rule for a new Rosetta candidate

A candidate-engine test must state exactly what it proves.

For the current V10/R6 candidate, an isolated engine test can prove:

```text
preserved exact production source
→ R6/V10 preflight
→ operative-text qualification/transformation
→ existing downstream semantic decomposition
→ candidate receipts/output
```

That test does **not by itself** prove:

```text
Docket
→ automatic candidate execution
→ current-result consumer cutover
→ Civic Genome generation reconciliation
→ Prism
→ Lighthouse publication
```

Those are separate integration/promotion obligations.

Engine quality testing must not be confused with production promotion.

---

# 17. No-fallback doctrine

For this machine:

- no secondary hidden source route;
- no alternate current-authority selector;
- no "latest successful engine" fallback;
- no ancestor-success fallback when a descendant is current/pending;
- no silent engine substitution;
- no silent source substitution;
- no silent overwrite of historical versions;
- no semantic inference presented as source fact;
- no retry that invents certainty after an ambiguous transport outcome.

Unknown remains unknown.

Held remains held.

Failed remains failed.

A new authorized remediation is a distinct governed event.

---

# 18. Determinism and replay doctrine

The machine is deterministic only if:

1. exact source identity is stable;
2. exact generation/configuration is stable;
3. rules and manifests are pinned;
4. the same source + same governed generation can be replayed;
5. output evidence is independently comparable;
6. distinct executions have distinct execution identities while preserving identical deterministic content where expected;
7. provenance survives every handoff.

A "pass" is not equivalent to a high-quality decomposition.

A throughput metric is not a semantic-quality proof.

Certification/receipt state must not be used to hide decomposition defects.

---

# 19. Canonical invariants

These are the durable invariants of the architecture.

1. **Docket chooses the authoritative legislative source, not the engine.**
2. **Rosetta preserves and decomposes; it does not own bill family identity.**
3. **Civic Genome owns legislative identity, version lineage, family and civic structural state; it does not become the Rosetta parser.**
4. **Prism verifies; it does not rewrite Rosetta or Genome truth.**
5. **Lighthouse presents governed outputs; presentation is not canonical ownership.**
6. **Source identity exists below every engine generation.**
7. **Installed generation ≠ executing generation ≠ promoted/current consumer generation.**
8. **A worker lane is not an engine generation.**
9. **Historical Rosetta execution shards are not the four current Lighthouse worker lanes.**
10. **Docket/public intake and individual/private intake are provenance/ownership distinctions, not separate decomposition engines.**
11. **Every observed legal version remains separately addressable.**
12. **No source, version, finding, receipt, or contradiction is silently overwritten.**
13. **Exact hashes and explicit receipts cross system boundaries.**
14. **Unknown and unresolved states remain explicit.**
15. **No fallback route may bypass a failed canonical path.**

---

# 20. Retrieval anchors

When re-verifying the machine, begin with these current code surfaces.

## Luminari repository

- `server/prism-rosetta-worker.ts`
- `server/services/prism-rosetta-startup-activation.ts`
- `server/civic-genome-legislative-version-pipeline.ts`
- `server/civic-genome-legislative-version-queue-worker.ts`
- `server/civic-genome-rosetta-evaluation.ts`
- `server/civic-genome-rosetta-assembly.ts`
- `server/civic-genome-rosetta-generation-target-sync.ts`
- `server/civic-genome-rosetta-generation-upgrade-worker.ts`
- `server/civic-genome-operating-contracts.ts`
- `docs/DOCKET_ROOM_COVERAGE_AND_UNIFICATION_BACKLOG_20261001.md`
- `docs/constitutional/LUMINARI_DATA_SOVEREIGNTY_CONTRACT_v1.md`
- `client/public/llms.txt`

## Rosetta repository

- `server.js`
- `lib/current-docket-result.js`
- `docs/current-source-boundary.md`
- `03_activation/processing/current-docket/README.md`
- `03_activation/processing/README.md`
- `scripts/class-stage-worker.mjs`
- current rule-line migrations and runner
- current generation/promotion RPCs

## Databases

Luminari/Lighthouse:

`wepxlinwbjrkqdzkqpar`

Rosetta:

`kjzytnzkkdpdxtqtjlew`

Database state is evidence, not architecture documentation. Re-query it for current operational claims.

---

# 21. Change-control rule

Before changing this machine:

1. identify the owning system;
2. identify the exact canonical object being changed;
3. identify adjacent objects touched by the change;
4. preserve locked boundaries;
5. move adjacent unlocked objects in tandem when required;
6. prove exact source identity before execution;
7. prove deterministic output before promotion;
8. prove current-result handoff before claiming integration;
9. prove downstream reconciliation before claiming publication;
10. retain prior evidence and receipts.

No redesign is implied by this document.

The purpose of this record is continuity: **know the existing machine completely before changing it.**
