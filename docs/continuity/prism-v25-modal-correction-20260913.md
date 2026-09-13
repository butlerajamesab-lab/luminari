# Prism 2.5 forward modal correction

This is the activation contract for Lighthouse PR #656 and [Prism PR #44](https://github.com/butlerajamesab-lab/prism/pull/44). It does not claim a production correction has occurred. Actual deployment, bounded execution, and readback evidence belongs in PR #655.

The active immutable identity is engine/rule version `2.5.0`, rule ID `prism-rosetta-structural-binding`, and ruleset SHA256 `26e4ef9f6c0d389154d9a2259c99b6e7eb83a51c096e738a9470fb20ff04ec8b`. The migration is `20260913203322_prism_v25_generation_and_modal_correction.sql`, SHA256 `40b36de623fe104437c465a4dafe14a349a8095f3af1f0381cf34bf24c748463`.

## Deployment and bounded activation

1. Deploy the reviewed upstream 2.5 implementation and Lighthouse integration. Leave the exhausted existing worker selector and its attempt budget unchanged through deployment.
2. Install the reviewed forward migration and verify all nine installed bodies, owners, execution grants, and ledger identity against source. Installation does not enqueue or project any rows.
3. Freshly verify the five selected assemblies still have complete source identity, complete assembly state, and the expected one confirmed trait each. Use `public.enqueue_civic_genome_prism_v25_scope_v1(uuid[])` for only those assembly IDs; retain the returned actual queue IDs. The function refuses nulls, duplicates, unknown/incomplete assemblies, or more than 25 IDs and preserves existing queue states.
4. Configure the separately authorized worker scope from those returned IDs with the explicit execution budget. Selected workers skip global replenishment. The completion trigger invokes the actual guarded projector; do not manually insert correction patterns or rewrite historical receipts.
5. Read back actual Prism and Lighthouse request/receipt/binding/run identities, current rule/hash, source identity, and exact original spans/offsets. Reconstructed evaluator fixtures are predictions for comparison, not receipt evidence.

## Immutable history and current lineage

Only the two known erroneous predecessors can receive the special calendar-May correction provenance. A new complete 2.5 receipt must explicitly show the missing modal at the same old trait, step, evaluated span, and offsets.

| Prior pattern | Expected payload SHA256, excluding only `is_current` |
| --- | --- |
| `91955a17-ecef-483b-b2b6-0fffee738cf6` | `889fa2ab1c6ec038786d7666bde774e102a833e747b906cbc7adb9c8fbd97679` |
| `e6f0c3b6-8f1c-41fe-9c82-60afd046f122` | `f99c935f4526a343ea4b5149517faada49fe90eb9afd9a95936f6a2349e926ae` |

Compute each digest using `encode(sha256(convert_to((to_jsonb(pattern)-'is_current')::text,'UTF8')),'hex')`. The full older parent rows are also pinned by the migration. Permitted predecessor change is only its `is_current` status when an evidence-backed successor is appended. Its evidence, hashes, authority, and previous lineage remain unchanged.

The projector keeps newer complete generations current even if an old 2.4 run has a later completion timestamp. Replaying the same 2.5 run retains the original correction provenance and appends no duplicate. Historical 2.4 adapters and generation-specific verification functions remain available.

## Verification scope

The PostgreSQL 17 job executes the actual historical registrar, immutable-pattern trigger, 2.4 migration, and new migration against an isolated schema fixture. Eighteen scenarios cover source-backed corrections, invalid proof, prior-span coverage, completion triggers, historical replay, idempotence, bounded queue selection, and access rules. The fixture outputs are explicitly labeled as test data. The existing 21-scenario 2.4 verifier also clones the installed newer helper dependencies so it continues testing historical behavior after deployment. Full migration rebuild and lint remain separate CI gates.
