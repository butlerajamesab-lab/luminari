# Native Nations and the Recognition Atlas: where we are and what comes next (November 27, 2026)

This file holds the agreed direction, decisions and state of the Native Nations
work so that any session, human or Claude, can pick it up without the
original conversation. It changes only when Alexander confirms a change.

## The principle

**The framework is the vessel. They are the author.**

- Luminari only represents each nation's own words. It does not speak for any
  nation, describe any nation, or judge any community.
- The one place Luminari interprets anything is the **Route to Recognition**
  (Recognition Gideon / RTR Matrix), and it is labelled as Luminari analysis
  there.
- Content for each nation comes **from its own website only**: its own words,
  carried forward verbatim and cited to the exact page and the moment it was
  read. Official records (Federal Register, OFA, statutes, court decisions,
  state and provincial lists) are used for recognition status and decisions,
  and never for describing a nation.
- Nothing about a nation is public until **its own council** approves it,
  section by section.

## What already existed before this round

These shipped before November 25 and are the pattern everything else follows.

- **Native Nations Hub** (`/native-nations`), with tribal cards for
  **Duwamish, Muwékma and Chinook**.
- **Recognition Atlas tribal card** for each nation, plus the **seven-layer
  source packet**:
  1. Identity core
  2. Treaty / political relationship
  3. Dispossession record
  4. Recognition timeline
  5. Lawsuit claims
  6. Language vault / living culture
  7. Ally call
- **Protection state on every card:** admin only, locked pending tribal
  review, published to Lighthouse only after tribe approval
  (`client/src/gates/section_lock.ts`).
- **Recognition Gideon / RTR Matrix:** recognition conditions, regulations,
  decisions, cases, agency practices and weak joints. Tribal words render
  separately from Luminari analysis.
- **Seeds:**
  - `client/src/data/{chinook,duwamish,muwekma}_truth_seed*.ts`
  - `route_to_recognition_*`
  - `recognition_*`
- **Registry:**
  - `native_nation_registry_v1`: 602 BIA-recognized nations plus the 3
    above.
  - `native_nation_site_capture_v1`: raw captures of each nation's own site
    (#899).

## What this round added (pull requests, not merged as of this file)

### #910: Tribal council gate (server side)

The existing gate ran only in the browser, and the locked seed content ships
inside the client bundle. #910 enforces the same locks on the server and in
the database.

**Migration:** `20261127100000_tribal_council_gate_v1.sql`, schema
`tribal_council_gate`. It is safe to re-run.

**What each nation's council can do:**
- Review its page layout and language.
- Confirm, correct, restrict, replace or reject any item.
- Add its own sections.
- Rename or reorder sections.
- Revoke any permission it has given.
- Withdraw entirely.

**What the gate records and enforces:**
- Every decision is append-only.
- An item becomes public only when it is council-confirmed or
  council-written, in a section the council opened.
- Luminari analysis is refused by the database outside
  `route_to_recognition`.
- Letters to councils go to the address the nation itself publishes. Each
  letter is drafted from what the gate holds, approved by an admin, and logged
  when sent.
- Council members may use a pseudonym, and their access covers one nation
  only.
- Admins and council members both need two-step sign-in.
- An access log records who saw what.

**Seed import:** `scripts/tribal-council-gate-seed-import.mts` turns the three
seeds into 446 locked items. It only prints SQL; nothing is loaded.

### #912: Recognition registry and comparison grid

**Migration:** `20261127090000_recognition_registry_v1.sql`. It is
idempotent. The research data is in `data/recognition_research_20261125/`.

**378 nations not federally recognized**, each with official status, its own
name and website, and sources:
- **US: 351.** Built from the OFA petitioner list and decision pages, checked
  against 91 FR 4102 (2026-01-30). 65 of these hold state recognition across
  13 states.
- **Canada: 27.** Checked against ISC's list of 638 bands.

**111 routes to recognition:**

| Route | Count |
| --- | --- |
| OFA acknowledgment | 18 |
| Act of Congress, recognition | 22 |
| Act of Congress, restoration | 17 |
| Court or settlement | 28 |
| Secretarial reaffirmation | 5 |
| Canadian band creation | 4 |
| Pre-1978 BIA | 13 |
| Reversals | 4 (Chinook, Historical Eastern Pequot, Schaghticoke, Delaware 1996) |

**252 decision-document citations**, plus a column for linking the captured
document itself.

**`recognition_comparison_matrix_v1`:** unrecognized nations appear in the
matrix, and recognized nations appear **only** where they have a recorded
route. Each links to the nation's own hub.

## The next stage (agreed November 27, 2026)

Once the gates are in place:

1. **Build out the registry nation by nation, working outward.** For every
   unrecognized nation:
   - Capture its own website (the #899 capture pattern).
   - Carry forward what the nation itself says into the same seven-layer
     card.
   - Fill the gaps against what the platform already holds.
   - Every item enters the gate locked, pending that nation's council.
2. **Recognized nations** appear only in the comparison matrix, as success
   routes. Each gets a similar seven-card page told **in its own words from
   its own website**, linked through its tribal hub.
3. **Letters** to each council, at the address it publishes, inviting review.
   No letter goes out without Alexander's approval.
4. **Existing platform information:** every state registry has a tribal
   section. These are mined and cross-referenced, not duplicated.

## Decisions on record

- **US and Canada.** "Unrecognized" means unrecognized federally, by a state,
  or by a county.
- **Disputed communities stay in.** Contests between communities often trace
  back to the government's failure to uphold treaties, or to money and gaming
  pressures, so a dispute is never grounds for exclusion. If a dispute is ever
  recorded, record who disputes and why, in their own words. Nothing is
  recorded until Alexander confirms the form.
- **The foundation side is kept entirely out of the tribal area.** No
  foundation names, hubs or plans appear in tribal pages, letters, code or
  data. The earlier proposals for foundation hubs and gates (items 19–20) are
  not being built.
- **Standing rules:**
  - No production change, merge, environment change or deletion without
    Alexander's explicit yes. Applying already-merged migrations is allowed,
    with verification afterwards.
  - Only corrupted items may be deleted, and a record is kept.
  - Unused tables that hold data are archived first.
  - Build alongside; test on real data; use snake_case; raise findings and
    decide together.

## Open items waiting on Alexander

1. **Merge #910 and #912.** Then apply both migrations and verify them.
2. **Correct 65 stale recognition statuses already on the platform.** Full
   list: `data/recognition_research_20261125/platform_stale_status.csv`.
   Examples:
   - The Virginia rows say six tribes are not federally recognized. They
     were recognized in 2018 (Pub. L. 115-121).
   - A Lumbee row says "ICWA does not apply". Lumbee was recognized
     2025-12-18.
   - Montana is given 7 tribes; Little Shell is missing.
   - Nebraska is given 3 tribes; Ponca is missing.
   - "Cher-Ae Heights" is listed as an Alabama state-recognized tribe.
3. **Move the locked seed content out of the client bundle** and have the
   Atlas pages read through the gate.
4. **Research gaps:**
   - Only 41 US records have their own website so far.
   - About 200 groups known only from their websites still need
     official-source checks.
   - No letter of intent filed after 2013 is in the data (no complete public
     list exists).
   - 7 court-route rows are unverified leads.
5. **Roadmap items 21–22 (not started):**
   - A read-only table usage inventory.
   - Unifying the stream registries. At least three exist:
     `data_stream_registry` (30), `atlas_stream_runtime_projection_v1` (41)
     and `streams` (23).
   - Fixing `/api/system/schema`.
   - Fixing the Atlas health check.
