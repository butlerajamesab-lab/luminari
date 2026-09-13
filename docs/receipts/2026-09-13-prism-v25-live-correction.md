# Prism 2.5: five authoritative corrections completed

The five affected assemblies completed their new immutable Prism 2.5 verification on September 13, 2026, between 22:55:01 and 22:55:41 UTC. All five submitted once, received HTTP 201, and persisted the same authoritative receipt in Prism and Lighthouse. The six calendar-only steps now have explicit `workflow_modal_present` contradictions with `observed=not_observed`. Their evaluated spans, source quotes, and offsets exactly match the earlier 2.4 evidence.

These remain `contradicted` source assertions. Correcting the month-token interpretation does not establish that the extracted workflows exist or remove their other contradictions.

| Source / public extraction run | Authoritative 2.5 receipt | Corrected date steps |
| --- | --- | --- |
| 9794 / 14430 | `bb22f254-6e4a-46eb-a879-76da02b6b10b` | 1 |
| 9726 / 14351 | `dbe071ec-e8ca-4450-ac26-5c44f3bd19f3` | 2 |
| 9556 / 14125 | `15ea68e3-1593-4b63-8b04-bb03adb33f97` | 1 |
| 9195 / 13697 | `14e8174d-f1d7-442d-992f-81e2a17c7635` | 1 |
| 9005 / 13464 | `ce2c9ad2-41db-4e9f-83dd-6204550dc659` | 1 |

The actual complete semantic bodies match the fixed evaluator predictions and independently recomputed output hashes. Every request input, replay key, source byte hash, provenance tuple, binding, queue, and completed verification run matches its expected identity. Immediately before enqueue, Rosetta's current publication view returned all five run/document pairs with all 25 provenance hashes unchanged. Predictions remain labeled as fixtures in the evidence; the production receipt bodies and IDs come from separate readbacks at 22:56:38–40 UTC.

The guarded completion projector appended two current `contradicted` successors from those actual 2.5 receipts:

| Erroneous 2.4 predecessor | New current 2.5 successor |
| --- | --- |
| `91955a17-ecef-483b-b2b6-0fffee738cf6` | `73305412-80c8-4e42-875f-88510ecc88b8` |
| `e6f0c3b6-8f1c-41fe-9c82-60afd046f122` | `32fd1e07-b07b-4041-90bb-dae8c6a07c66` |

All 16 source/receipt/span checks passed for both lineages, and each assembly has exactly one current modal pattern. All four original pattern payloads remain intact; only the two replaced predecessors' `is_current` flags changed. The two older parent rows are completely unchanged. No historical receipt was rewritten.

The complete 2.5 pattern census at 23:10:58 also records three new `contradicted` workflow gaps with no predecessor: `df8cb277-121b-4793-a94e-e53080ec28c4` for source 9005, `533049d6-40ed-4ecc-8f6e-5b4a040227a0` for source 9726, and `6ff5764a-eaa1-4fb8-a504-39af809c4b94` for source 9794. Together with the two successors above, these are exactly five new current patterns across the five selected assemblies. All six contradiction references match their actual receipt bodies, output hashes, and replay keys; no 2.5 pattern belongs to another assembly.

Runtime order was [Prism #44](https://github.com/butlerajamesab-lab/prism/pull/44), merge `61020ab01c1a608df0d1d0a1893f924e38b56917`, live at 22:48:57; then [Lighthouse #656](https://github.com/butlerajamesab-lab/luminari/pull/656), merge `f07af14cbb064bb428c604364d955d788d146603`, live on both services. The exact-five worker configuration deployed as `dep-dajij26k1f9s73dpo230` at 22:54:57. It logged five claims and completions, followed by budget exhaustion at 22:55:50. Its selection remains those completed five UUIDs, with allowance five and no single canary.

Global readback at 23:00:04–08 found exactly five 2.5 requests and receipts in Prism, and five each of queues, runs, bindings, requests, and receipts in Lighthouse. There were zero 2.5 rows outside the expected identities. Historical preservation at the fixed 20:35:12.788816 UTC cutoff matched the original counts and digests for all 149,871 Lighthouse bindings, 11,168 runs, 26,407 queues, 149,871 receipts, and 149,900 requests. Prism's eight prior registry rows and 52 prior 2.4 requests and receipts also match. This is not a census of every historical Prism payload version.

The final source migration names match the actual production ledger identities without changing the reviewed SQL bytes:

| System | Proposed version → installed/source version | SQL bytes / SHA-256 |
| --- | --- | --- |
| Prism | `20260913203500` → `20260913212448` | 2,820 / `eb80c1418049f7430d0070f5421a3dfad71b00d4e8e4ec51ed26710ce46b0e3d` |
| Lighthouse | `20260913203322` → `20260913212226` | 45,513 / `40b36de623fe104437c465a4dafe14a349a8095f3af1f0381cf34bf24c748463` |

Prism's reviewed head passed 117 verification tests, two frontend tests, and both builds. Lighthouse's executable checks, rebuild, and actual PostgreSQL projection scenarios passed. Supabase Preview did not establish a clean full baseline replay: Prism has a preexisting malformed historical 2.3 migration, and retained Preview ledger IDs differ from the later production-aligned filenames. The exact new Prism SQL passed separately in the isolated Preview project and in production; historical migration bytes and ledgers were preserved.

The final Prism review included an accepted P2 coverage limit: parenthesized/bracketed calendar-time phrases such as `Hearing (on May 11 at noon)` can remain `unresolved`. The [documented disposition](https://github.com/butlerajamesab-lab/prism/pull/44#discussion_r4001148021) treats this as conservative uncertainty outside these five corrections. It is not a code fix or a no-findings review. Other unfamiliar grammatical forms also remain unresolved.

The [machine evidence](2026-09-13-prism-v25-live-correction.json) includes the exact read-only SQL, actual receipts, separately labeled predictions, runtime and migration identities, filtered worker/request logs, global scope counts, historical digests, and both complete lineage readbacks. Run `node docs/receipts/verify-prism-v25-live-receipt-evidence.mjs` to independently audit the recorded snapshot. That command performs no production operations. The original [batch 1](2026-09-13-prism-publication-batch-25.json) and [batch 2](2026-09-13-prism-publication-batch-02.json) evidence remains unchanged.
