import { useMemo, useState } from "react";

type bill_detail_payload = {
  source?: string;
  fetched_at?: string;
  bill?: Record<string, unknown>;
};

type unknown_record = Record<string, unknown>;

const palette = {
  bg: "#0f1114",
  slate: "#1a1e24",
  slate_mid: "#232830",
  paper: "#e8ecf0",
  cream: "#d0d7de",
  muted: "#7d8590",
  rule: "#30363d",
  steel: "#58a6ff",
  steel_soft: "rgba(74,140,199,0.12)",
  copper: "#d29922",
  copper_soft: "rgba(210,153,34,0.12)",
  green: "#3fb950",
  red: "#f85149",
};

const font_mono = "'IBM Plex Mono', monospace";
const font_sans = "'Inter', system-ui, sans-serif";
const font_serif = "'Cormorant Garamond', serif";

const is_record = (value: unknown): value is unknown_record =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const as_array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

const first_value = (record: unknown_record, keys: string[]): unknown => {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
};

const display_value = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "Not provided";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(display_value).filter(Boolean).join(", ");
  return JSON.stringify(value);
};

const record_label = (value: unknown, fallback = "Record"): string => {
  if (!is_record(value)) return display_value(value);
  const label = first_value(value, [
    "name", "title", "description", "action", "text", "committee_name",
    "sponsor_name", "person_name", "motion", "vote_desc", "doc_desc",
    "state", "party", "role", "number", "type",
  ]);
  return label ? display_value(label) : fallback;
};

const record_url = (value: unknown): string | null => {
  if (!is_record(value)) return null;
  const url = first_value(value, ["url", "state_link", "text_url", "doc_url", "source_url"]);
  return typeof url === "string" && /^https?:\/\//i.test(url) ? url : null;
};

function Field({ label, value, wide = false }: { label: string; value: unknown; wide?: boolean }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div style={{ minWidth: 0, gridColumn: wide ? "1 / -1" : undefined }}>
      <div style={{ fontFamily: font_mono, fontSize: "0.64rem", color: palette.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.22rem" }}>{label}</div>
      <div style={{ fontFamily: font_sans, fontSize: "0.82rem", color: palette.cream, lineHeight: 1.45, overflowWrap: "anywhere" }}>{display_value(value)}</div>
    </div>
  );
}

function Section({ title, items, empty_text, render_item }: {
  title: string;
  items: unknown[];
  empty_text: string;
  render_item?: (item: unknown, index: number) => React.ReactNode;
}) {
  if (items.length === 0) return null;
  return (
    <section style={{ background: palette.bg, border: `1px solid ${palette.rule}`, borderRadius: 8, padding: "0.85rem" }}>
      <div style={{ fontFamily: font_mono, fontSize: "0.7rem", color: palette.steel, fontWeight: 700, textTransform: "uppercase", marginBottom: "0.65rem" }}>{title}</div>
      <div style={{ display: "grid", gap: "0.55rem" }}>
        {items.length === 0 ? <div style={{ color: palette.muted }}>{empty_text}</div> : items.map((item, index) => render_item ? render_item(item, index) : (
          <div key={index} style={{ background: palette.slate, border: `1px solid ${palette.rule}`, borderRadius: 6, padding: "0.65rem" }}>
            <div style={{ fontFamily: font_sans, fontSize: "0.82rem", color: palette.paper, lineHeight: 1.4 }}>{record_label(item)}</div>
            {is_record(item) && (
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "0.35rem", fontFamily: font_mono, fontSize: "0.64rem", color: palette.muted }}>
                {Object.entries(item).slice(0, 6).map(([key, value]) => (
                  typeof value !== "object" && value !== null && value !== "" ? <span key={key}>{key} {String(value)}</span> : null
                ))}
              </div>
            )}
            {record_url(item) && <a href={record_url(item)!} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: "0.4rem", color: palette.steel, fontFamily: font_mono, fontSize: "0.65rem" }}>Open official record</a>}
          </div>
        ))}
      </div>
    </section>
  );
}

