export type recognition_framework_status = "zero_framework" | "partial_framework" | "full_framework" | "unknown";

export type state_recognition_framework = {
  state_id: string;
  state_name: string;
  recognition_framework_status: recognition_framework_status;
  legislative_pathway_exists: boolean;
  administrative_pathway_exists: boolean;
  judicial_pathway_exists: boolean;
  state_recognized_tribes_count: number;
  recognition_barrier_notes: string;
  civil_gideon_score: number;
  recognition_gideon_score: number;
};
