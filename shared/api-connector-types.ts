export type ApiAuthType =
  | "none"
  | "api_key"
  | "oauth"
  | "bearer_token"
  | "service_account"
  | "manual";

export type ApiSourceType =
  | "government_api"
  | "public_dataset"
  | "nonprofit_api"
  | "court_api"
  | "regulatory_api"
  | "benefits_api"
  | "civic_resource_api"
  | "legal_source_api"
  | "manual_source"
  | "other";

export type PullRunStatus =
  | "started"
  | "success"
  | "partial_success"
  | "failed"
  | "cancelled";

export type GeocodePrecision =
  | "exact"
  | "rooftop"
  | "street"
  | "zip"
  | "city"
  | "county"
  | "state"
  | "unmapped"
  | "unknown";

export interface ApiSourceDescriptor {
  source_key: string;
  source_name: string;
  source_owner?: string;
  source_type: ApiSourceType;
  base_url: string;
  documentation_url?: string;
  jurisdiction_scope?: string;
  geographic_scope?: string;
  domain: string;
  auth_type: ApiAuthType;
  requires_secret: boolean;
  secret_name?: string;
  freshness_expectation?: string;
}

export interface ApiPullRunDescriptor {
  run_key: string;
  connector_version: string;
  parser_version: string;
  normalization_version: string;
  started_at: string;
  finished_at?: string;
  status: PullRunStatus;
  request_url: string;
  request_method: "GET" | "POST";
  request_params: Record<string, unknown>;
  request_headers_safe: Record<string, unknown>;
  response_status?: number;
  response_content_type?: string;
  response_record_count?: number;
  source_snapshot_hash?: string;
  response_body_hash?: string;
  error_message?: string;
}

export interface NormalizedCivicResourcePayload {
  resource_type: string;
  name: string;
  description?: string;
  organization_name?: string;
  agency_name?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  county?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  latitude?: number | null;
  longitude?: number | null;
  geocode_precision?: GeocodePrecision;
  phone?: string;
  email?: string;
  website_url?: string;
  service_categories: string[];
  eligibility_summary?: string;
  hours?: Record<string, unknown>;
  languages?: string[];
  accessibility_features?: string[];
  normalized_payload?: Record<string, unknown>;
  normalization_confidence?: number;
  normalization_notes?: string;
}

export interface RawApiRecordPayload {
  external_record_id?: string;
  external_record_url?: string;
  source_table_or_endpoint?: string;
  source_created_at?: string;
  source_updated_at?: string;
  raw_payload: Record<string, unknown>;
  raw_payload_hash: string;
  record_fingerprint: string;
  normalized?: NormalizedCivicResourcePayload;
}

export interface ApiConnectorOutput {
  source: ApiSourceDescriptor;
  pull_run: ApiPullRunDescriptor;
  records: RawApiRecordPayload[];
}
