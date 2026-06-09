import type { recognition_weak_joint } from "@/types/recognition_weak_joint";

export const recognition_weak_joints: recognition_weak_joint[] = [
  {
    weak_joint_id: "continuous_habitation_paradox",
    title: "Continuous habitation paradox",
    description:
      "A recognition contradiction where continuity is demanded while displacement, removals, burned homelands, or administrative omission are treated as evidence against the community rather than as government-created gaps.",
    why_it_is_a_contradiction:
      "The recognition system can require continuity while discounting the fact that government or settler-state action disrupted the very continuity being demanded.",
    conditions: ["community_continuity"],
    regulations: ["25_cfr_part_83"],
    decisions: [],
    cases: [],
    agency_practices: [],
    tribes: ["duwamish"],
    supporting_records: [
      "duwamish_layer_2_dispossession",
      "duwamish_layer_3_recognition_timeline",
    ],
    authorship: "lighthouse_analysis_pending_tribal_review",
    publication_status: "admin_preview_only",
  },
];

export const continuous_habitation_paradox = recognition_weak_joints[0];
