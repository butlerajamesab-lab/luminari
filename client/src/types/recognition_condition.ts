export type recognition_condition_id =
  | "community_continuity";

export type recognition_condition_evidence_type =
  | "homeland_residence"
  | "community_records"
  | "oral_history"
  | "tribal_rolls"
  | "church_or_school_records"
  | "government_records";

export type recognition_failure_mode =
  | "forced_removal_gap"
  | "burned_homeland_gap"
  | "urban_displacement_gap"
  | "administrative_record_gap";

export type recognition_condition = {
  condition_id: recognition_condition_id;
  title: string;
  description: string;
  governing_authorities: string[];
  evidence_types: recognition_condition_evidence_type[];
  common_failure_modes: recognition_failure_mode[];
  linked_weak_joints: string[];
};
