# Civic Genome External Contracts v1

**Status:** Source-controlled contract and read-only producer implementation. No database migration, public route, external bridge, production write, or completed live replay proof is included yet.

## 1. Canonical ownership

Civic Genome is Lighthouse's persistent structural memory for civic policy state. It owns:

- persistent bill and policy identity;
- normalized structural traits;
- policy families and unresolved family outcomes;
- relationships and lineage;
- immutable civic lifecycle events;
- jurisdictional state;
- momentum components and snapshots;
- materialized comparison matrices and jurisdiction cells.

It does not own official source truth, Rosetta decomposition, Atlas observations, Prism findings, Viewfinder presentation, or Kaleidoscope projections.

## 2. Rosetta → Civic Genome

Rosetta owns deterministic five-layer legal decomposition:

- `HELP`
- `WORKFLOW`
- `ACCOUNTABILITY`
- `OVERRIDES`
- `DEFINITIONS`

Civic Genome may assemble only a completed, admissible, provenance-valid Rosetta law view with exact source-document, extraction-run, engine, rule, source-span, input-hash, and output-hash receipts.

Civic Genome transforms Rosetta objects into normalized traits while preserving source identity and receipts. It may then resolve policy-family identity through its own declared deterministic methodology. It must preserve insufficient support, ambiguity, and hard contradiction as unresolved outcomes.

Rosetta must not mutate Genome identity, family, events, lineage, momentum, or comparison state. Civic Genome must not rewrite Rosetta extraction output.

**Current implementation state:** operational through the existing source binding, assembly-run, trait, family-resolution, and Prism receipt contracts.

## 3. Atlas / signal architecture → Civic Genome

Atlas owns raw observations, canonical event identity, replay accounting, exact entity resolution, detection statistics, severity, confidence, and Atlas engine/rule receipts.

The canonical signal architecture contains three independent source domains:

1. `intake_signals` — user-experienced civic breakpoints;
2. `legal_patterns` — legal gaps, contradictions, and enforcement weaknesses;
3. `live_data_signals` — Atlas-derived statistically evidenced observations.

The three domains must never be mixed at source. `signal_convergences` may reference one independently governed record from each source domain only after all three exist.

There is no direct raw Atlas → Civic Genome mutation contract. A Civic Genome attachment requires an explicit, governed identity/effect binding that identifies:

- the Atlas signal or convergence receipt;
- the Genome bill, family, jurisdiction, relationship, event, or momentum component affected;
- the exact relationship type;
- the evidence basis and source hashes;
- the binding rule and version;
- whether the attachment is observed, validated, contradicted, review-held, or unresolved;
- a non-causal state unless causation is independently evidenced.

Atlas must not create families, rewrite Rosetta-derived traits, or turn statistical association into legal causation. An Atlas observation may remain useful to Kaleidoscope as a separate upstream observation bundle even when it has no Civic Genome attachment.

Atlas mathematical convergence is also distinct from Lighthouse three-domain convergence. An Atlas mathematical receipt proves the declared Atlas equation over its governed source population and geography. It does not establish an intake/legal/live-data intersection and does not become a Civic Genome relationship by itself.

**Current implementation state:** Atlas has 54 current entity-resolution rows, all unresolved; 10 historical failed Domain 3 v1.0.0 candidates; 10 pending v1.1.0 candidates; zero candidates bridged into Lighthouse; and one Washington mathematical-convergence receipt with no convergence detected. Lighthouse's canonical source-domain and three-domain convergence tables remain empty. No Atlas → Civic Genome binding is established.

## 4. Viewfinder ↔ Civic Genome

Viewfinder is a public cross-jurisdiction comparison and system-revelation layer. It is broader than Civic Genome: its underlying evidence base also includes the 56-jurisdiction resource, deadline, benefit, legal-remedy, tribal, community, and portability registries.

Civic Genome provides one bounded Viewfinder lens through:

- `civic_genome_comparison_matrix`;
- `civic_genome_comparison_state_cell`.

