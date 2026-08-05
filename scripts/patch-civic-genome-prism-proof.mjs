import { readFileSync, writeFileSync } from "node:fs";

const path = "client/src/pages/CivicGenome.tsx";
let source = readFileSync(path, "utf8");

const import_anchor = 'import { trpc } from "@/lib/trpc";';
const import_replacement = `${import_anchor}\nimport { PrismProof } from "@/components/civic-genome/PrismProof";`;
if (!source.includes('import { PrismProof } from "@/components/civic-genome/PrismProof";')) {
  if (!source.includes(import_anchor)) throw new Error("civic_genome_prism_proof_import_anchor_missing");
  source = source.replace(import_anchor, import_replacement);
}

const card_anchor = '<Value value={trait.normalized_value_json}/><div style={{ fontFamily: mono, fontSize: ".58rem", color: p.muted, marginTop: ".55rem", overflowWrap: "anywhere" }}>';
const card_replacement = '<Value value={trait.normalized_value_json}/><PrismProof trait={trait}/><div style={{ fontFamily: mono, fontSize: ".58rem", color: p.muted, marginTop: ".55rem", overflowWrap: "anywhere" }}>';
if (!source.includes("<PrismProof trait={trait}/>")) {
  if (!source.includes(card_anchor)) throw new Error("civic_genome_prism_proof_card_anchor_missing");
  source = source.replace(card_anchor, card_replacement);
}

writeFileSync(path, source);
