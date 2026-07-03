export type section_lock_status =
  | "locked_pending_tribe_review"
  | "locked_tribe_requested"
  | "unlocked_tribe_approved"
  | "partial_unlock";

export type section_id =
  | "identity_core"
  | "treaty_record"
  | "dispossession_record"
  | "recognition_timeline"
  | "lawsuit_record"
  | "language_vault"
  | "place_names"
  | "culture_record"
  | "ally_call"
  | "witness_network_node";

export type section_lock = {
  tribe_id: string;
  section_id: section_id;
  lock_status: section_lock_status;
  locked_at: string;
  unlocked_at?: string;
  unlocked_by?: string;
  lock_note?: string;
  public_display_permitted: boolean;
};

export type tribe_section_locks = {
  tribe_id: string;
  locks: section_lock[];
  all_sections_approved: boolean;
  last_updated: string;
};

export function is_section_live(
  tribe_id: string,
  section_id: section_id,
  locks: tribe_section_locks,
): boolean {
  const lock = locks.locks.find(
    (candidate) => candidate.tribe_id === tribe_id && candidate.section_id === section_id,
  );

  if (!lock) return false;

  return lock.public_display_permitted === true &&
    lock.lock_status === "unlocked_tribe_approved";
}

export function initialize_tribe_locks(tribe_id: string): tribe_section_locks {
  const sections: section_id[] = [
    "identity_core",
    "treaty_record",
    "dispossession_record",
    "recognition_timeline",
    "lawsuit_record",
    "language_vault",
    "place_names",
    "culture_record",
    "ally_call",
    "witness_network_node",
  ];

  const now = new Date().toISOString();

  return {
    tribe_id,
    locks: sections.map((section_id) => ({
      tribe_id,
      section_id,
      lock_status: "locked_pending_tribe_review",
      locked_at: now,
      public_display_permitted: false,
    })),
    all_sections_approved: false,
    last_updated: now,
  };
}
