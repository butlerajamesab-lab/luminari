// Approve directory addresses for the Civic Map — wave runner.
//
// Per Alexander, 2026-11-09: the addresses are in the records;
// "they just need approval — approve them." Approval in this
// system is the location-resolution ledger
// (public.luminari_resource_location_resolutions): a resource's
// location appears on the Civic Map only when a resolution marks
// it map_eligible and a linked location row carries coordinates.
//
// This runner writes those resolutions for resources whose
// directory record already carries a street address, and geocodes
// each approved address with the US Census batch geocoder — the
// same source and labels as the 2026-11-06 manual wave
// (us_census_geocoder_batch, census_match_exact /
// census_match_non_exact). Rules, all declared:
//
// - The address approved is the resource's OWN address from its
//   directory location row. Nothing is invented or normalized
//   beyond trimming and removing a duplicated trailing
//   "City, ST ZIP" from the street field for the geocoder.
// - A resource with more than one distinct address is skipped
//   (counted, listed) — multi-site organizations need the
//   network treatment, not a silent pick.
// - A mailing address (street field leading with "PO Box") is
//   reviewed and recorded with disposition mailing_address_only
//   and map_eligible=false. A post-office box is not a physical
//   public site and never becomes a pin.
// - Coordinates are asserted ONLY from a Census match. A
//   no-match keeps map_eligible=true (the review decision stands,
//   as in the 2026-11-06 wave) with coordinate_quality
//   census_no_match and no coordinates — addressed, approved,
//   unpinned, and labeled as such.
// - Re-runnable: resources that already carry a resolution with
//   this review_version are skipped.
//
// Usage:
//   node scripts/approve-directory-addresses.mjs --mode locations [--apply]
// Without --apply the runner geocodes and prints the full
// reconciliation summary but writes nothing.

import crypto from 'node:crypto';
// pg is imported dynamically in main() so the pure helpers in
// this module stay loadable (and testable) without the driver.

export const REVIEW_VERSION = 'v3_14_approval_wave_v3';
export const WAVE_ID = 'approval-wave-2026-11-09';
export const GEOCODE_SOURCE = 'us_census_geocoder_batch (Public_AR_Current / Current_Current, 2026-11-09)';

export function isMailingAddress(street) {
  return /^\s*p\.?\s*o\.?\s*box\b/i.test(street || '');
}

export function streetForGeocoder(addressLine1, addressLine2) {
  let street = [addressLine1, addressLine2]
    .map((part) => (part || '').trim())
    .filter(Boolean)
    .join(' ');
  const embedded = street.match(/^(.*?),\s*[^,]+,\s*[A-Z]{2}\s+\d{5}(-\d{4})?$/);
  if (embedded) street = embedded[1];
  return street.trim();
}

// Minimal RFC 4180 row parser, sufficient for Census batch output.
export function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

