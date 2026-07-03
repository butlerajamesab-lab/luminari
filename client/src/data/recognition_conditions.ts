import type { recognition_condition } from "@/types/recognition_condition";

export const recognition_conditions: recognition_condition[] = [
  {
    condition_id: "community_continuity",
    title: "Community continuity",
    description:
      "A recognition gate focused on whether a tribal community has maintained social, cultural, and political continuity through time, including after removal, displacement, administrative omission, or urbanization.",
    governing_authorities: ["25_cfr_part_83"],
    evidence_types: [
      "homeland_residence",
      "community_records",
      "oral_history",
      "tribal_rolls",
      "church_or_school_records",
      "government_records",
    ],
    common_failure_modes: [
      "forced_removal_gap",
      "burned_homeland_gap",
      "urban_displacement_gap",
      "administrative_record_gap",
    ],
    linked_weak_joints: ["continuous_habitation_paradox"],
  },
];

export const community_continuity_condition = recognition_conditions[0];
