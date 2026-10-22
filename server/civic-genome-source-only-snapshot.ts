/**
 * Canonical source-only projection envelope for NEW Civic Genome bill history.
 *
 * Do not alter existing sealed history or its record_hash. For future history
 * captures, preserve source/legislative fields but omit untrusted historical
 * Rosetta execution receipts and the unqualified structural interpretation hash.
 * The caller hashes the sanitized JSON, making provenance of each new record
 * deterministic and consistent with the stored record_json.
 *
 * The SQL expression assumes a "bill" table alias. Keep it in one place so
 * Docket projection and family resolution cannot diverge.
 */
export const CIVIC_GENOME_SOURCE_ONLY_BILL_RECORD_SQL = `
  to_jsonb(bill) ||
  jsonb_build_object(
    'structural_dna_json',
       coalesce(bill.structural_dna_json,'{}'::jsonb)
         - 'rosetta_assembly'
         - 'rosetta_source_receipt',
    'rosetta_extraction_run_id', NULL,
    'structural_dna_hash',
      case
        when bill.rosetta_extraction_run_id is not null
          or bill.structural_dna_json ? 'rosetta_assembly'
          or bill.structural_dna_json ? 'rosetta_source_receipt'
        then ''
        else bill.structural_dna_hash
      end
  )
` as const;
