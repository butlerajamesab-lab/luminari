import { createHash } from 'node:crypto';

const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const LAYERS = new Set(['H','W','A','O','D','R']);
const hash = value => createHash('sha256').update(value,'utf8').digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value);
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key,canonical(value[key])]));
  return value;
}
function invalid(reason) { throw Object.assign(new Error('selected_output_integrity_' + reason), {status:502}); }
function finish(detail,result) {
  if (Object.hasOwn(detail,'output_integrity') &&
      JSON.stringify(canonical(detail.output_integrity)) !== JSON.stringify(canonical(result))) invalid('producer_receipt_mismatch');
  return result;
}

/**
 * Verify received selected-runtime source/output integrity. This is not legal
 * semantic certification, original-byte acquisition proof, or admission.
 * Offsets are PostgreSQL character/code-point coordinates, never JS UTF-16.
 * Raw spans and effective_text are NOT claimed to be the internal clean
 * classification projection.
 */
export function inspect_selected_output_integrity(detail, selector) {
  if (!object(detail) || detail.contract !== 'rosetta-rule-live-detail-v1') invalid('contract');
  const source=detail.source, target=detail.target;
  if (!object(source) || !object(target) ||
      !UUID.test(source.source_content_id || '') || !integer(source.source_document_id) || source.source_document_id <= 0 ||
      typeof source.source_text !== 'string' || !HASH.test(source.source_content_hash || '') ||
      !selector || source.source_content_id.toLowerCase() !== String(selector.source_content_id).toLowerCase() ||
      source.source_content_hash !== String(selector.source_content_hash).toLowerCase()) invalid('source_identity');
  if (hash(source.source_text) !== source.source_content_hash) invalid('source_hash');
  const observed={
    contract:'rosetta-selected-output-integrity-v1',
    attestation_type:'received_source_bound_output_integrity_v1',
    source_content_id:source.source_content_id.toLowerCase(),
    source_document_id:source.source_document_id,
    source_content_hash:source.source_content_hash,
    ruleset_version:target.ruleset_version ?? null,
    ruleset_sha256:target.ruleset_sha256 ?? null,
    read_contract_sha256:target.read_contract_sha256 ?? null,
    output_sha256:null,
    semantic_certification:false,
    publication_authorized:false,
    failure_receipts_exposed:Array.isArray(detail.failure_receipts),
  };
  if (target.identity_valid !== true || target.engine_identity_valid !== true ||
      target.read_identity_valid !== true || target.read_contract_configured !== true ||
      typeof target.ruleset_version !== 'string' || !target.ruleset_version.trim() ||
      !HASH.test(target.ruleset_sha256 || '') ||
      target.ruleset_sha256 !== target.installed_ruleset_sha256 ||
      !HASH.test(target.read_contract_sha256 || '') ||
      target.read_contract_sha256 !== target.installed_read_contract_sha256) invalid('target_identity');
  if (detail.hold_receipt != null || (Array.isArray(detail.failure_receipts) && detail.failure_receipts.length > 0)) {
    return finish(detail,{...observed,status:'not_ready',reason:'hold_or_failure_present'});
  }
  const d=detail.decomposition;
  if (!object(d) || d.outcome !== 'decomposed') {
    return finish(detail,{...observed,status:'not_ready',reason:'selected_output_not_decomposed'});
  }
  if (d.source_content_id !== source.source_content_id || d.source_content_hash !== source.source_content_hash ||
      d.ruleset_version !== target.ruleset_version || d.ruleset_sha256 !== target.ruleset_sha256) invalid('output_identity');
  if (!Array.isArray(detail.units) || !Array.isArray(detail.sections) ||
      !integer(d.unit_count) || d.unit_count < 1 || d.unit_count !== detail.units.length ||
      !integer(d.section_count) || d.section_count < 1 || d.section_count !== detail.sections.length) invalid('counts');
  // Retain only requested boundary indices, not one array element per source
  // character. This keeps large-source verification linear with bounded metadata.
  const boundaries=new Set([0,...detail.units.flatMap(u=>[u?.raw_start,u?.raw_end]),
    ...detail.sections.flatMap(s=>[s?.raw_start,s?.raw_end])]);
  const offsets=new Map();
  let characterCount=0,utf16=0;
  for (const character of source.source_text) {
    if (boundaries.has(characterCount)) offsets.set(characterCount,utf16);
    characterCount++; utf16+=character.length;
  }
  if (boundaries.has(characterCount)) offsets.set(characterCount,utf16);
  const sections=new Map(),units=[],sectionCounts=new Map(),layerCounts={};
  let lastEnd=-1, lastSectionOrd=-1;
  for (const s of detail.sections) {
    if (!object(s) || s.source_content_id !== source.source_content_id || s.ruleset_version !== target.ruleset_version || !integer(s.section_ord) || s.section_ord < 0 || s.section_ord <= lastSectionOrd ||
        !integer(s.raw_start) || !integer(s.raw_end) || s.raw_start < 0 || s.raw_end <= s.raw_start ||
        s.raw_end > characterCount || !integer(s.unit_count) || s.unit_count < 1 ||
        s.raw_start < lastEnd) invalid('section_span');
    sections.set(s.section_ord,s); lastEnd=s.raw_end; lastSectionOrd=s.section_ord;
  }
  lastEnd=-1;
  for (let i=0; i<detail.units.length; i++) {
    const u=detail.units[i], section=sections.get(u?.section_ord);
    if (!object(u) || u.source_content_id !== source.source_content_id || u.ruleset_version !== target.ruleset_version || u.unit_ord !== i+1 || !integer(u.raw_start) || !integer(u.raw_end) ||
        u.raw_start < 0 || u.raw_start < lastEnd || u.raw_end <= u.raw_start || u.raw_end > characterCount ||
        !section || u.raw_start < section.raw_start || u.raw_end > section.raw_end) invalid('unit_span');
    const raw=source.source_text.slice(offsets.get(u.raw_start),offsets.get(u.raw_end));
    if (u.raw_text !== raw || !HASH.test(u.text_sha256 || '') || hash(raw) !== u.text_sha256) invalid('unit_hash');
    if (!Array.isArray(u.layers) || new Set(u.layers).size !== u.layers.length ||
        u.layers.some(layer=>!LAYERS.has(layer))) invalid('unit_layers');
    if (u.effective_text != null && typeof u.effective_text !== 'string') invalid('effective_text');
    for (const layer of u.layers) layerCounts[layer]=(layerCounts[layer] || 0)+1;
    sectionCounts.set(u.section_ord,(sectionCounts.get(u.section_ord)||0)+1);
    units.push({unit_ord:u.unit_ord,section_ord:u.section_ord,kind:u.kind ?? null,path:u.path ?? null,
      raw_start:u.raw_start,raw_end:u.raw_end,text_sha256:u.text_sha256,layers:[...u.layers],
      disposition:u.disposition ?? null,rules:u.rules ?? [],effective_text_sha256:typeof u.effective_text === 'string' ? hash(u.effective_text) : null});
    lastEnd=u.raw_end;
  }
  if ([...sections.values()].some(s=>sectionCounts.get(s.section_ord)!==s.unit_count)) invalid('section_count');
  if (!object(d.layer_counts) || Object.entries(d.layer_counts).some(([key,value]) =>
      !LAYERS.has(key) || !integer(value) || value < 0 || value !== (layerCounts[key] || 0)) ||
      Object.entries(layerCounts).some(([key,value])=>d.layer_counts[key]!==value)) invalid('layer_counts');
  const output={
    source_content_id:source.source_content_id.toLowerCase(),source_content_hash:source.source_content_hash,
    ruleset_version:d.ruleset_version,ruleset_sha256:d.ruleset_sha256,
    unit_count:d.unit_count,section_count:d.section_count,layer_counts:d.layer_counts,flags:d.flags ?? {},
    sections:detail.sections.map(s=>({section_ord:s.section_ord,label:s.label ?? null,
      raw_start:s.raw_start,raw_end:s.raw_end,unit_count:s.unit_count})),
    units,
  };
  return finish(detail,{...observed,status:'verified',reason:null,output_sha256:hash(JSON.stringify(canonical(output))),
    verified_invariants:{
      source_text_sha256_matches:true,unit_source_slices_match:true,unit_text_hashes_match:true,
      section_spans_within_source:true,unit_and_section_counts_match:true,selected_identity_matches:true,
    }});
}
