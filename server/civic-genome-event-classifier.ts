import type { legiscan_master_bill } from "./services/legiscan";

export type civic_genome_docket_event_classification = {
  event_type: string;
  event_summary: string;
};

type existing_civic_genome_bill = {
  structural_dna_hash: string;
} | null;

const bill_text = (bill: legiscan_master_bill): string =>
  `${bill.title ?? ""} ${bill.description ?? ""} ${bill.last_action ?? ""}`.toLowerCase();

const latest_action = (bill: legiscan_master_bill): string =>
  bill.last_action ? ` Latest action: ${bill.last_action}` : "";

const summarize = (bill: legiscan_master_bill, summary: string): string =>
  `${bill.number} ${summary}.${latest_action(bill)}`;

export const classify_docket_event = (
  bill: legiscan_master_bill,
  existing: existing_civic_genome_bill,
): civic_genome_docket_event_classification => {
  const text = bill_text(bill);
  const last_action = `${bill.last_action ?? ""}`.toLowerCase();
  const status = Number(bill.status);

  if (/^\s*effective date\b/.test(last_action)) {
    return {
      event_type: "effective_date_set",
      event_summary: summarize(bill, "has an effective date on the live docket"),
    };
  }

  if (/^\s*(?:chapter(?:ed)?|enacted)\b|signed by governor|governor signed|became law|\b(?:bill|measure|resolution)\s+(?:has\s+)?enacted\b/.test(last_action)) {
    return {
      event_type: "enacted",
      event_summary: summarize(bill, "appears enacted or chaptered on the live docket"),
    };
  }

  if (/^\s*vetoed\b|\b(?:bill|measure|resolution)\s+(?:has\s+)?vetoed\b/.test(last_action)) {
    return {
      event_type: "vetoed",
      event_summary: summarize(bill, "appears vetoed on the live docket"),
    };
  }

  if (status === 5) {
    return {
      event_type: "vetoed",
      event_summary: summarize(bill, "has a terminal veto status on the live docket"),
    };
  }

  if (status === 6) {
    return {
      event_type: "failed",
      event_summary: summarize(bill, "has a terminal failed status on the live docket"),
    };
  }

  if (/^\s*(?:failed|withdrawn|dead|postponed indefinitely)\b|\b(?:bill|measure|resolution)\s+(?:has\s+)?(?:failed|withdrawn|died|been\s+postponed\s+indefinitely)\b/.test(last_action)) {
    return {
      event_type: "failed",
      event_summary: summarize(bill, "appears failed, withdrawn, dead, or indefinitely postponed on the live docket"),
    };
  }

  if (/amend|engrossed|substitute|revised/.test(last_action)) {
    return {
      event_type: "amended",
      event_summary: summarize(bill, "appears amended, substituted, engrossed, or revised on the live docket"),
    };
  }

  if (/passed house and senate|passed both/.test(text)) {
    return {
      event_type: "passed_two_chambers",
      event_summary: summarize(bill, "appears to have passed both chambers on the live docket"),
    };
  }

  if (/passed house|passed senate/.test(text)) {
    return {
      event_type: "passed_chamber",
      event_summary: summarize(bill, "appears to have passed one chamber on the live docket"),
    };
  }

  if (/committee|referred|reported/.test(text)) {
    return {
      event_type: "committee_action",
      event_summary: summarize(bill, "has committee movement on the live docket"),
    };
  }

  return {
    event_type: existing ? "docket_cache_changed" : "docket_cache_observed",
    event_summary: summarize(bill, existing ? "changed in the Docket Room cache" : "was observed in the Docket Room cache"),
  };
};
