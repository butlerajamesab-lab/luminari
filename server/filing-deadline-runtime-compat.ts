import { getPool } from "./db-legacy";

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export type FilingDeadlineRecord = {
  formId: number;
  agency: string;
  agencyShort: string;
  formName: string;
  filingDeadlineText: string;
  incidentDate: string;
  asOfDate: string;
  daysSinceIncident: number;
  primaryDeadlineDays: number | null;
  primaryDeadlineDate: string | null;
  primaryDaysRemaining: number | null;
  extendedDeadlineDays: number | null;
  extendedDeadlineDate: string | null;
  extendedDaysRemaining: number | null;
  extendedCondition: string | null;
  noDeadline: boolean;
  urgency: "expired" | "critical" | "warning" | "safe" | "no_deadline" | "unavailable";
  calculationState: "calculated" | "no_deadline" | "source_text_only";
  sourceUrl: string | null;
};

export function date_only_to_utc_day(value: string): number {
  const match = DATE_ONLY_RE.exec(value);
  if (!match) throw new RangeError(`Invalid date-only value: ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const round_trip = new Date(timestamp).toISOString().slice(0, 10);
  if (round_trip !== value) throw new RangeError(`Invalid calendar date: ${value}`);
  return Math.trunc(timestamp / DAY_MS);
}

export function utc_today_date_only(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function days_between_date_only(start: string, end: string): number {
  return date_only_to_utc_day(end) - date_only_to_utc_day(start);
}

export function map_filing_deadline_source_text(
  row: any,
  incident_date: string,
  as_of_date: string,
): FilingDeadlineRecord {
  const filing_deadline_text = String(row.filing_deadline ?? "").trim();
  if (!filing_deadline_text) {
    throw new RangeError("Agency form has no source-bound filing deadline text");
  }

  return {
    formId: Number(row.id),
    agency: String(row.agency ?? ""),
    agencyShort: String(row.agency_short ?? ""),
    formName: String(row.form_name ?? ""),
    filingDeadlineText: filing_deadline_text,
    incidentDate: incident_date,
    asOfDate: as_of_date,
    daysSinceIncident: days_between_date_only(incident_date, as_of_date),
    primaryDeadlineDays: null,
    primaryDeadlineDate: null,
    primaryDaysRemaining: null,
    extendedDeadlineDays: null,
    extendedDeadlineDate: null,
    extendedDaysRemaining: null,
    extendedCondition: null,
    noDeadline: false,
    urgency: "unavailable",
    calculationState: "source_text_only",
    sourceUrl: row.link == null ? null : String(row.link),
  };
}

/**
 * Reads only agency-form deadline text that is actually present in the live
 * source catalog. The catalog currently has no structured, authority-bound
 * day value, so this boundary deliberately refuses to turn prose (or a
 * hard-coded agency map) into a legal deadline calculation.
 */
export async function list_filing_deadline_records(input: {
  incidentDate: string;
  agencyShort?: string;
  formId?: number;
  asOfDate?: string;
}): Promise<FilingDeadlineRecord[]> {
  const as_of_date = input.asOfDate ?? utc_today_date_only();
  date_only_to_utc_day(input.incidentDate);
  date_only_to_utc_day(as_of_date);
  if (days_between_date_only(input.incidentDate, as_of_date) < 0) {
    throw new RangeError("Incident date cannot be after the as-of date");
  }

  const result = await getPool().query(
    `select id, agency, agency_short, form_name, filing_deadline, link
       from public.agency_forms
      where nullif(btrim(filing_deadline), '') is not null
        and ($1::integer is null or id = $1)
        and ($2::text is null or agency_short = $2)
      order by agency, form_name, id`,
    [input.formId ?? null, input.agencyShort ?? null],
  );

  return result.rows.map(row =>
    map_filing_deadline_source_text(row, input.incidentDate, as_of_date),
  );
}
