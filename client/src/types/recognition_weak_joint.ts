export type recognition_weak_joint_id =
  | "continuous_habitation_paradox";

export type weak_joint_authorship =
  | "lighthouse_analysis_pending_tribal_review"
  | "tribe_approved"
  | "administrative_profile";

export type weak_joint_publication_status =
  | "admin_preview_only"
  | "public_pending"
  | "published_to_lighthouse";

export type recognition_weak_joint = {
  weak_joint_id: recognition_weak_joint_id;
  title: string;
  description: string;
  why_it_is_a_contradiction: string;
  conditions: string[];
  regulations: string[];
  decisions: string[];
  cases: string[];
  agency_practices: string[];
  tribes: string[];
  supporting_records: string[];
  authorship: weak_joint_authorship;
  publication_status: weak_joint_publication_status;
};