export function buildBatchCsv(targets) {
  const esc = (value) => {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return targets
    .map((t, i) => [i + 1, t.street, t.city, t.state, t.postalCode].map(esc).join(','))
    .join('\n') + '\n';
}

// Census result columns: id, input, status, type, matched, coords, tigerline, side.
// A Tie yields several rows for one id; the first is taken and the
// tie is recorded. Returns a Map keyed by the 1-based batch id.
export function parseGeocodeResults(text) {
  const byId = new Map();
  for (const cols of parseCsvRows(text)) {
    const id = Number(cols[0]);
    if (!Number.isInteger(id) || byId.has(id)) continue;
    const status = (cols[2] || '').trim();
    const type = (cols[3] || '').trim();
    const coords = (cols[5] || '').trim();
    const matched = status === 'Match' || status === 'Tie';
    let latitude = null;
    let longitude = null;
    if (matched && coords) {
      const [lon, lat] = coords.split(',').map(Number);
      if (Number.isFinite(lat) && Number.isFinite(lon)) { latitude = lat; longitude = lon; }
    }
    byId.set(id, {
      status,
      type,
      matchedAddress: (cols[4] || '').trim(),
      latitude,
      longitude,
      quality: !matched
        ? 'census_no_match'
        : status === 'Match' && type === 'Exact' ? 'census_match_exact' : 'census_match_non_exact',
    });
  }
  return byId;
}

async function fetchTargets(client) {
  const { rows } = await client.query(`
    select l.resource_entity_id,
           e.resource_name,
           l.address_line1, l.address_line2, l.city, l.county, l.state, l.postal_code,
           l.location_id as source_location_id,
           (l.address_line1, l.city, l.state, l.postal_code) as address_key
    from public.v_luminari_resource_locations_current_v3_13 l
    join public.luminari_resource_entities e
      on e.resource_entity_id = l.resource_entity_id
    where l.manual_map_eligible is null
      and l.address_line1 is not null and btrim(l.address_line1) <> ''
      and l.city is not null and l.state is not null
    order by l.resource_entity_id
  `);
  const byResource = new Map();
  for (const row of rows) {
    if (!byResource.has(row.resource_entity_id)) byResource.set(row.resource_entity_id, []);
    byResource.get(row.resource_entity_id).push(row);
  }
  const targets = [];
  const skippedMulti = [];
  const skippedDone = [];
  for (const [resourceId, group] of byResource) {
    const distinct = new Map(group.map((r) => [JSON.stringify(r.address_key), r]));
    if (distinct.size > 1) { skippedMulti.push(resourceId); continue; }
    targets.push(distinct.values().next().value);
  }
  const { rows: done } = await client.query(
    `select distinct resource_entity_id from public.luminari_resource_location_resolutions where review_version = $1`,
    [REVIEW_VERSION],
  );
  const doneSet = new Set(done.map((r) => r.resource_entity_id));
  return {
    targets: targets.filter((t) => {
      if (doneSet.has(t.resource_entity_id)) { skippedDone.push(t.resource_entity_id); return false; }
      return true;
    }),
    skippedMulti,
    skippedDone,
  };
}

async function geocodeBatch(targets) {
  const csv = buildBatchCsv(targets);
  const form = new FormData();
  form.append('addressFile', new Blob([csv], { type: 'text/csv' }), 'addresses.csv');
  form.append('benchmark', 'Public_AR_Current');
  form.append('vintage', 'Current_Current');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 600_000);
  try {
    const response = await fetch('https://geocodews.census.gov/geocoder/locations/addressbatch', {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`census_geocoder_http_${response.status}`);
    return parseGeocodeResults(await response.text());
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  const mode = (process.argv.find((a) => a.startsWith('--mode=')) || '--mode=locations').split('=')[1];
  if (mode !== 'locations') throw new Error(`unsupported_mode: ${mode}`);

  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { targets, skippedMulti, skippedDone } = await fetchTargets(client);
    const prepared = targets.map((t) => ({
      ...t,
      street: streetForGeocoder(t.address_line1, t.address_line2),
      city: (t.city || '').trim(),
      state: (t.state || '').trim(),
      postalCode: (t.postal_code || '').trim(),
      mailing: isMailingAddress(streetForGeocoder(t.address_line1, t.address_line2)),
    }));
    const manifestSha = crypto.createHash('sha256')
      .update(prepared.map((t) => t.resource_entity_id).sort().join(','))
      .digest('hex');

    const geocoded = await geocodeBatch(prepared);
    const summary = {
      wave: WAVE_ID,
      review_version: REVIEW_VERSION,
      mode,
      apply,
      targets: prepared.length,
      skipped_multi_address: skippedMulti.length,
      skipped_already_in_wave: skippedDone.length,
      mailing_addresses: prepared.filter((t) => t.mailing).length,
      census_exact: 0,
      census_non_exact: 0,
      census_no_match: 0,
      inserted_resolutions: 0,
      inserted_locations: 0,
      manifest_sha256: manifestSha,
    };

    const decisions = prepared.map((t, i) => {
      const geo = geocoded.get(i + 1) || { status: 'No_Match', quality: 'census_no_match', latitude: null, longitude: null, matchedAddress: '' };
      if (geo.quality === 'census_match_exact') summary.census_exact += 1;
      else if (geo.quality === 'census_match_non_exact') summary.census_non_exact += 1;
      else summary.census_no_match += 1;
      return { target: t, geo };
    });

    if (apply) {
      await client.query('begin');
      try {
        for (const { target: t, geo } of decisions) {
          const fullAddress = [t.street, `${t.city}, ${t.state} ${t.postalCode}`.trim()].filter(Boolean).join(', ');
          const { rows: [resolution] } = await client.query(
            `insert into public.luminari_resource_location_resolutions (
               resource_entity_id, review_version, jurisdiction_state, resource_name,
               live_resource_name_at_review, disposition, reviewed_address, location_kind,
               map_eligible, source_type, source_reference, review_note,
               malformed_location_ids, metadata, reviewed_at, updated_at
             ) values ($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now(),now())
             returning resolution_id`,
            [
              t.resource_entity_id,
              REVIEW_VERSION,
              t.state,
              t.resource_name,
              t.mailing ? 'mailing_address_only' : 'replace_with_physical',
              fullAddress,
              t.mailing ? 'mailing_address' : 'physical_site',
              !t.mailing,
              'directory_record_approval_wave',
              `${WAVE_ID}: source location ${t.source_location_id}`,
              t.mailing
                ? 'Reviewed in the 2026-11-09 approval wave (Alexander: approve the addressed records). Mailing address only — not a physical public site, so it is recorded but not map-eligible.'
                : 'Approved in the 2026-11-09 approval wave (Alexander: approve the addressed records). Address is the resource\u2019s own directory-record address; coordinates come only from the US Census batch geocoder.',
              [],
              JSON.stringify({
                review_method: 'deterministic_address_approval_wave_v1',
                decision_ordinality: 1,
                coordinates_asserted: false,
                source_rows_preserved: true,
                wave_manifest_sha256: manifestSha,
              }),
            ],
          );
          summary.inserted_resolutions += 1;
          await client.query(
            `insert into public.luminari_resource_locations (
               resource_entity_id, address_line1, address_line2, city, county, state,
               postal_code, country, latitude, longitude, coordinate_quality,
               geocode_source, source_table, source_pk, metadata
             ) values ($1,$2,$3,$4,$5,$6,$7,'US',$8,$9,$10,$11,'luminari_resource_location_resolutions',$12,$13)`,
            [
              t.resource_entity_id,
              t.address_line1, t.address_line2, t.city, t.county, t.state, t.postal_code,
              t.mailing ? null : geo.latitude,
              t.mailing ? null : geo.longitude,
              t.mailing ? 'not_geocoded_mailing_address' : geo.quality,
              GEOCODE_SOURCE,
              resolution.resolution_id,
              JSON.stringify({
                approval_wave: WAVE_ID,
                source_location_id: t.source_location_id,
                census_match_status: geo.status,
                census_match_type: geo.type,
                census_matched_address: geo.matchedAddress,
              }),
            ],
          );
          summary.inserted_locations += 1;
        }
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    }

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
