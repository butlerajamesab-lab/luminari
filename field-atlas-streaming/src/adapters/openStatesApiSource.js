import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const OPEN_STATES_BASE_URL = 'https://v3.openstates.org';
const DEFAULT_API_BASE_URL = process.env.FIELD_ATLAS_API_BASE_URL || 'http://localhost:8787';

function buildOpenStatesClient(apiKey) {
  return axios.create({
    baseURL: OPEN_STATES_BASE_URL,
    timeout: 30_000,
    headers: {
      'X-API-KEY': apiKey,
      Accept: 'application/json',
    },
  });
}

export async function fetchOpenStatesBills({ jurisdiction = 'wa', apiKey, session, page = 1, perPage = 20 }) {
  if (!apiKey) throw new Error('OPEN_STATES_API_KEY is required for live OpenStates fetches.');
  const client = buildOpenStatesClient(apiKey);
  const params = { jurisdiction, page, per_page: perPage, include: ['abstracts', 'versions'] };
  if (session) params.session = session;
  const response = await client.get('/bills', { params });
  return response.data.results ?? [];
}

export function normalizeOpenStatesBillToSignal(bill, { jurisdiction = 'wa' } = {}) {
  const abstractText = Array.isArray(bill.abstracts) && bill.abstracts[0]?.abstract ? bill.abstracts[0].abstract : '';
  const confidence = abstractText ? 0.82 : 0.62;
  return {
    stream_id: 'open_states',
    timestamp: bill.updated_at || bill.created_at || new Date().toISOString(),
    signal_type: 'legislation.bill',
    spacetime: {
      region: jurisdiction,
      lat_bucket: null,
      lon_bucket: null,
    },
    provenance: {
      channel: 'external',
      confidence,
      source_system: 'openstates',
    },
    payload: {
      external_id: bill.id,
      identifier: bill.identifier,
      title: bill.title,
      classification: bill.classification,
      subject: bill.subject,
      legislative_session: bill.legislative_session || bill.session_identifier,
      abstract: abstractText,
      source_url: bill.openstates_url,
      raw: bill,
    },
  };
}

export function sampleOpenStatesBills() {
  return [
    {
      id: 'ocd-bill/sample-wa-hb-1001',
      identifier: 'HB 1001',
      title: 'Improving access to public benefit navigation.',
      classification: ['bill'],
      subject: ['Human Services'],
      legislative_session: '2025-2026',
      abstracts: [{ abstract: 'Creates a coordinated public benefit navigation program.' }],
      openstates_url: 'https://openstates.org/wa/bills/2025-2026/HB1001/',
      updated_at: new Date(Date.now() - 4 * 3_600_000).toISOString(),
    },
    {
      id: 'ocd-bill/sample-wa-sb-2002',
      identifier: 'SB 2002',
      title: 'Concerning grant reporting modernization.',
      classification: ['bill'],
      subject: ['Government Operations'],
      legislative_session: '2025-2026',
      abstracts: [],
      openstates_url: 'https://openstates.org/wa/bills/2025-2026/SB2002/',
      updated_at: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    },
    {
      id: 'ocd-bill/sample-wa-hb-3003',
      identifier: 'HB 3003',
      title: 'Adjusting state procurement transparency rules.',
      classification: ['bill'],
      subject: ['Procurement'],
      legislative_session: '2025-2026',
      abstracts: [],
      openstates_url: 'https://openstates.org/wa/bills/2025-2026/HB3003/',
      updated_at: new Date(Date.now() - 1 * 3_600_000).toISOString(),
    },
  ];
}

export async function ingestOpenStatesSignals({
  apiBaseUrl = DEFAULT_API_BASE_URL,
  apiKey = process.env.OPEN_STATES_API_KEY,
  jurisdiction = 'wa',
  session,
  page = 1,
  perPage = 20,
  sample = false,
} = {}) {
  const bills = sample ? sampleOpenStatesBills() : await fetchOpenStatesBills({ jurisdiction, apiKey, session, page, perPage });
  const signals = bills.map((bill) => normalizeOpenStatesBillToSignal(bill, { jurisdiction }));
  const response = await axios.post(`${apiBaseUrl}/v1/ingest/signals`, {
    source_id: 'open_states',
    jurisdiction_id: jurisdiction,
    module_hint: 'legislation',
    signals,
  });
  return response.data;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sample = process.argv.includes('--sample');
  ingestOpenStatesSignals({ sample })
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      const details = error.response?.data ?? error.message;
      console.error(JSON.stringify({ error: details }, null, 2));
      process.exit(1);
    });
}
