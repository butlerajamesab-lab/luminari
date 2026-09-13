# Rosetta source-path release evidence — September 13, 2026

The fixes in #649, #650 and #652 are deployed in Luminari commit
`01dd5775d5e784bd8ab22b2a68d41c5c1614a22c`. No fresh Docket job exercised the new
fiscal-note or transport guards in this checkpoint. The detailed readback, exact
timestamps and selected startup logs are preserved in
[`rosetta-source-release-20260913.json`](../evidence/rosetta-source-release-20260913.json).

| PR | Installed behavior | Merge commit |
| --- | --- | --- |
| [#649](https://github.com/butlerajamesab-lab/luminari/pull/649) | Temporary Rosetta source-snapshot HTTP failures remain retryable, including jobs with receipts | `c05e9fce59ae83289619c16d0ee65f97b5797ed2` |
| [#650](https://github.com/butlerajamesab-lab/luminari/pull/650) | Corroborated Kentucky fiscal notes receive an explicit terminal disposition before legislative extraction | `8a17b4e6cb7b012ed901099432997770371c4eba` |
| [#652](https://github.com/butlerajamesab-lab/luminari/pull/652) | Complete, size-limited HTTP 200 rejection pages are detected before parsing; validated provider fallback and transport retries remain available | `01dd5775d5e784bd8ab22b2a68d41c5c1614a22c` |

GitHub's ancestry comparison confirms #649's merge is an ancestor of the combined
commit, which includes #650, #651, #653 and #652. The
[post-merge build and health check](https://github.com/butlerajamesab-lab/luminari/actions/runs/34779103195/job/103782703148)
passed **1,960 tests**, with one skipped, across 359 files. This includes 24
transport/actual-pipeline cases, 22 document-role cases, 31 publication retry
cases and #653's 11 dedicated-worker startup cases. All five post-merge checks
succeeded, including Prism bridge and Supabase Preview.

| Runtime | Verified deployment | Live timestamp (UTC) | Observed startup boundary |
| --- | --- | --- | --- |
| Lighthouse web, `srv-d7t4381j2pic73agtepg` | `dep-dajfur9nb5bc73djat6g` | 19:57:12.342692 | Role `web`; HTTP-only, background startup denied |
| Dedicated worker, `srv-da9c7a1f2nfc73f2ee8g` | `dep-dajg0dfqj5pc73dg1eag` | 19:58:53.392541 | Legislative recovery requested; disabled because `legiscan_api_key_configured=false` |

Render reports both deployments on `01dd5775d5e784bd8ab22b2a68d41c5c1614a22c`;
both new instances also emitted that exact runtime fingerprint. The worker's
19:58:57 startup explicitly emitted
`legislative_queue_disabled_missing_legiscan_api_key`. The web logs establish
its role boundary, not its credential presence. The
[dedicated entrypoint](https://github.com/butlerajamesab-lab/luminari/blob/01dd5775d5e784bd8ab22b2a68d41c5c1614a22c/server/prism-rosetta-worker.ts)
requires a usable `LEGISCAN_API_KEY`, a positive
`LEGISCAN_BILL_TEXT_PROBE_DOCUMENT_ID` and a successful bill-text probe before
starting the authorized recovery scope. This is separate from the Prism queue.

The read-only Lighthouse database observation at **19:59:07 UTC** found 25,471
Docket queue rows, **zero updated since web deployment**, and a newest queue
update on September 1. There were 6,184 due eligible/degraded rows and 747
historical permanent `docket_html_text_incomplete` failures. None of those
failures was new after deployment; no new transport-rejection disposition was
recorded. This idle window provides no production execution proof of #652.

| Source key | Source | Current queue state | Existing error or receipt |
| --- | --- | --- | --- |
| `amendment:2073649:285475` | [KY HB356 fiscal note](https://apps.legislature.ky.gov/recorddocuments/note/26RS/hb356/HCA1FN.pdf) | `permanent_failure` | `legislative_version_pdf_text_incomplete` |
| `amendment:2122615:289230` | [KY HJR81 fiscal note](https://apps.legislature.ky.gov/recorddocuments/note/26RS/hjr81/HCS1FN.pdf) | `permanent_failure` | `legislative_version_extraction_not_admissible:failed:rejected` |
| `amendment:2128442:285932` | [KY HB869 fiscal note](https://apps.legislature.ky.gov/recorddocuments/note/26RS/hb869/HCS1FN.pdf) | `permanent_failure` | `legislative_version_extraction_not_admissible:failed:rejected` |
| `text:2067507:3329003` | [UT HB0179S01](https://le.utah.gov/Session/2026/bills/introduced/HB0179S01.pdf) | `completed` | Version `verified_with_findings`; extraction run `2462` |

These four rows were read at 19:58:20 UTC. Fiscal-note queue/version timestamps
remain August 28; Utah's queue timestamp remains August 6 and its version
timestamp August 28. Their old errors and provider metadata were preserved;
the newly explicit fiscal-note error is established by tests, not by relabeling
these historical rows.

The source-path tests use retained rejection bytes and original PDF bytes through
the actual code with mocked transport. The earlier bounded current-header Utah
fetch ran in Node 24 outside Render; no live provider-copy fallback or induced
Rosetta outage is claimed. This checkpoint performed no database write, broad
ingestion, reopening of terminal rows, immutable-history edit or public promotion.
