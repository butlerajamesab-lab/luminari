# Civic Powers and Constraints — Foundation Contract

Status: source-controlled design contract; no constitutional claims are promoted by this document.

## Purpose

Civic Powers and Constraints is a neutral, source-bound Lighthouse knowledge layer for answering:

> Which government actor may take which action, under what authority, through what procedure, subject to which limits, checks, review mechanisms, and unresolved disputes?

The layer is administration-independent and party-independent. It evaluates offices, institutions, legal instruments, and actions under the same declared rules.

## Non-negotiable separation

The platform MUST preserve these layers as separate records:

1. **Primary source** — constitutional text, amendment, statute, regulation, executive instrument, court judgment, or official procedural rule.
2. **Interpretation** — a sourced explanation, holding, doctrine, or historical practice describing the source's legal meaning.
3. **Current application** — a time-bounded action, dispute, lawsuit, order, enforcement event, or institutional position applying the authority.
4. **Projection** — a declared conditional consequence or response path. Projection is not source truth and is not a legal holding.

`source != interpretation != current_application != projection`

No current event may modify a primary-source record. No interpretation may be stored as verbatim constitutional text. No projection may be presented as operative law.

## Existing-table boundary

The existing `public.constitutional_registry` is a Luminari runtime-doctrine registry containing internal principles such as Determinism, Truth Law, Structural Honesty, Anti-Reenactment, and No Dead-End Law. It MUST NOT be reused as the United States constitutional powers registry.

The existing `public.agency_authority_map` primarily maps complaint and enforcement pathways. It MUST NOT be treated as a complete separation-of-powers authority map.

Civic Powers requires an additive, separately named substrate.

## Canonical object families

### `civic_power_source`

An immutable source identity and receipt.

Required identity fields:

- `source_id`
- `source_type`
- `jurisdiction`
- `issuing_body`
- `citation`
- `title`
- `source_version`
- `source_url`
- `source_content_hash`
- `source_byte_hash` when available
- `effective_from`
- `effective_to`
- `retrieved_at`
- `verification_state`

### `civic_power_clause`

An addressable source span.

Required fields:

- `clause_id`
- `source_id`
- `article`
- `section`
- `clause_number`
- `heading`
- `verbatim_text`
- `char_offset_start`
- `char_offset_end`
- `clause_hash`

### `civic_power_interpretation`

A sourced legal meaning attached to one or more clauses.

Required fields:

- `interpretation_id`
- `interpretation_type`
- `statement`
- `authority_status`
- `valid_from`
- `valid_to`
- `source_ids`
- `supporting_clause_ids`
- `contradicting_interpretation_ids`
- `verification_state`
- `content_hash`

Interpretation types include:

- `plain_language_context`
- `judicial_holding`
- `judicial_dicta`
- `historical_practice`
- `official_branch_position`
- `scholarly_analysis`
- `unresolved_question`

Authority status values include:

- `constitutional_text`
- `binding_holding`
- `controlling_statute`
- `controlling_regulation`
- `persuasive_authority`
- `official_position`
- `historical_practice`
- `contested`
- `superseded`
- `unresolved`

### `civic_power_edge`

A typed relationship between a government actor, office, authority, action, constraint, check, or remedy.

Required fields:

- `edge_id`
- `from_object_type`
- `from_object_id`
- `edge_type`
- `to_object_type`
- `to_object_id`
- `conditions_json`
- `exceptions_json`
- `valid_from`
- `valid_to`
- `source_ids`
- `verification_state`
- `content_hash`

Core edge types:

- `grants_power`
- `imposes_duty`
- `limits_power`
- `checks_power`
- `requires_consent_from`
- `requires_appropriation_from`
- `requires_procedure`
- `authorizes_review_by`
- `authorizes_remedy`
- `preempts`
- `delegates_to`
- `revokes_delegation`
- `supersedes`
- `contradicts`
- `depends_on`

### `civic_power_application`

A time-bounded real-world application of authority.

