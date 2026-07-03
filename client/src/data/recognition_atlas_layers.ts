import { duwamish_language_seed } from "@/data/duwamish_language_seed";

export type truth_layer_key =
  | "layer_0_identity"
  | "layer_1_treaty"
  | "layer_2_dispossession"
  | "layer_3_recognition_timeline"
  | "layer_4_lawsuit"
  | "layer_5_language_vault"
  | "layer_6_ally_call";

export type truth_layer_status =
  | "locked_pending_tribal_review"
  | "available_admin_only"
  | "published_to_lighthouse";

export type truth_layer_action = {
  action_label: string;
  route: string;
  visibility: "admin_only" | "public_after_approval";
  route_status: "live" | "planned";
  external: boolean;
};

export type truth_layer_config = {
  key: truth_layer_key;
  title: string;
  subtitle: string;
  status: truth_layer_status;
  description: string;
  actions: truth_layer_action[];
};

export type language_entry_config = {
  entry_id: string;
  original_text: string;
  romanization?: string;
  english_gloss: string;
  extended_meaning?: string;
  verified_by_tribe: boolean;
  notes?: string;
};

export const duwamish_language_entries: language_entry_config[] = [
  duwamish_language_seed.self_identifier_entry,
  duwamish_language_seed.primary_declaration_entry,
  ...duwamish_language_seed.entries,
].map((entry) => ({
  entry_id: entry.entry_id,
  original_text: entry.original_text,
  romanization: entry.romanization,
  english_gloss: entry.english_gloss,
  extended_meaning: entry.extended_meaning,
  verified_by_tribe: entry.verified_by_tribe,
  notes: entry.notes,
}));

export const duwamish_truth_layers: truth_layer_config[] = [
  {
    key: "layer_0_identity",
    title: "Identity Core",
    subtitle: "dxʷdəwʔabš · People of the Inside",
    status: "locked_pending_tribal_review",
    description: "WE ARE STILL HERE. The host tribe of Seattle. Their own words render first, before any external record.",
    actions: [
      {
        action_label: "view_identity_data",
        route: "/recognition-atlas/duwamish/identity",
        visibility: "admin_only",
        route_status: "live",
        external: false,
      },
      {
        action_label: "open_in_civic_map",
        route: "/civic-map?focus=duwamish_identity",
        visibility: "admin_only",
        route_status: "live",
        external: false,
      },
    ],
  },
  {
    key: "layer_1_treaty",
    title: "Treaty Record",
    subtitle: "Chief Si'ahl and the Treaty of Point Elliott",
    status: "locked_pending_tribal_review",
    description: "The treaty record in their framing: Chief Si'ahl's signature, congressional acts, and the city that bears his name.",
    actions: [
      {
        action_label: "view_treaty_record",
        route: "/recognition-atlas/duwamish/treaty",
        visibility: "admin_only",
        route_status: "live",
        external: false,
      },
      {
        action_label: "open_sources_in_viewfinder",
        route: "/viewfinder?tag=duwamish_treaty",
        visibility: "admin_only",
        route_status: "live",
        external: false,
      },
    ],
  },
  {
    key: "layer_2_dispossession",
    title: "Dispossession Record",
    subtitle: "The acts that broke continuity",
    status: "locked_pending_tribal_review",
    description: "Forced removals, burned longhouses, exile to Ballast Island. The record that answers any continuity standard with the acts that broke continuity.",
    actions: [
      {
        action_label: "view_dispossession_data",
        route: "/recognition-atlas/duwamish/dispossession",
        visibility: "admin_only",
        route_status: "live",
        external: false,
      },
      {
        action_label: "view_dispossession_map",
        route: "/civic-map?layer=dispossession&tribe=duwamish",
        visibility: "admin_only",
        route_status: "live",
        external: false,
      },
      {
        action_label: "open_evidence_in_viewfinder",
        route: "/viewfinder?tag=duwamish_dispossession",
        visibility: "admin_only",
        route_status: "live",
        external: false,
      },
    ],
  },
  {
    key: "layer_3_recognition_timeline",
    title: "Recognition Timeline",
    subtitle: "Petitions, acknowledgements, reversals, lawsuit",
    status: "locked_pending_tribal_review",
    description: "From early suits and settlements to the 2001 recognition, 2002 reversal, and the current federal lawsuit.",
    actions: [
      {
        action_label: "view_recognition_timeline",
        route: "/recognition-atlas/duwamish/timeline",
        visibility: "admin_only",
        route_status: "live",
        external: false,
      },
      {
        action_label: "open_case_in_docket_room",
        route: "/docket?case=duwamish_recognition",
        visibility: "admin_only",
        route_status: "live",
        external: false,
      },
    ],
  },
  {
    key: "layer_4_lawsuit",
    title: "Lawsuit Claims",
    subtitle: "Their own legal frame",
    status: "locked_pending_tribal_review",
    description: "Judicial declaration, compel listing, sex discrimination, due process, APA violation — the claims as they wrote them.",
    actions: [
      {
        action_label: "view_lawsuit_claims",
        route: "/recognition-atlas/duwamish/lawsuit",
        visibility: "admin_only",
        route_status: "live",
        external: false,
      },
      {
        action_label: "open_in_mission_control",
        route: "/mission-control?case=duwamish_federal_case",
        visibility: "admin_only",
        route_status: "live",
        external: false,
      },
    ],
  },
  {
    key: "layer_5_language_vault",
    title: "Language Vault",
    subtitle: "tʷəlšucid · Lushootseed",
    status: "locked_pending_tribal_review",
    description: "Permanent language preservation. Immutable after tribal approval. No government override, no external edits.",
    actions: [
      {
        action_label: "open_language_vault",
        route: "/recognition-atlas/duwamish/language",
        visibility: "admin_only",
        route_status: "live",
        external: false,
      },
      {
        action_label: "use_in_workshop",
        route: "/workshop?module=language_preservation",
        visibility: "admin_only",
        route_status: "live",
        external: false,
      },
    ],
  },
  {
    key: "layer_6_ally_call",
    title: "Ally Call",
    subtitle: "How to stand with the Duwamish",
    status: "locked_pending_tribal_review",
    description: "Land acknowledgement, Real Rent Duwamish, recognition petition, organizational endorsements, elected-official outreach, and visiting the Longhouse.",
    actions: [
      {
        action_label: "view_ally_call",
        route: "/recognition-atlas/duwamish/ally-call",
        visibility: "admin_only",
        route_status: "live",
        external: false,
      },
      {
        action_label: "open_duwamish_site",
        route: "https://www.duwamishtribe.org/stand-with-the-duwamish",
        visibility: "admin_only",
        route_status: "live",
        external: true,
      },
    ],
  },
];
