import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeCanonicalHash } from "./lib/determinism";
import type { civic_genome_external_snapshot_v1 } from "./civic-genome-external-snapshot-contract";
import {
  CIVIC_GENOME_ATLAS_DELIVERY_CONTRACT_ID,
  CIVIC_GENOME_ATLAS_DELIVERY_CONTRACT_VERSION,
  CIVIC_GENOME_ATLAS_DELIVERY_PATH,
  CIVIC_GENOME_ATLAS_SOURCE_SCHEMA_ID,
  build_civic_genome_atlas_delivery_body_v1,
  deliver_civic_genome_snapshot_to_atlas_v1,
  sign_civic_genome_atlas_delivery_v1,
} from "./civic-genome-atlas-handoff";
import { civic_genome_atlas_handoff_configuration_from_environment } from "./civic-genome-atlas-handoff-startup";

const KEY_ID="lighthouse-atlas-civic-genome-v1";
const SECRET="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const H1="1".repeat(64), H2="2".repeat(64), H3="3".repeat(64), H4="4".repeat(64);
function snapshot(): civic_genome_external_snapshot_v1 { return {
  contract_id:"civic_genome.external_snapshot.v1",contract_version:"1.0.0",canonical_owner:"lighthouse/civic_genome",snapshot_id:"cg-family-snapshot-proof",snapshot_kind:"baseline_export",immutable:true,
  scope:{scope_type:"family",scope_ids:["a9620a24-9ae4-487d-a55b-5e646c729432"],jurisdiction_codes:["WA"]},as_of:"2026-08-06T18:00:00.000Z",methodology_version:"civic_genome_external_family_snapshot.1.0.0",
  components:[],component_count:0,unresolved_conditions:[],excluded_component_types:[],completeness_state:"bounded_complete",snapshot_hash:H3,
  export_receipt:{export_receipt_id:"cg-export-proof",export_receipt_hash:H4,snapshot_hash:H3,deterministic_replay_key:H1,replay_state:"original",source_commit_sha:"abc123",generated_at:"2026-08-06T18:00:01.000Z"},
}; }
function receiverReceipt(source:civic_genome_external_snapshot_v1){
 const basis={delivery_contract_id:CIVIC_GENOME_ATLAS_DELIVERY_CONTRACT_ID,delivery_contract_version:CIVIC_GENOME_ATLAS_DELIVERY_CONTRACT_VERSION,validation_state:"validated_source_native",authenticated:true,auth_scheme:"hmac-sha256",key_id:KEY_ID,source_schema_id:CIVIC_GENOME_ATLAS_SOURCE_SCHEMA_ID,source_contract_id:source.contract_id,source_contract_version:source.contract_version,source_snapshot_id:source.snapshot_id,source_snapshot_hash:source.snapshot_hash,source_export_receipt_id:source.export_receipt.export_receipt_id,source_export_receipt_hash:source.export_receipt.export_receipt_hash,source_component_count:source.component_count,source_completeness_state:source.completeness_state,atlas_binding_hash:H2,verification_mapping_state:"source_native_preserved_unmapped",persistence_requested:true,projection_executed:false,no_mutation:true};
 const hash=computeCanonicalHash(basis); return {...basis,delivery_receipt_id:`acg-delivery-${hash.slice(0,32)}`,delivery_receipt_hash:hash,persistence_status:"inserted",persisted:true};
}

describe("Civic Genome Atlas handoff",()=>{
 it("signs canonical body deterministically",()=>{const body=build_civic_genome_atlas_delivery_body_v1(snapshot());expect(sign_civic_genome_atlas_delivery_v1(body,KEY_ID,SECRET)).toBe(sign_civic_genome_atlas_delivery_v1(JSON.parse(JSON.stringify(body)),KEY_ID,SECRET));});
 it("accepts only persisted no-projection source-native receipt",async()=>{const source=snapshot();let headers:any;const receipt=await deliver_civic_genome_snapshot_to_atlas_v1({snapshot:source,url:`https://atlas.example${CIVIC_GENOME_ATLAS_DELIVERY_PATH}`,key_id:KEY_ID,secret:SECRET,fetcher:async(_u,init)=>{headers=init?.headers;return {ok:true,status:200,text:async()=>JSON.stringify(receiverReceipt(source))} as Response;}});expect(headers["x-atlas-civic-genome-key-id"]).toBe(KEY_ID);expect(receipt.persisted).toBe(true);expect(receipt.projection_executed).toBe(false);});
 it("requires complete environment",()=>{expect(civic_genome_atlas_handoff_configuration_from_environment({})).toBeNull();expect(()=>civic_genome_atlas_handoff_configuration_from_environment({CIVIC_GENOME_ATLAS_HANDOFF_FAMILY_ID:"a9620a24-9ae4-487d-a55b-5e646c729432"})).toThrow(/complete_configuration/);});
 it("uses the governed producer instead of the pure dataset builder",()=>{const startup=readFileSync(new URL("./civic-genome-atlas-handoff-startup.ts",import.meta.url),"utf8");expect(startup).toContain("produce_civic_genome_family_snapshot_v1");expect(startup).not.toContain("build_civic_genome_family_snapshot_v1");});
});
