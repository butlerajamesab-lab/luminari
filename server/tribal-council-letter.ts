/**
 * Letters to tribal councils, drafted from what the gate actually holds.
 *
 * The letter tells a council exactly what Luminari holds about its nation
 * (section by section, with the pages each came from), that none of it is
 * public, and that the council alone decides what happens to it. It says
 * nothing on the nation's behalf and makes no claims about the nation.
 * Drafts only: an admin approves each letter, and sending is recorded after
 * it actually goes out.
 */
import { createHash } from "node:crypto";

export type letter_kind =
  | "initial_invitation"
  | "follow_up"
  | "decision_confirmation"
  | "withdrawal_confirmation";

export type letter_section_summary = {
  section_title: string;
  field_count: number;
  source_pages: string[];
};

export type letter_input = {
  letter_kind: letter_kind;
  nation_name: string;
  addressee: string;
  mailing_address: string | null;
  sections: letter_section_summary[];
  sender_name: string;
  sender_contact: string;
  letter_date: string; // YYYY-MM-DD
  decisions_summary?: string[]; // for decision_confirmation
};

const COUNCIL_POWERS = [
  "confirm any item as it stands",
  "correct or replace any wording with your own",
  "restrict or reject any item so it is never shown",
  "add sections and write them in your own words",
  "rename or reorder sections and choose the page's language",
  "revoke any permission you have given, at any time",
  "withdraw entirely, which hides everything at once",
];

function list(items: string[]): string {
  return items.map((item) => `  - ${item}`).join("\n");
}

export function build_council_letter(input: letter_input): { body_text: string; body_sha256: string } {
  if (!input.addressee.trim()) throw new Error("addressee is required");
  if (!input.sender_name.trim() || !input.sender_contact.trim()) {
    throw new Error("sender_name and sender_contact are required");
  }

  const header = [
    input.letter_date,
    "",
    input.addressee,
    ...(input.mailing_address ? input.mailing_address.split(/\s*[•\n]\s*/).filter(Boolean) : []),
    "",
    `Dear members of the ${input.addressee},`,
    "",
  ];

  const held = input.sections
    .filter((s) => s.field_count > 0)
    .map((s) => {
      const pages = s.source_pages.length ? ` (drawn from: ${s.source_pages.join(", ")})` : "";
      return `${s.section_title}: ${s.field_count} item${s.field_count === 1 ? "" : "s"}${pages}`;
    });

  let body: string[];
  switch (input.letter_kind) {
    case "initial_invitation":
      body = [
        `Luminari is a public-information platform. We have prepared a draft page for the ${input.nation_name} using only your nation's own published words and cited public records. We are writing so that your council can review it before anyone else sees it.`,
        "",
        "Nothing on this page is public. It stays locked until your council decides otherwise, section by section.",
        "",
        "What the draft holds today:",
        held.length ? list(held) : "  - No items yet.",
        "",
        "Your council decides everything about this page. Through a private review gate, your council can:",
        list(COUNCIL_POWERS),
        "",
        "The page carries your words, not ours. The one place Luminari adds its own analysis is a clearly labelled Route to Recognition section, and that section is also subject to your review and can be removed.",
        "",
        "If your council would like to review the page, reply naming the person or people who should have access. A pseudonym is fine. Access uses two-step sign-in and covers your nation's page only. If your council would rather we take the draft down, say so and we will lock and withdraw it.",
      ];
      break;
    case "follow_up":
      body = [
        `We wrote earlier about a draft page for the ${input.nation_name}. It remains locked and private.`,
        "",
        "What the draft holds today:",
        held.length ? list(held) : "  - No items yet.",
        "",
        "Your council can review, change, add to or withdraw any of it at any time. If you would like access, or would like the draft taken down, please reply.",
      ];
      break;
    case "decision_confirmation":
      body = [
        `This confirms the decisions your council recorded for the ${input.nation_name} page:`,
        list(input.decisions_summary?.length ? input.decisions_summary : ["(none recorded)"]),
        "",
        "Every decision is kept in a permanent record. Your council can change or revoke any of them at any time.",
      ];
      break;
    case "withdrawal_confirmation":
      body = [
        `This confirms that the ${input.nation_name} page has been withdrawn at your council's request. Every section is locked and nothing is shown publicly.`,
        "",
        "If your council ever wishes to resume, a letter or message from the council is all that is needed.",
      ];
      break;
  }

  const closing = ["", "With respect,", "", input.sender_name, "Luminari", input.sender_contact];
  const body_text = [...header, ...body, ...closing].join("\n");
  const body_sha256 = createHash("sha256").update(body_text).digest("hex");
  return { body_text, body_sha256 };
}
