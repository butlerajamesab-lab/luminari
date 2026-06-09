import type { state_recognition_framework } from "@/types/state_recognition_framework";

export const state_recognition_frameworks: state_recognition_framework[] = [
  {
    state_id: "OH",
    state_name: "Ohio",
    recognition_framework_status: "zero_framework",
    legislative_pathway_exists: false,
    administrative_pathway_exists: false,
    judicial_pathway_exists: false,
    state_recognized_tribes_count: 0,
    recognition_barrier_notes:
      "Ohio has no statutory or administrative mechanism to recognize tribes; no state-recognized tribal governments exist.",
    civil_gideon_score: 2,
    recognition_gideon_score: 0,
  },
];
