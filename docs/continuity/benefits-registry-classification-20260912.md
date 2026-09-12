# Benefits registry classification repair

Observed September 12, 2026 against Lighthouse (`wepxlinwbjrkqdzkqpar`). Production inspection was read-only. Code baseline: `7e07abd3d19315d7c165aa4e1a056d01c8524059`.

## Flaw and concrete repair

Benefits search correctly filters stored jurisdiction identifiers but presented that classification as “federal programs.” The underlying `registry_programs` table contains heterogeneous records, and the classification itself is not verified. Two Arizona agency records carry a stored `federal` jurisdiction. Separate records with the same names carry `state (az)`; matching names do not establish a canonical identity or authorize merging.

The results now say **Registry references**, show each stored category, preserve the original jurisdiction identifier under **Recorded**, and mark that jurisdiction **unverified**. The federal search description explicitly refers to a recorded jurisdiction. The display explains that classification does not establish benefit eligibility or current officeholder status. Search filters, exact IDs, totals, pagination, existing contact bindings, and source records are preserved.

This repairs an unsupported display assertion. It does not certify or correct the underlying jurisdiction assignments. A source-backed repair still needs an exact identity and jurisdiction binding.

## Exact observed identities

| Name | Stored record ID | Stored jurisdiction |
| --- | --- | --- |
| Arizona Department of Administration (Workers Comp Division) | `lmn_55bf01de3cbf5ff834187d36` | `federal` |
| Arizona Department of Administration (Workers Comp Division) | `lmn_1feb16e889bba84258403935` | `state (az)` |
| Arizona Department of Health Services (Mental Health) | `lmn_6ec61b24f1454a3600bd8707` | `federal` |
| Arizona Department of Health Services (Mental Health) | `lmn_b3b5b94172061980c4a054e1` | `state (az)` |

All four have category `government_agency`. Both jurisdiction columns agree within each row. No inference about which row to retain was made.

For each federal Arizona ID, the existing program staging, extraction, and resource canonical identity tables contain **zero exact matches**, including the previously observed `RP_` prefix representation. The program crosswalk, intake promotion log, and promoted intake staging also contain **zero exact matches**. Name inspection of generic staging and resource entities found no source candidate for these two names. Those absences do not prove that the original source is absent from the complete corpus; they establish that the inspected existing identity path cannot support a correction.

The federal search scope contains 187 records: 174 stored as `federal`, 13 as `us-federal`. Stored categories include 49 `advocacy`, 47 `legislator`, 31 `government_agency`, 16 `service`, and 13 `oversight` records. Those category counts explain why calling every result a benefit program was inaccurate. No current-tenure claim was researched or introduced.

## Reproducible identity check

```sql
WITH targets(id) AS (
  VALUES ('lmn_55bf01de3cbf5ff834187d36'),
         ('lmn_6ec61b24f1454a3600bd8707')
)
SELECT t.id,
  (SELECT COUNT(*) FROM public.registry_entity_staging_programs s
   WHERE s.program_id IN (t.id, 'RP_' || t.id)) AS program_staging_matches,
  (SELECT COUNT(*) FROM public.registry_entity_extraction_v4 x
   WHERE x.program_id IN (t.id, 'RP_' || t.id)) AS extraction_matches,
  (SELECT COUNT(*) FROM public.luminari_resource_entities e
   WHERE e.canonical_id IN (t.id, 'RP_' || t.id)) AS resource_identity_matches,
  (SELECT COUNT(*) FROM public.registry_programs_crosswalk c
   WHERE c.registry_program_id = t.id) AS crosswalk_matches,
  (SELECT COUNT(*) FROM public.intake_promotion_log l
   WHERE l.registry_record_id = t.id) AS promotion_log_matches,
  (SELECT COUNT(*) FROM public.intake_staging s
   WHERE s.promoted_record_id = t.id) AS promoted_staging_matches
FROM targets t;
```

## Verification

25 targeted tests pass: the rendered Arizona record keeps its federal source value while displaying uncertainty; a legislator keeps its stored category without a benefit-program assertion; missing classifications stay unknown; existing query scoping, pagination, contact retention, and error states pass. TypeScript passes. Changes introduce no owned camelCase identifiers; existing React and tRPC package APIs retain their required identifiers.