That lens may compare a declared policy family across jurisdictions using normalized Genome identity, traits, lifecycle state, and source trace. Viewfinder reads these materialized projections; it does not mutate source observations or Genome-owned records.

The existing `anomaly_score` and `contradiction_score` columns are storage capacity only. They are not authority to invent scores. No matrix or cell may be materialized until a versioned methodology declares:

- the comparison axis;
- accepted source component types;
- jurisdiction universe and as-of time;
- state-position classification rules;
- anomaly and contradiction formulas, if used;
- missing-data and unresolved behavior;
- source and output hashes;
- replay behavior.

The Shipyard may package a reviewed Viewfinder finding into an advocacy brief, but the brief is a downstream artifact, not a Civic Genome mutation.

**Current implementation state:** schema substrate exists; no matrix producer, methodology manifest, matrix, or jurisdiction cell is materialized.

## 5. Kaleidoscope ↔ Civic Genome

Kaleidoscope is an independent deterministic scenario-projection platform. It requires a content-addressed, immutable Civic Genome baseline export.

The existing `civic_genome_projection_checkpoint` table is not that export. It is mutable continuation state for internal Docket-to-Genome materialization and must not be presented as a Kaleidoscope baseline snapshot.

A valid Kaleidoscope binding requires:

- an immutable Civic Genome external snapshot ID;
- snapshot contract and methodology versions;
- exact scope and as-of time;
- canonical component identities and values;
- source-native verification and unresolved states;
- complete upstream receipt references;
- canonical payload hash;
- export receipt ID and hash;
- component count and completeness declaration;
- explicit exclusions;
- replay proof.

Kaleidoscope may transform the accepted snapshot into its own projection-owned state representation. It must preserve the upstream snapshot identity and hash and must not write projection results back as Genome facts.

**Current implementation state:** the source contract, portable JSON Schema, TypeScript validator, read-only repeatable-read family producer, deterministic receipt builder, and environment-gated replay proof runner are source-controlled in draft. They have passed focused contract tests but have not yet produced a merged/deployed live snapshot receipt.

## 6. External snapshot component catalog

The v1 external snapshot may contain these Civic Genome-owned component types:

- `family`
- `bill`
- `trait`
- `relationship`
- `lineage_edge`
- `event`
- `momentum_component`
- `momentum_snapshot`
- `comparison_matrix`
- `comparison_state_cell`
- `unresolved_family_candidate`

Every component must declare:

- stable namespaced component ID;
- canonical record type and record ID;
- inclusion state: `current`, `historical`, `unresolved`, or `rejected`;
- jurisdiction and temporal scope where applicable;
- canonical value payload;
- source-native verification state;
- source bindings and receipts;
- unresolved conditions;
- component hash.

External consumers must not silently translate source-native verification states. A translation requires a declared mapping rule and version. Without one, consumer verification remains unresolved.

## 7. Hash and replay boundary

The snapshot hash must be calculated over a canonical hash basis containing only semantic state:

- contract ID and version;
- snapshot ID;
- scope;
- as-of time;
- methodology version;
- ordered components;
- unresolved conditions;
- excluded component types;
- completeness state.

Transport time, request ID, deployment ID, host name, and other non-semantic metadata must not participate in deterministic identity.

Identical complete source state, scope, methodology, and as-of time must produce the same canonical payload hash. A changed canonical record or source receipt must produce a different hash.

The v1 producer reads one family through a PostgreSQL `REPEATABLE READ READ ONLY` transaction. The optional startup proof reads the same family twice at the same declared as-of time and requires identical snapshot IDs, snapshot hashes, export receipt identities and hashes, replay keys, and component counts. It logs hashes and counts only and performs no database write.

## 8. Acceptance gates

No external contract is operational until all applicable gates pass:

1. exact source and ownership proof;
2. contract-schema proof;
3. complete component and receipt provenance;
4. canonical hash and identical replay proof;
5. unresolved-state preservation;
6. no upstream mutation;
7. service authentication and least privilege;
8. bounded live specimen;
9. consumer rejection of modified or incomplete payloads;
10. presentation that distinguishes source truth, observed state, comparison output, and projection.