export function DocketBillDetailWorkspace({ payload }: { payload: bill_detail_payload }) {
  const [show_raw, set_show_raw] = useState(false);
  const bill = is_record(payload.bill) ? payload.bill : {};

  const normalized = useMemo(() => ({
    bill_id: first_value(bill, ["bill_id", "id"]),
    number: first_value(bill, ["bill_number", "number", "state_link"]),
    title: first_value(bill, ["title", "description", "bill_name"]),
    description: first_value(bill, ["description", "summary", "abstract"]),
    status: first_value(bill, ["status", "status_desc", "current_status"]),
    status_date: first_value(bill, ["status_date", "last_action_date"]),
    session: first_value(bill, ["session", "session_name", "session_title", "session_id"]),
    state: first_value(bill, ["state", "state_id", "jurisdiction"]),
    url: first_value(bill, ["url", "state_link", "source_url"]),
    change_hash: first_value(bill, ["change_hash"]),
    last_action: first_value(bill, ["last_action", "action"]),
    last_action_date: first_value(bill, ["last_action_date", "status_date"]),
    sponsors: as_array(first_value(bill, ["sponsors", "sponsor"])),
    history: as_array(first_value(bill, ["history", "actions", "action_history"])),
    committees: as_array(first_value(bill, ["committees", "committee", "referrals"])),
    texts: as_array(first_value(bill, ["texts", "text", "documents", "versions"])),
    votes: as_array(first_value(bill, ["votes", "roll_calls", "rollcalls"])),
    amendments: as_array(first_value(bill, ["amendments", "supplements"])),
    subjects: as_array(first_value(bill, ["subjects", "topics"])),
    calendar: as_array(first_value(bill, ["calendar", "calendar_entries"])),
    progress: as_array(first_value(bill, ["progress"])),
  }), [bill]);

  const official_url = typeof normalized.url === "string" && /^https?:\/\//i.test(normalized.url) ? normalized.url : null;

  return (
    <div style={{ display: "grid", gap: "0.85rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: font_mono, fontSize: "0.66rem", color: palette.steel, marginBottom: "0.35rem" }}>
            source {payload.source || "unknown"} · fetched_at {payload.fetched_at || "unknown"}
          </div>
          <h3 style={{ fontFamily: font_serif, fontSize: "1.35rem", color: palette.paper, lineHeight: 1.25, margin: 0 }}>{display_value(normalized.title)}</h3>
          {normalized.description && normalized.description !== normalized.title && <p style={{ fontFamily: font_sans, fontSize: "0.86rem", color: palette.cream, lineHeight: 1.55, margin: "0.55rem 0 0" }}>{display_value(normalized.description)}</p>}
        </div>
        {official_url && <a href={official_url} target="_blank" rel="noopener noreferrer" style={{ background: palette.steel_soft, border: `1px solid ${palette.steel}`, borderRadius: 6, padding: "0.45rem 0.65rem", color: palette.steel, fontFamily: font_mono, fontSize: "0.68rem", textDecoration: "none" }}>Open official bill</a>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: "0.75rem", background: palette.bg, border: `1px solid ${palette.rule}`, borderRadius: 8, padding: "0.85rem" }}>
        <Field label="Bill number" value={normalized.number} />
        <Field label="Bill ID" value={normalized.bill_id} />
        <Field label="Jurisdiction" value={normalized.state} />
        <Field label="Session" value={normalized.session} />
        <Field label="Status" value={normalized.status} />
        <Field label="Status date" value={normalized.status_date} />
        <Field label="Last action" value={normalized.last_action} wide />
        <Field label="Last action date" value={normalized.last_action_date} />
        <Field label="Change hash" value={normalized.change_hash} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "0.75rem" }}>
        <Section title="Legislative history" items={normalized.history} empty_text="No actions returned" />
        <Section title="Sponsors" items={normalized.sponsors} empty_text="No sponsors returned" />
        <Section title="Committees and referrals" items={normalized.committees} empty_text="No committees returned" />
        <Section title="Bill texts and documents" items={normalized.texts} empty_text="No texts returned" />
        <Section title="Votes" items={normalized.votes} empty_text="No votes returned" />
        <Section title="Amendments and supplements" items={normalized.amendments} empty_text="No amendments returned" />
        <Section title="Subjects" items={normalized.subjects} empty_text="No subjects returned" />
        <Section title="Calendar" items={normalized.calendar} empty_text="No calendar entries returned" />
        <Section title="Progress markers" items={normalized.progress} empty_text="No progress markers returned" />
      </div>

      <div style={{ background: palette.copper_soft, border: `1px solid ${palette.copper}`, borderRadius: 8, padding: "0.75rem", fontFamily: font_sans, fontSize: "0.78rem", color: palette.cream, lineHeight: 1.45 }}>
        Official bill detail is shown above exactly as returned by the cached LegiScan detail request. Rosetta analysis and Civic Genome relationships remain separate until verified enrichment records exist for this bill.
      </div>

      <button type="button" onClick={() => set_show_raw(value => !value)} style={{ justifySelf: "start", background: palette.slate_mid, border: `1px solid ${palette.rule}`, borderRadius: 6, color: palette.muted, cursor: "pointer", fontFamily: font_mono, fontSize: "0.66rem", padding: "0.4rem 0.55rem" }}>
        {show_raw ? "hide_raw_source_payload" : "show_raw_source_payload"}
      </button>
      {show_raw && <pre style={{ whiteSpace: "pre-wrap", margin: 0, color: palette.cream, background: palette.bg, border: `1px solid ${palette.rule}`, borderRadius: 8, padding: "0.75rem", fontFamily: font_mono, fontSize: "0.66rem", maxHeight: 420, overflow: "auto" }}>{JSON.stringify(payload, null, 2)}</pre>}
    </div>
  );
}
