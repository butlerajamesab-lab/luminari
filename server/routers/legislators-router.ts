/**
 * Legislators Router — citizen-facing read-only hub for current legislators.
 *
 * Reads only from public.legislators and public.legislator_committees
 * (seeded 2026-10-27, national base: 50 states + DC + Puerto Rico).
 * These tables are NOT in drizzle/schema.ts, so all reads use raw
 * parameterized SQL via db.execute(sql`...`). Every value that comes from
 * user input is passed as a drizzle sql-template parameter — never
 * interpolated into a SQL string. Every member query filters
 * status = 'current': former members are never returned as contacts.
 *
 * Tribal leaders live in a separate table and are OUT OF SCOPE here;
 * the hub links to /native-nations instead of rendering tribal data.
 */
import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { sql, type SQL } from "drizzle-orm";
import { db } from "../db";

/** Display names for every state code present in the base. */
const STATE_NAMES: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
  DC: "District of Columbia",
  PR: "Puerto Rico",
  AS: "American Samoa",
  GU: "Guam",
  MP: "Northern Mariana Islands",
  VI: "U.S. Virgin Islands",
};

const FEDERAL_SOURCE =
  "Congress.gov + unitedstates/congress-legislators dataset";
const STATE_SOURCE =
  "Open States (openstates.org), CC0, with each legislature's own site as authoritative fallback";
const TRIBAL_NOTE =
  "Tribal leaders live in the Native Nations hub (/native-nations), not here.";

const MEMBER_COLUMNS = sql`
  member_key, level, chamber, state, district, full_name, party, status,
  representation, phone, email, contact_method, contact_note, website_url,
  office_address, office_classification, district_office_address,
  district_phone, photo_url, bio_url, bio_text, bio_source, links_json,
  source, source_url, source_update, fetched_date, last_refreshed,
  verification_status
`;

type MemberRow = Record<string, unknown> & {
  member_key: string;
};

type CommitteeRow = {
  committee_name: string;
  subcommittee_name: string;
  role: string | null;
  time_marker: string;
  time_kind: string | null;
};

/**
 * db.execute returns the native pg QueryResult shape ({ rows }) plus a
 * legacy tuple iterator (see server/db-execute-compat.ts). Prefer .rows;
 * fall back to the tuple form so this router is correct under either shape.
 */
