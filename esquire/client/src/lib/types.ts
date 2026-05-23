// Esquire Database Types

export type CaseStatus = 'intake' | 'active' | 'resolved' | 'closed';
export type SafetyLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';
export type EventType = 'incident' | 'communication' | 'filing' | 'hearing' | 'deadline' | 'discovery' | 'service' | 'other';
export type EvidenceType = 'document' | 'photo' | 'video' | 'audio' | 'communication' | 'record' | 'testimony' | 'other';
export type PipelineStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Case {
  id: string;
  user_id: string;
  jurisdiction: string;
  case_type: string;
  status: CaseStatus;
  title: string;
  description: string | null;
  opposing_party: string | null;
  safety_level: SafetyLevel;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  case_id: string;
  governance_visibility: string;
  review_required: boolean;
  governance_warnings: unknown[];
}

export interface CaseEvent {
  id: string;
  case_id: string;
  event_type: EventType;
  event_date: string;
  title: string;
  description: string | null;
  source: string | null;
  source_type: string | null;
  quality_weight: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface Evidence {
  id: string;
  case_id: string;
  event_id: string | null;
  evidence_type: EvidenceType;
  title: string;
  summary: string | null;
  description: string | null;
  source_type: string | null;
  quality_weight: number | null;
  file_path: string | null;
  raw_file_path: string | null;
  file_hash: string | null;
  raw_file_hash: string | null;
  file_references: unknown[] | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface ConsentRecord {
  id: string;
  case_id: string;
  consent_type: string;
  granted: boolean;
  granted_at: string | null;
  revoked_at: string | null;
  ip_address: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface EvidenceConsentValidation {
  id: string;
  evidence_id: string;
  case_id: string;
  jurisdiction_code: string;
  evidence_type: string;
  consent_obtained: boolean;
  all_parties_consented: boolean;
  validation_result: string;
  risk_level: string;
  warning_message: string | null;
  created_at: string;
}

export interface Location {
  id: string;
  case_id: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  zip_code: string;
  location_type: string;
  is_current: boolean | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface SafetyAssessment {
  id: string;
  case_id: string;
  assessed_level: SafetyLevel;
  factors: unknown;
  safety_plan: unknown;
  resources: unknown;
  assessed_at: string;
  reassess_by: string | null;
  created_at: string;
}

export interface SafetyResource {
  id: string;
  jurisdiction: string;
  resource_name: string;
  resource_type: string;
  phone: string | null;
  website: string | null;
  description: string | null;
  is_24_7: boolean;
  created_at: string;
}

export interface JurisdictionRecordingLaw {
  id: string;
  jurisdiction_code: string;
  jurisdiction_name: string;
  consent_type: string;
  statute_citation: string | null;
  summary: string | null;
  penalty_civil: string | null;
  penalty_criminal: string | null;
  exceptions: unknown[] | null;
  last_updated: string | null;
  created_at: string;
}

export interface PipelineRun {
  id: number;
  run_id: string;
  case_id: string;
  pipeline_version: string;
  overall_confidence: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface ProceduralOutput {
  id: number;
  procedural_output_id: string;
  case_id: string;
  pipeline_run_id: string | null;
  output_type: string;
  title: string;
  content: string;
  confidence: string;
  created_at: string;
}

export interface AuthorityConflict {
  id: number;
  authority_conflict_id: string;
  case_id: string;
  event_ids: unknown[];
  description: string;
  block_causal_inference: boolean;
  created_at: number;
}

export interface NarrativeBiasFlag {
  id: number;
  narrative_bias_flag_id: string;
  case_id: string;
  description: string;
  bias_risk: string;
  dominant_source_type: string | null;
  dominant_source_percentage: number | null;
  created_at: number;
}

export interface AlternativeInterpretation {
  id: number;
  alternative_interpretation_id: string;
  case_id: string;
  event_ids: unknown[];
  description: string;
  interpretations: unknown[];
  created_at: number;
}

export interface TierMinusOneStatement {
  statement_id: string;
  case_id: string;
  statement_type: string;
  content: string;
  source: string;
  confidence: string;
  created_at: string;
}

export interface ProSeResource {
  id: string;
  jurisdiction: string | null;
  resource_name: string;
  resource_type: string;
  description: string | null;
  url: string | null;
  is_active: boolean;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  case_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_value: unknown | null;
  new_value: unknown | null;
  performed_by: string | null;
  created_at: string;
}

export interface CaseTypeRegistry {
  registry_id: string;
  case_type: string;
  matched_pipeline_id: string | null;
  user_facing_aliases: string[];
  investigation_patterns: unknown[];
  red_flags: unknown[];
  metadata: Record<string, unknown>;
  created_at: string;
}