Examples include an executive order, bill, enacted law, agency rule, funding directive, deployment order, court case, injunction, judgment, congressional vote, confirmation, veto, or override.

Required fields:

- `application_id`
- `application_type`
- `actor_id`
- `instrument_source_id`
- `claimed_authority_ids`
- `challenged_authority_ids`
- `procedural_state`
- `operative_state`
- `occurred_at`
- `effective_from`
- `effective_to`
- `source_ids`
- `verification_state`
- `content_hash`

### `civic_power_status_receipt`

An immutable observation of current legal or procedural status at a declared time.

Required fields:

- `receipt_id`
- `application_id`
- `as_of`
- `status`
- `status_basis`
- `source_ids`
- `engine_version`
- `rule_version`
- `input_hash`
- `output_hash`

Status values may include:

- `proposed`
- `introduced`
- `issued`
- `effective`
- `stayed`
- `enjoined`
- `vacated`
- `affirmed`
- `reversed`
- `remanded`
- `expired`
- `superseded`
- `contested`
- `unresolved`

A later status creates a new receipt. It never overwrites history.

## Government actors and levels

The knowledge layer must support:

- federal legislative, executive, and judicial branches;
- independent and executive agencies;
- state legislative, executive, and judicial branches;
- tribal governments and courts;
- local governments;
- interstate bodies;
- offices and officers acting in official capacities.

An office is distinct from its current officeholder. Canonical authority attaches to the office unless a source specifically grants authority to a named individual.

## Deterministic identity

Each canonical record must bind:

- normalized identity inputs;
- source identity and version;
- declared engine version;
- declared rule version;
- configuration hash;
- content hash;
- provenance and verification state.

Same source identity, source bytes, rules, configuration, and engine version must produce the same canonical identifiers and hashes.

## UI contract

The Lighthouse UI will provide four initial views:

1. **Explore Powers** — browse by branch, office, jurisdiction, authority type, and source.
2. **Checks Matrix** — inspect which actor may check, review, fund, block, confirm, remove, or constrain another actor.
3. **Can Government Do This?** — structured lookup returning authority, prerequisites, limits, checks, remedies, disputes, and source chain. It must not synthesize legal conclusions without governed records.
4. **Follow an Action** — trace an actual instrument from claimed authority through procedure, challenges, judicial treatment, operative status, and downstream effects.

Every displayed statement must identify whether it is:

- source text;
- interpretation;
- current application;
- projection;
- unresolved.

## Kaleidoscope boundary

Civic Powers supplies the lawful authority and constraint baseline.

Kaleidoscope may compare an incoming instrument against this baseline and resolve conditional consequence and response paths. Kaleidoscope may not alter Civic Powers source records, and its projections must carry separate rules, hashes, assumptions, and receipts.

## Rosetta and Prism boundary

- Rosetta may decompose source instruments into deterministic legal objects.
- Civic Powers may bind those source objects to branch-power and authority identities.
- Prism verifies claims and evidence supporting interpretations, applications, and status receipts.
- A Rosetta extraction state is not a Prism verification state.

## Pass-1 acceptance criteria

A first production release is acceptable only when:

- the original Constitution and directly relevant amendments are stored as immutable source records;
- clauses are addressable and hash-bound;
- grants, limits, duties, and checks are stored as sourced edges rather than prose-only summaries;
- interpretation records are separate from verbatim source text;
- current disputes use time-bounded status receipts;
- superseded and contradictory interpretations remain preserved;
- the UI exposes source chains and uncertainty;
- no party, administration, officeholder, or policy program is embedded into the core authority rules;
- no unverified research draft is promoted directly into canonical truth.

## Explicit exclusions from the foundation pass

- corruption or motive classification;
- partisan scoring;
- prediction of litigation outcomes;
- unsourced claims of coordination between branches;
- automated legal advice;
- silent conversion of policy proposals into current law;
- reuse of internal Luminari constitutional doctrine as United States constitutional law.