async function queryRows<T>(query: SQL): Promise<T[]> {
  const result = (await db.execute(query)) as unknown;
  if (Array.isArray(result)) {
    return result as T[];
  }
  if (result != null && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

async function fetchCommitteesFor(
  memberKeys: string[],
): Promise<Record<string, CommitteeRow[]>> {
  if (memberKeys.length === 0) {
    return {};
  }
  const rows = await queryRows<CommitteeRow & { member_key: string }>(sql`
    SELECT member_key, committee_name, subcommittee_name, role, time_marker, time_kind
    FROM public.legislator_committees
    WHERE member_key IN (${sql.join(
      memberKeys.map((key) => sql`${key}`),
      sql`, `,
    )})
    ORDER BY committee_name, subcommittee_name
  `);
  const byMember: Record<string, CommitteeRow[]> = {};
  for (const row of rows) {
    const list = byMember[row.member_key] ?? (byMember[row.member_key] = []);
    list.push({
      committee_name: row.committee_name,
      subcommittee_name: row.subcommittee_name ?? "",
      role: row.role ?? null,
      time_marker: row.time_marker,
      time_kind: row.time_kind ?? null,
    });
  }
  return byMember;
}

function attachCommittees<T extends MemberRow>(
  members: T[],
  committeesByMember: Record<string, CommitteeRow[]>,
): (T & { committees: CommitteeRow[] })[] {
  return members.map((member) => ({
    ...member,
    committees: committeesByMember[member.member_key] ?? [],
  }));
}

async function fetchDistricts(
  state: string,
  level: "federal" | "state",
): Promise<string[]> {
  const chamberFilter =
    level === "federal" ? sql`AND chamber = 'house'` : sql``;
  const rows = await queryRows<{ district: string }>(sql`
    SELECT DISTINCT district
    FROM public.legislators
    WHERE state = ${state}
      AND level = ${level}
      AND status = 'current'
      AND district IS NOT NULL
      AND district <> ''
      ${chamberFilter}
    ORDER BY
      CASE WHEN district ~ '^[0-9]+$' THEN 0 ELSE 1 END,
      CASE WHEN district ~ '^[0-9]+$' THEN CAST(district AS INTEGER) END,
      district
  `);
  return rows.map((row) => row.district);
}

const stateInput = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{2}$/, "state must be a 2-letter code")
  .transform((value) => value.toUpperCase());

const levelInput = z.enum(["federal", "state", "both"]);

export const legislatorsRouter = router({
  /** Distinct state codes present in the table, with display names. */
  states: publicProcedure.query(async () => {
    const rows = await queryRows<{ state: string }>(sql`
      SELECT DISTINCT state
      FROM public.legislators
      ORDER BY state
    `);
    const states = rows.map((row) => ({
      code: row.state,
      name: STATE_NAMES[row.state] ?? row.state,
    }));
    states.sort((a, b) => a.name.localeCompare(b.name));
    return { states };
  }),

  /** Distinct districts present for one state + level. */
  districts: publicProcedure
    .input(
      z.object({
        state: stateInput,
        level: z.enum(["federal", "state"]),
      }),
    )
    .query(async ({ input }) => {
      return { districts: await fetchDistricts(input.state, input.level) };
    }),

  /**
   * Resolve a state (+level +optional district) to current members.
   *
   * - Federal + district: 2 senators + the House member for that district.
   *   If the House member is missing, the senators are still returned and
   *   the response carries held: true with the valid district list — the
   *   resolver never guesses a different district.
   * - Federal, no district: the full federal delegation, delegation: true.
   * - State + district: state members for that district, or held.
   * - State, no district: needsDistrict, never a member dump.
   * - Both: the federal part and the state part combined under the same
   *   rules; both without district returns the federal delegation plus
   *   state needsDistrict.
   */
  resolve: publicProcedure
    .input(
      z.object({
        state: stateInput,
        level: levelInput,
        district: z.string().trim().min(1).max(20).optional(),
      }),
    )
    .query(async ({ input }) => {
      const { state, level, district } = input;

      const fetchSenators = () =>
        queryRows<MemberRow>(sql`
          SELECT ${MEMBER_COLUMNS}
          FROM public.legislators
          WHERE state = ${state}
            AND level = 'federal'
            AND chamber = 'senate'
            AND status = 'current'
          ORDER BY full_name
          LIMIT 100
        `);

      const fetchHouseMember = (districtValue: string) =>
        queryRows<MemberRow>(sql`
          SELECT ${MEMBER_COLUMNS}
          FROM public.legislators
          WHERE state = ${state}
            AND level = 'federal'
            AND chamber = 'house'
            AND district = ${districtValue}
            AND status = 'current'
          LIMIT 100
        `);

      const fetchDelegation = () =>
        queryRows<MemberRow>(sql`
          SELECT ${MEMBER_COLUMNS}
          FROM public.legislators
          WHERE state = ${state}
            AND level = 'federal'
            AND status = 'current'
          ORDER BY
            CASE WHEN chamber = 'senate' THEN 0 ELSE 1 END,
            full_name
          LIMIT 100
        `);

      const fetchStateMembers = (districtValue: string) =>
        queryRows<MemberRow>(sql`
          SELECT ${MEMBER_COLUMNS}
          FROM public.legislators
          WHERE state = ${state}
            AND level = 'state'
            AND district = ${districtValue}
            AND status = 'current'
          ORDER BY
            CASE WHEN chamber = 'upper' THEN 0
                 WHEN chamber = 'lower' THEN 1
                 ELSE 2 END,
            full_name
          LIMIT 100
        `);

      if (level === "federal") {
        if (!district) {
          const members = await fetchDelegation();
          const committees = await fetchCommitteesFor(
            members.map((m) => m.member_key),
          );
          return {
            members: attachCommittees(members, committees),
            delegation: true as const,
          };
        }
        const senators = await fetchSenators();
        const house = await fetchHouseMember(district);
        const members = [...senators, ...house];
        const committees = await fetchCommitteesFor(
          members.map((m) => m.member_key),
        );
        if (house.length === 0) {
          return {
            members: attachCommittees(members, committees),
            held: true as const,
            reason: `No House member found for congressional district ${district} in ${STATE_NAMES[state] ?? state}.`,
            validDistricts: await fetchDistricts(state, "federal"),
          };
        }
        return { members: attachCommittees(members, committees) };
      }

      if (level === "state") {
        if (!district) {
          return {
            needsDistrict: true as const,
            validDistricts: await fetchDistricts(state, "state"),
          };
        }
        const members = await fetchStateMembers(district);
        const committees = await fetchCommitteesFor(
          members.map((m) => m.member_key),
        );
        if (members.length === 0) {
          return {
            members: [],
            held: true as const,
            reason: `No state legislators found for legislative district ${district} in ${STATE_NAMES[state] ?? state}.`,
            validDistricts: await fetchDistricts(state, "state"),
          };
        }
        return { members: attachCommittees(members, committees) };
      }

      // level === "both": federal part + state part under the same rules.
      const federalDistricts = await fetchDistricts(state, "federal");
      const stateDistricts = await fetchDistricts(state, "state");
      if (!district) {
        const members = await fetchDelegation();
        const committees = await fetchCommitteesFor(
          members.map((m) => m.member_key),
        );
        return {
          members: attachCommittees(members, committees),
          delegation: true as const,
          needsDistrict: true as const,
          validDistricts: stateDistricts,
        };
      }
      const senators = await fetchSenators();
      const house = await fetchHouseMember(district);
      const stateMembers = await fetchStateMembers(district);
      const members = [...senators, ...house, ...stateMembers];
      const committees = await fetchCommitteesFor(
        members.map((m) => m.member_key),
      );
      const heldReasons: string[] = [];
      if (house.length === 0) {
        heldReasons.push(
          `No House member found for congressional district ${district} in ${STATE_NAMES[state] ?? state}.`,
        );
      }
      if (stateMembers.length === 0) {
        heldReasons.push(
          `No state legislators found for legislative district ${district} in ${STATE_NAMES[state] ?? state}.`,
        );
      }
      if (heldReasons.length > 0) {
        return {
          members: attachCommittees(members, committees),
          held: true as const,
          reason: heldReasons.join(" "),
          validDistricts: { federal: federalDistricts, state: stateDistricts },
        };
      }
      return { members: attachCommittees(members, committees) };
    }),

  /** One current member + committees, or null. Detail path for cards. */
  member: publicProcedure
    .input(z.object({ key: z.string().trim().min(1).max(200) }))
    .query(async ({ input }) => {
      const members = await queryRows<MemberRow>(sql`
        SELECT ${MEMBER_COLUMNS}
        FROM public.legislators
        WHERE member_key = ${input.key}
          AND status = 'current'
        LIMIT 1
      `);
      if (members.length === 0) {
        return null;
      }
      const committees = await fetchCommitteesFor([members[0].member_key]);
      return attachCommittees(members, committees)[0];
    }),

  /** Live counts + honest source strings for the hub face labels. */
  meta: publicProcedure.query(async () => {
    const rows = await queryRows<{
      total_members: string;
      total_committees: string;
      states_covered: string;
      fetched_date: string | null;
    }>(sql`
      SELECT
        (SELECT COUNT(*) FROM public.legislators) AS total_members,
        (SELECT COUNT(*) FROM public.legislator_committees) AS total_committees,
        (SELECT COUNT(DISTINCT state) FROM public.legislators) AS states_covered,
        (SELECT MAX(fetched_date) FROM public.legislators) AS fetched_date
    `);
    const row = rows[0];
    return {
      totalMembers: Number(row?.total_members ?? 0),
      totalCommittees: Number(row?.total_committees ?? 0),
      statesCovered: Number(row?.states_covered ?? 0),
      fetchedDate: row?.fetched_date ?? null,
      sources: {
        federal: FEDERAL_SOURCE,
        state: STATE_SOURCE,
      },
      tribalNote: TRIBAL_NOTE,
    };
  }),
});
