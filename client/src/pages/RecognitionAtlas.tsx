import { useAuth } from "@/core/hooks/useAuth";
import { Link } from "wouter";
import {
  ArrowRight,
  EyeOff,
  FileText,
  GitBranch,
  Layers3,
  Lock,
  MapPin,
  Shield,
  Users,
} from "lucide-react";

const tone = {
  bg: "#0c0f14",
  paper: "#f0ece4",
  muted: "rgba(240,236,228,0.6)",
  card_bg: "rgba(255,255,255,0.035)",
  card_border: "rgba(255,255,255,0.09)",
  gold: "#D4A017",
  blue: "#7eb3e8",
  green: "#34d399",
};

const tribal_record_layers = [
  ["layer_0_identity", "Identity Core", "This layer says who the tribe is in their own words. It records their name and its meaning, where they are from, and how they describe their homeland and present-day community. It is the starting point for every other layer."],
  ["layer_1_treaty", "Treaty / Political Relationship", "This layer shows how governments have officially related to the tribe. If there is a treaty, it names the treaty, gives the date and signatories, and links to sources. If there is no treaty, it says so. It can also include information about chiefs, villages, and how those agreements were honored or broken."],
  ["layer_2_dispossession", "Dispossession Record", "This layer records what was done to push the tribe off their land or out of the record. It lists missions, removals, burned homelands, relocations, and administrative omissions, with dates and sources. It is the factual backbone for claims that community continuity was blocked by government action."],
  ["layer_3_recognition_timeline", "Recognition Timeline", "This layer traces how recognition bodies have treated the tribe over time. It records petitions, decisions, omissions, acknowledgements, reversals, appeals, and current cases, with dates and citations. It shows how a tribe can be recognized, unrecognized, or left in limbo."],
  ["layer_4_lawsuit", "Lawsuit Claims", "If the tribe has taken their case to court, this layer holds that story in their frame. It lists the case, court, defendants, legal claims, and what they are asking the court to do. It makes clear that denial and omission are being challenged as legal harms, not accepted as final truths."],
  ["layer_5_language_vault", "Language / Living Culture", "This layer documents how language and culture continue today. It records language programs, ceremonies, regalia, songs, teachings, and community practices, usually from tribal and foundation sources. Once the tribe approves entries here, they are preserved as a permanent record of living culture."],
  ["layer_6_ally_call", "Ally Call", "This layer tells people exactly how the tribe wants to be supported. It points to their own websites and foundations, land rematriation and stewardship efforts, language and cultural programs, public events, and recognition campaigns. Every action in this layer should come from the tribe or their designated partners."],
];

const atlas_links = [
  ["Duwamish Tribal Card", "/recognition-atlas/duwamish", "Open the dedicated Duwamish parent page. This is where Duwamish-specific depth belongs."],
  ["Muwékma Tribal Card", "/recognition-atlas/muwekma", "Open the dedicated Muwékma parent page. This is where Muwékma-specific depth belongs."],
  ["Recognition Gideon / RTR Matrix", "/recognition-gideon", "Open the system-analysis layer for recognition conditions, weak joints, and Route to Recognition comparison."],
  ["Native Nations Hub", "/native-nations", "Return to the gentle entryway for Native Nations pathways and support routing."],
];

