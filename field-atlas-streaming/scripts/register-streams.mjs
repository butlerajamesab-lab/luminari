import dotenv from 'dotenv';
import { supabase } from '../src/supabaseClient.js';

dotenv.config();

export const STREAMS = [
  {
    stream_id: 'court_listener',
    source_id: 'court_listener',
    jurisdiction_id: 'us-federal',
    module_hint: 'judicial',
    throughput_profile: 'medium',
    safety_profile: 'restricted',
    governance_contract_id: 'gc_lighthouse_judicial_v1',
    status: 'active',
  },
  {
    stream_id: 'open_states',
    source_id: 'open_states',
    jurisdiction_id: 'wa',
    module_hint: 'legislation',
    throughput_profile: 'medium',
    safety_profile: 'default',
    governance_contract_id: 'gc_lighthouse_legislation_v1',
    status: 'active',
  },
  {
    stream_id: 'grants_gov',
    source_id: 'grants_gov',
    jurisdiction_id: 'us-federal',
    module_hint: 'grants',
    throughput_profile: 'low',
    safety_profile: 'default',
    governance_contract_id: 'gc_lighthouse_grants_v1',
    status: 'active',
  },
  {
    stream_id: 'pro_publica',
    source_id: 'pro_publica',
    jurisdiction_id: 'us-federal',
    module_hint: 'nonprofit',
    throughput_profile: 'low',
    safety_profile: 'default',
    governance_contract_id: 'gc_lighthouse_nonprofit_v1',
    status: 'active',
  },
];

const now = new Date().toISOString();
const rows = STREAMS.map((stream) => ({ ...stream, created_at: now, updated_at: now }));

const { data, error } = await supabase
  .from('streams')
  .upsert(rows, { onConflict: 'stream_id' })
  .select('*')
  .order('stream_id', { ascending: true });

if (error) {
  console.error(error.message);
  process.exit(1);
}

console.log(JSON.stringify({ registered_count: data.length, streams: data.map((stream) => stream.stream_id) }, null, 2));
