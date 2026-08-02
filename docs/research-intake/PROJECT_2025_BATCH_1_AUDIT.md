# Project 2025 Mechanism Dossiers — Batch 1 Audit

Status: research-intake audit only. No dossier, claim, match classification, or current-status statement in this document is promoted to Civic Powers, Civic Genome, Prism, or Kaleidoscope canonical state.

Audit date: 2026-08-02

## Governing rule

`research_claim != verified_source_record != legal_interpretation != current_status != Kaleidoscope_projection`

The submitted batch is useful because it demonstrates that an implementation mechanism is usually a graph of instruments, actors, litigation, decisions, and local responses rather than one linear proposal-to-policy event. It is not yet an admissible seed because material claims still depend on secondary reporting and one current-status statement is obsolete.

## P25-DOJ-01 — police consent decrees

### Research value

The dossier correctly identifies the distinct roles of the Department of Justice, federal district courts, local governments, and local continuation measures.

### Required correction

The Minneapolis and Louisville matters described by the Department of Justice on May 21, 2025 involved lawsuits seeking **proposed consent decrees**. The proposed Minneapolis decree had been filed for judicial approval but had not become an entered court order. Therefore, the batch does not establish an exact example of terminating an already-entered federal consent decree.

### Revised match posture

- Match target: withdrawal of proposed police consent decrees, dismissal of underlying lawsuits, closure of investigations, and retraction of findings.
- Classification: `partial_structural_match` to the broader proposal to eliminate existing federal police consent-decree oversight.
- Directness: `direct` administration action for the dismissal and investigation closures.
- Local response: verified separate application. Minneapolis Executive Order 2025-01 continued reforms from the proposed decree that were not duplicative of or inconsistent with the state settlement.

### Primary-source locators

- U.S. Department of Justice, Office of Public Affairs, May 21, 2025, “The U.S. Department of Justice’s Civil Rights Division Dismisses Biden-Era Police Investigations and Proposed Police Consent Decrees in Louisville and Minneapolis.”
- City of Minneapolis, Department of Justice Consent Decree timeline, May 27 and June 10, 2025 updates.
- City of Minneapolis Executive Order 2025-01, June 10, 2025.

### Still unresolved

- Louisville procedural disposition and local continuation status require primary docket and local-source review.
- Entered consent decrees in other jurisdictions must be researched separately.
- Closure of an investigation, dismissal of a lawsuit, withdrawal of a proposed decree, modification of an entered decree, and termination of an entered decree are separate application types.

## P25-DOL-01 — EEOC harassment guidance and Title VII posture

### Research value

This is the strongest dossier in the batch. The instrument chain is supported at the guidance and enforcement-posture level:

1. Executive Order 14168 stated an administration-wide definition and directed agency review.
2. On May 15, 2025, the Northern District of Texas vacated portions of the 2024 EEOC harassment guidance nationwide.
3. On January 22, 2026, the EEOC voted 2-1 to rescind the guidance in full.

### Required scope correction

The exact match is to rescission of agency guidance and alteration of the agency’s enforcement posture. It is **not** an exact reversal of Title VII or of `Bostock v. Clayton County`.

The EEOC’s own rescission announcement states that federal employment-discrimination law and Supreme Court precedent remain in place.

### Revised match posture

- Match target: rescission of EEOC sub-regulatory harassment guidance and changed enforcement posture.
- Classification: `exact_structural_match` at the guidance-rescission level.
- Classification against underlying statutory or Supreme Court protection: `no_verified_match` to reversal; `Bostock` remains controlling unless later modified by a competent court.
- Directness: the executive order, court vacatur, and later Commission vote must remain separate applications connected by sourced edges.

### Primary-source locators

- Executive Order 14168, Federal Register publication, January 2025.
- EEOC, “Federal Court Vacates Portions of EEOC Harassment Guidance,” May 20, 2025.
- EEOC open-meeting transcript, January 22, 2026.
- EEOC, “EEOC Commission Votes to Rescind 2024 Harassment Guidance,” January 23, 2026.