function gate_panel({ title, message }: { title: string; message: string }) {
  return (
    <main style={{ minHeight: "100vh", background: tone.bg, color: tone.paper, display: "grid", placeItems: "center", padding: "2rem", fontFamily: "Inter, system-ui, sans-serif" }}>
      <section style={{ width: "min(720px, 100%)", border: `1px solid ${tone.card_border}`, background: tone.card_bg, borderRadius: 24, padding: "2rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <Lock size={22} color={tone.gold} />
          <span style={{ color: tone.gold, textTransform: "uppercase", letterSpacing: "0.12em", fontSize: 12 }}>Admin gated</span>
        </div>
        <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", margin: "0 0 1rem" }}>{title}</h1>
        <p style={{ color: tone.muted, lineHeight: 1.7, fontSize: "1.05rem", marginBottom: "1.5rem" }}>{message}</p>
        <Link href="/native-nations" style={{ color: tone.blue, textDecoration: "none", display: "inline-flex", gap: 8 }}>
          Native Nations Hub <ArrowRight size={16} />
        </Link>
      </section>
    </main>
  );
}

function nav_links() {
  return (
    <section style={{ marginTop: "2rem", border: `1px solid ${tone.card_border}`, background: tone.card_bg, borderRadius: 22, padding: "1.25rem" }}>
      <ul style={{ color: tone.muted, lineHeight: 1.8, paddingLeft: "1.25rem", margin: 0 }}>
        {atlas_links.map(([title, href, description]) => (
          <li key={href}>
            <Link href={href} style={{ color: tone.blue, fontWeight: 800, textDecoration: "none" }}>{title}</Link>
            <span> — {description}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function RecognitionAtlas() {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return gate_panel({
      title: "Loading Recognition Atlas preview",
      message: "Checking admin access before showing this unpublished Recognition Atlas presentation layer.",
    });
  }

  if (!isAuthenticated || user?.role !== "admin") {
    return gate_panel({
      title: "Recognition Atlas preview requires admin access",
      message: "This route is the admin-preview presentation layer for Recognition Atlas. It is not public-facing and does not indicate tribal approval.",
    });
  }

  return (
    <main style={{ minHeight: "100vh", background: tone.bg, color: tone.paper, fontFamily: "Inter, system-ui, sans-serif", padding: "clamp(1.25rem, 3vw, 3rem)" }}>
      <section style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ border: `1px solid rgba(212,160,23,0.35)`, background: "rgba(212,160,23,0.08)", color: tone.gold, borderRadius: 999, padding: "0.5rem 0.85rem", display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "1.5rem" }}>
          <EyeOff size={14} /> Admin Preview — presentation layer not public
        </div>

        <header style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(280px, 0.8fr)", gap: "2rem", alignItems: "end" }}>
          <div>
            <p style={{ color: tone.blue, letterSpacing: "0.14em", textTransform: "uppercase", fontSize: 12, marginBottom: 12 }}>
              Recognition Atlas · project backbone
            </p>
            <h1 style={{ fontSize: "clamp(2.8rem, 8vw, 6.5rem)", lineHeight: 0.9, margin: 0 }}>Recognition Atlas</h1>
            <p style={{ color: tone.muted, lineHeight: 1.75, fontSize: "1.08rem", maxWidth: 860, marginTop: "1.5rem" }}>
              Recognition Atlas is the presentation area for the tribal-recognition project. It explains the Atlas/Gideon split, routes into tribal cards, and links to Recognition Gideon / RTR analysis. Tribe-specific records live on their own tribal pages and deep source-packet layers.
            </p>
          </div>

          <aside style={{ border: `1px solid ${tone.card_border}`, background: tone.card_bg, borderRadius: 22, padding: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <Shield size={20} color={tone.green} />
              <strong>Luminari commitment</strong>
            </div>
            <p style={{ color: tone.muted, lineHeight: 1.6, margin: 0 }}>
              This presentation layer does not make recognition determinations, evaluate whether a community qualifies, or speak for tribes. The framework is the vessel. They are the author.
            </p>
          </aside>
        </header>

        {nav_links()}

        <section style={{ marginTop: "2rem", border: `1px solid ${tone.card_border}`, background: tone.card_bg, borderRadius: 24, padding: "1.25rem" }}>
          <h2 style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 0 }}>
            <Layers3 size={22} color={tone.gold} /> Tribal card pattern
          </h2>
          <p style={{ color: tone.muted, lineHeight: 1.65 }}>
            Each tribal page is a standalone card that can pull its own layered source packets. The Atlas hub explains the pattern; it does not duplicate the tribal record.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0.85rem" }}>
            {tribal_record_layers.map(([key, title, description]) => (
              <article key={key} style={{ border: `1px solid ${tone.card_border}`, background: "rgba(255,255,255,0.025)", borderRadius: 16, padding: "0.9rem" }}>
                <div style={{ color: tone.gold, fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>{key}</div>
                <h3 style={{ margin: "0.55rem 0 0.35rem" }}>{title}</h3>
                <p style={{ color: tone.muted, lineHeight: 1.55, margin: 0 }}>{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section style={{ marginTop: "1.25rem", border: `1px solid rgba(52,211,153,0.35)`, background: "rgba(52,211,153,0.055)", borderRadius: 22, padding: "1rem" }}>
          <h2 style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 0.75rem" }}>
            <GitBranch size={22} color={tone.green} /> Atlas / Gideon split
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0.85rem" }}>
            <article style={{ border: `1px solid ${tone.card_border}`, background: "rgba(255,255,255,0.025)", borderRadius: 16, padding: "0.9rem" }}>
              <h3 style={{ marginTop: 0 }}>Atlas is source-packet material</h3>
              <p style={{ color: tone.muted, lineHeight: 1.6, margin: 0 }}>Tribal pages and layer pages hold tribe-specific records, citations, review state, and publication controls.</p>
            </article>
            <article style={{ border: `1px solid ${tone.card_border}`, background: "rgba(255,255,255,0.025)", borderRadius: 16, padding: "0.9rem" }}>
              <h3 style={{ marginTop: 0 }}>Gideon is analysis support</h3>
              <p style={{ color: tone.muted, lineHeight: 1.6, margin: 0 }}>Recognition Gideon organizes criteria, weak joints, service gaps, and RTR comparison without replacing tribal records.</p>
            </article>
          </div>
        </section>

        <footer style={{ marginTop: "2rem", paddingTop: "1.5rem", borderTop: `1px solid ${tone.card_border}`, display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end" }}>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <Link href="/recognition-gideon" style={{ color: tone.blue, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
              Recognition Gideon <ArrowRight size={15} />
            </Link>
            <Link href="/native-nations" style={{ color: tone.blue, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
              Native Nations <Users size={15} />
            </Link>
            <Link href="/recognition-atlas/duwamish" style={{ color: tone.blue, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
              Duwamish Card <MapPin size={15} />
            </Link>
            <Link href="/recognition-atlas/muwekma" style={{ color: tone.blue, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
              Muwékma Card <MapPin size={15} />
            </Link>
            <Link href="/legal-library" style={{ color: tone.blue, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
              Legal Library <FileText size={15} />
            </Link>
          </div>
        </footer>
      </section>
    </main>
  );
}
