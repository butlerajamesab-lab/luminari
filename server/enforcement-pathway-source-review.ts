/**
 * Individually reviewed source bindings, 2026-09-14. These attest only that the
 * stored parent JSON equals the indicated source-file record. They do not verify
 * legal assertions or make any model user-routable. No fuzzy name/phone match.
 * Fingerprints use intake-spine canonicalStringify (sorted object keys, ordered
 * arrays), excluding only the legacy ingest-added top-level `_key` property.
 * Colorado and the ten parents of the existing 36 step objects were compared.
 */
export const reviewed_enforcement_artifact = {
  artifact_key: "Everything backbone related/enforcement_pathway_models_complete(1).json",
  source_sha256: "900f6f9934285346f360da45de862a1a1a1388ec3b30374601ef924b571d102f",
};

export const reviewed_enforcement_model_bindings = [
  {
    "model_id": "e1af50e0-23d0-4529-ad3b-c2774b8c7637",
    "pathway_id": "fed_cfpb_001",
    "source_locator": "json:$.federal_pathways.cfpb_debt_collection_model",
    "source_record_sha256": "50071f804b47c53d4ae7a04c0a94498398f5824f27c82613f1375dcef6c52a72",
    "jurisdiction": "federal",
    "source_bucket": "federal_pathways",
    "source_key": "cfpb_debt_collection_model"
  },
  {
    "model_id": "8630009b-f315-4667-992f-63cca3827dcd",
    "pathway_id": "fed_dol_001",
    "source_locator": "json:$.federal_pathways.dol_wage_hour_model",
    "source_record_sha256": "3d2deedb3a3a5d29f86237609ceb7bdc217b28c51210eacf923c3406c85cfc3c",
    "jurisdiction": "federal",
    "source_bucket": "federal_pathways",
    "source_key": "dol_wage_hour_model"
  },
  {
    "model_id": "519931a8-a3f3-49fc-b5db-f90c18d62f91",
    "pathway_id": "fed_eeoc_001",
    "source_locator": "json:$.federal_pathways.eeoc_charge_model",
    "source_record_sha256": "835fd9e0b22cb464fe8672c13fd9d7d8ef3ebb5f01113b12ab3267f43decbdaa",
    "jurisdiction": "federal",
    "source_bucket": "federal_pathways",
    "source_key": "eeoc_charge_model"
  },
  {
    "model_id": "1d5cd586-1f50-485b-93b5-e765221916c8",
    "pathway_id": "fed_ftc_001",
    "source_locator": "json:$.federal_pathways.ftc_unfair_practices_model",
    "source_record_sha256": "ba0706f82ba6af47aa088a728241331fe37dc669a7a2eef8cde4ee072f563f61",
    "jurisdiction": "federal",
    "source_bucket": "federal_pathways",
    "source_key": "ftc_unfair_practices_model"
  },
  {
    "model_id": "82360490-dcfe-4dcb-8516-9a9b857e41c2",
    "pathway_id": "fed_hud_001",
    "source_locator": "json:$.federal_pathways.hud_housing_discrimination_model",
    "source_record_sha256": "25297610273d5107aea7b230f75c957d18121ff9447704f070491133c24c215a",
    "jurisdiction": "federal",
    "source_bucket": "federal_pathways",
    "source_key": "hud_housing_discrimination_model"
  },
  {
    "model_id": "fc399c77-225c-4584-90ab-ba358b4fcbbf",
    "pathway_id": "fed_osha_001",
    "source_locator": "json:$.federal_pathways.osha_retaliation_model",
    "source_record_sha256": "797a258979e55850a498d6a9da8966d9b457d9fc8aa3ba778699554a234e10da",
    "jurisdiction": "federal",
    "source_bucket": "federal_pathways",
    "source_key": "osha_retaliation_model"
  },
  {
    "model_id": "e27c8480-7ef3-4bc2-a9a0-75be3cf29198",
    "pathway_id": "state_wage_co",
    "source_locator": "json:$.state_labor_board_pathways.wage_theft.colorado",
    "source_record_sha256": "071381069d7f79bf9b486875a4e5ae45fd133dcf284104c6f4f2794398d42278",
    "jurisdiction": "Colorado",
    "source_bucket": "state_labor_board_pathways",
    "source_key": "colorado"
  },
  {
    "model_id": "44298fd7-5dc3-4d1e-983c-7d236dfa3940",
    "pathway_id": "state_wage_ak",
    "source_locator": "json:$.state_labor_board_pathways.wage_theft.alaska",
    "source_record_sha256": "66f129ac69a9cbe5b27d06d400dbc2b391a4b2f8ad603a97d13749c61a5f638c",
    "jurisdiction": "Alaska",
    "source_bucket": "state_labor_board_pathways",
    "source_key": "alaska"
  },
  {
    "model_id": "49c52bc8-7d90-4c10-8f52-74a59685387c",
    "pathway_id": "state_wage_al",
    "source_locator": "json:$.state_labor_board_pathways.wage_theft.alabama",
    "source_record_sha256": "b002745e7190aa1ddfd2243c2d99eb9671295d9df51235f40830b49f066e02e1",
    "jurisdiction": "Alabama",
    "source_bucket": "state_labor_board_pathways",
    "source_key": "alabama"
  },
  {
    "model_id": "e3beb0c3-5100-4f3b-9b61-db00454cc97a",
    "pathway_id": "state_wage_ca",
    "source_locator": "json:$.state_labor_board_pathways.wage_theft.california",
    "source_record_sha256": "a0199ef8cb61aac0947e3897eaeee1f6c98b3b433ce650fa0538955212648034",
    "jurisdiction": "California",
    "source_bucket": "state_labor_board_pathways",
    "source_key": "california"
  },
  {
    "model_id": "6124a1f8-3608-4b67-8afe-3b986bbef6c5",
    "pathway_id": "state_wage_federal",
    "source_locator": "json:$.state_labor_board_pathways.wage_theft.federal",
    "source_record_sha256": "09e3f21bf7706db3786047569180b110359090bbeadcd4e8ba62515a1cbd271d",
    "jurisdiction": "federal",
    "source_bucket": "state_labor_board_pathways",
    "source_key": "federal"
  }
] as const;