### Still unresolved

- Party identities, pleadings, and the precise relief requested in the Texas litigation need direct docket-document receipts before any coordination or ancestry claim is admitted.
- Similarity between a policy proposal and a litigant’s requested relief does not itself prove coordination or causation.

## P25-HHS-01 — mifepristone, REMS, and Comstock

### Material current-status error

The batch states that a May 1, 2026 Fifth Circuit order restricting mail and telehealth distribution was currently operative. That is not the current status.

On May 14, 2026, the Supreme Court stayed the Fifth Circuit’s May 1 order pending the Fifth Circuit appeal and any timely certiorari proceedings. The Fifth Circuit order therefore cannot be represented as the presently operative nationwide rule.

FDA’s current public materials continue to state that mifepristone is approved and may be dispensed by certified pharmacies, including by mail, under the 2023 REMS. FDA also states that its safety study remained underway as of April 2026.

### Revised match posture

- Direct FDA approval withdrawal: `no_verified_match`.
- Direct DOJ Comstock enforcement: `no_verified_match`.
- FDA safety review: `related_policy_direction` unless a later formal action changes the REMS or approval.
- Fifth Circuit litigation: `related_policy_direction` or `partial_structural_match` to the desired practical restriction, but the May 1 order is currently `stayed`.
- Causation: no verified basis in this batch for attributing state litigation to administration implementation.

### Primary-source locators

- FDA, “Information about Mifepristone for Medical Termination of Pregnancy Through Ten Weeks Gestation.”
- FDA, mifepristone questions and answers, including the April 2026 safety-study update.
- Supreme Court docket 25A1207, Danco Laboratories, L.L.C., order entered May 14, 2026.
- DOJ Office of Legal Counsel, December 23, 2022, “Application of the Comstock Act to the Mailing of Prescription Drugs That Can Be Used for Abortions.”

### Still unresolved

- The Fifth Circuit appeal and any later Supreme Court merits review require new immutable status receipts.
- A dissent invoking Comstock is not a holding and must be classified as judicial reasoning outside the controlling disposition.
- State shield-law collision analysis requires instrument-by-instrument review and cannot be inferred from the existence of litigation alone.

## Substrate requirements exposed by this batch

### Multi-actor participation

One application may include many actors in different roles:

- issuer;
- implementing or enforcing agency;
- plaintiff, defendant, petitioner, respondent, or intervenor;
- adjudicating court;
- state or local continuation actor;
- affected government.

Actor participation must not be converted into a claim of coordination, motive, or common purpose.

### Application-to-application chains

The system must preserve separately sourced relations such as:

- initiates;
- implements;
- challenges;
- responds to;
- stays;
- vacates;
- continues locally;
- produces a similar effect;
- depends on.

`produces_similar_effect` is deliberately noncausal. It cannot be upgraded to `implements` without separate documentary support.

### Scoped match classification

A match classification must always identify the compared object and level:

- exact guidance rescission;
- partial statutory mechanism;
- related practical outcome;
- superficial language similarity;
- no verified match.

One mechanism may have different classifications at the proposal, instrument, procedure, legal-authority, and practical-effect levels.

### Current-status receipts

Every current claim requires:

- a declared `as_of` timestamp;
- an operative status;
- a primary status source;
- separate records for stays, injunctions, affirmances, reversals, remands, rescissions, and supersession.

A later order never overwrites the earlier order. It changes the current view through a later receipt.

## Promotion decision

- P25-DOJ-01: hold for corrected scope and Louisville primary-source completion.
- P25-DOL-01: hold for direct docket receipts and level-specific match records.
- P25-HHS-01: reject current batch status as stale; retain research evidence and issue a corrected status chain.

No canonical promotion is authorized by this audit.
