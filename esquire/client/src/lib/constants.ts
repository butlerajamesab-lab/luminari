import type { CaseStatus, SafetyLevel, EventType, EvidenceType } from './types';

export const STATUS_CONFIG: Record<CaseStatus, { label: string; className: string }> = {
  intake: { label: 'Intake', className: 'bg-blue-600/20 text-blue-300 border-blue-500/30' },
  active: { label: 'Active', className: 'bg-emerald-600/20 text-emerald-300 border-emerald-500/30' },
  resolved: { label: 'Resolved', className: 'bg-stone-600/20 text-stone-300 border-stone-500/30' },
  closed: { label: 'Closed', className: 'bg-stone-800/30 text-stone-400 border-stone-600/30' },
};

export const SAFETY_CONFIG: Record<SafetyLevel, { label: string; className: string; show: boolean }> = {
  none: { label: 'None', className: '', show: false },
  low: { label: 'Low', className: 'bg-amber-600/20 text-amber-300 border-amber-500/30' , show: true },
  medium: { label: 'Medium', className: 'bg-orange-600/20 text-orange-300 border-orange-500/30', show: true },
  high: { label: 'High', className: 'bg-red-600/20 text-red-300 border-red-500/30', show: true },
  critical: { label: 'Critical', className: 'bg-red-600/30 text-red-200 border-red-400/50 safety-critical', show: true },
};

export const EVENT_TYPES: EventType[] = ['incident', 'communication', 'filing', 'hearing', 'deadline', 'discovery', 'service', 'other'];

export const EVIDENCE_TYPES: EvidenceType[] = ['document', 'photo', 'video', 'audio', 'communication', 'record', 'testimony', 'other'];

export const JURISDICTIONS = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
];

export const CASE_TYPES = [
  'landlord_tenant',
  'family_law',
  'small_claims',
  'employment',
  'consumer_protection',
  'civil_rights',
  'personal_injury',
  'debt_collection',
  'housing_discrimination',
  'other',
];

export const CASE_TYPE_LABELS: Record<string, string> = {
  landlord_tenant: 'Landlord/Tenant',
  family_law: 'Family Law',
  small_claims: 'Small Claims',
  employment: 'Employment',
  consumer_protection: 'Consumer Protection',
  civil_rights: 'Civil Rights',
  personal_injury: 'Personal Injury',
  debt_collection: 'Debt Collection',
  housing_discrimination: 'Housing Discrimination',
  other: 'Other',
};
