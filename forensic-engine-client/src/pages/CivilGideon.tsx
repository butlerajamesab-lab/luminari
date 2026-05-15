import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "../lib/trpc";
import {
  Scale,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  BookOpen,
  Shield,
  Users,
  Clock,
  ExternalLink,
  FileText,
  Gavel,
  Heart,
  MapPin,
  Send,
  TrendingUp,
  Building2,
  BarChart3,
  Map,
  Link2,
  ArrowRight,
  CircleDot,
  XCircle,
  MinusCircle,
  CheckCircle2,
  Info,
  Volume2,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════
   CIVIL GIDEON — The Case for a Civil Right to Counsel
   
   This is not legal advice. This is civic education — documenting the
   systemic contradictions in access to justice and the growing movement
   for a civil right to counsel. All citations are to publicly available
   legal authorities, legislative records, and published research.
   ═══════════════════════════════════════════════════════════════════════ */

const cg = {
  bg: "#0c0f14",
  paper: "#f0ece4",
  muted: "rgba(240,236,228,0.55)",
  cardBg: "rgba(255,255,255,0.03)",
  cardBorder: "rgba(255,255,255,0.08)",
  red: "#ef4444",
  redBg: "rgba(239,68,68,0.06)",
  redBorder: "rgba(239,68,68,0.2)",
  gold: "#D4A017",
  goldBg: "rgba(212,160,23,0.06)",
  goldBorder: "rgba(212,160,23,0.2)",
  purple: "#a855f7",
  purpleBg: "rgba(168,85,247,0.06)",
  purpleBorder: "rgba(168,85,247,0.2)",
  teal: "#0e7490",
  tealBg: "rgba(14,116,144,0.06)",
  tealBorder: "rgba(14,116,144,0.2)",
  amber: "#f59e0b",
  green: "#34d399",
  greenBg: "rgba(52,211,153,0.06)",
  greenBorder: "rgba(52,211,153,0.2)",
};

const fontSerif = "'Playfair Display', Georgia, serif";
const fontSans = "'Inter', system-ui, sans-serif";
const fontMono = "'JetBrains Mono', 'Fira Code', monospace";

/* ── The Six Contradictions ──────────────────────────────────────── */
const CONTRADICTIONS = [
  {
    id: 1,
    title: "You Must Know the Law",
    doctrine: "Ignorantia juris non excusat",
    description: "The legal system holds every person accountable for knowing the law. Ignorance is not a defense. You are expected to understand statutes, regulations, filing deadlines, procedural rules, and evidentiary standards — regardless of your education, income, or access to resources.",
    citation: "Common law doctrine, universally applied in all U.S. jurisdictions",
    color: cg.red,
  },
  {
    id: 2,
    title: "You Cannot Afford to Learn the Law",
    doctrine: "Economic barrier to legal education",
    description: "Law school costs $150,000–$250,000. Legal services cost $200–$500 per hour. Legal self-help materials are scattered, contradictory, and jurisdiction-specific. The knowledge the system requires you to have is priced beyond the reach of the majority of Americans.",
    citation: "ABA, 2022: Average law school debt exceeds $130,000; median hourly rate for attorneys: $313/hour (Clio Legal Trends Report, 2023)",
    color: cg.amber,
  },
  {
    id: 3,
    title: "You Cannot Get Free Help",
    doctrine: "Unauthorized Practice of Law (UPL)",
    description: "Every state criminalizes the 'unauthorized practice of law' — defined broadly as applying legal knowledge to someone's specific situation. Non-lawyers who help others navigate the legal system risk criminal prosecution, even if their help is competent, free, and desperately needed.",
    citation: "State-specific UPL statutes; see, e.g., N.Y. Judiciary Law § 478; Cal. Bus. & Prof. Code § 6125; Tex. Gov't Code § 81.101",
    color: cg.red,
  },
  {
    id: 4,
    title: "The State Won't Provide You Help",
    doctrine: "No civil right to counsel",
    description: "The Sixth Amendment guarantees counsel in criminal cases (Gideon v. Wainwright, 1963). But there is no equivalent right in civil cases — even when those cases determine custody of your children, possession of your home, access to your benefits, or your immigration status.",
    citation: "Lassiter v. Department of Social Services, 452 U.S. 18 (1981); Turner v. Rogers, 564 U.S. 431 (2011)",
    color: cg.amber,
  },
  {
    id: 5,
    title: "The Court Offers Hollow Leniency",
    doctrine: "Haines v. Kerner pro se standard",
    description: "Courts are 'supposed to' hold pro se litigants to less stringent standards. In practice, this means the court will charitably read your handwritten complaint — but if you miss a 10-day filing deadline because you didn't know it existed, your case is dismissed. The leniency is cosmetic. The substance is unforgiving.",
    citation: "Haines v. Kerner, 404 U.S. 519 (1972); but see McNeil v. United States, 508 U.S. 106 (1993) ('we have never suggested that procedural rules in ordinary civil litigation should be interpreted so as to excuse mistakes by those who proceed without counsel')",
    color: cg.red,
  },
  {
    id: 6,
    title: "If You Learn Too Much, You're a Criminal",
    doctrine: "UPL applied to competent self-helpers",
    description: "If you learn the law well enough to represent yourself effectively and then help a family member, neighbor, or friend with the same knowledge — you may be prosecuted for the unauthorized practice of law. The system punishes ignorance, offers no help, and then criminalizes competence.",
    citation: "See, e.g., Florida Bar v. Went For It, Inc., 515 U.S. 618 (1995); In re Unauthorized Practice of Law Rules, 2004 WL 3249439 (Tex.)",
    color: cg.red,
  },
];

/* ── The Access to Justice Gap ───────────────────────────────────── */
const JUSTICE_GAP_STATS = [
  { stat: "92%", label: "of civil legal problems faced by low-income Americans receive inadequate or no legal help", source: "Legal Services Corporation, Justice Gap Report, 2022" },
  { stat: "80%", label: "of low-income Americans and 40-60% of middle-income Americans cannot afford a lawyer for civil matters", source: "ABA, Report on the Future of Legal Services, 2016" },
  { stat: "76%", label: "of civil cases in state courts involve at least one self-represented party", source: "NCSC, The Landscape of Civil Litigation in State Courts, 2015" },
  { stat: "$313", label: "median hourly rate for attorneys in the United States", source: "Clio Legal Trends Report, 2023" },
  { stat: "10 days", label: "shortest appeal window in the registry (UI denial, multiple states) — often expires before a person can find legal help", source: "Luminari State Registry Data" },
  { stat: "120 days", label: "shortest civil rights SOL in the registry (Delaware) — less time than most people need to understand they have a claim", source: "Luminari State Registry Data" },
];

/* ── The Movement ────────────────────────────────────────────────── */
const MOVEMENT_MILESTONES = [
  { year: "1963", event: "Gideon v. Wainwright", description: "Supreme Court establishes the right to counsel in criminal cases. The civil equivalent remains unaddressed.", citation: "372 U.S. 335 (1963)" },
  { year: "1981", event: "Lassiter v. DSS", description: "Supreme Court declines to establish a categorical right to counsel in civil cases, applying a case-by-case balancing test instead.", citation: "452 U.S. 18 (1981)" },
  { year: "2006", event: "ABA Resolution 112A", description: "The American Bar Association formally endorses a civil right to counsel in cases involving basic human needs: shelter, sustenance, safety, health, and child custody.", citation: "ABA House of Delegates, August 2006" },
  { year: "2011", event: "Turner v. Rogers", description: "Supreme Court holds that due process requires 'some assistance' to self-represented litigants in civil contempt cases, but stops short of guaranteeing counsel.", citation: "564 U.S. 431 (2011)" },
  { year: "2017", event: "NYC Universal Access", description: "New York City becomes the first U.S. jurisdiction to guarantee legal representation in housing court for tenants facing eviction. Eviction filings drop 30% in covered zip codes.", citation: "NYC Local Law 136 (2017)" },
  { year: "2020", event: "San Francisco Right to Counsel", description: "San Francisco implements a right to counsel in eviction cases. 67% of represented tenants avoid displacement.", citation: "SF Administrative Code Chapter 120" },
  { year: "2021", event: "Upsolve v. James Filed", description: "Upsolve sues New York Attorney General, challenging UPL rules as applied to trained non-lawyer navigators providing free legal assistance.", citation: "No. 22-cv-627 (S.D.N.Y.)" },
  { year: "2022", event: "Utah Regulatory Sandbox", description: "Utah creates a regulatory sandbox explicitly permitting non-traditional legal service providers to operate, testing alternatives to the lawyer monopoly.", citation: "Utah Supreme Court Standing Order No. 15" },
  { year: "2023", event: "Arizona Community Justice Workers", description: "Arizona approves Community Justice Workers — non-lawyers authorized to provide limited legal assistance in family law, housing, and debt cases.", citation: "Arizona Supreme Court Administrative Order 2023-16" },
  { year: "2024", event: "Upsolve v. James Ruling", description: "Federal court rules the First Amendment protects non-lawyers providing legal information and limited assistance. The UPL monopoly begins to crack.", citation: "No. 22-cv-627 (S.D.N.Y. 2024)" },
];

/* ── The Antitrust Argument ──────────────────────────────────────── */
const ANTITRUST_POINTS = [
  {
    title: "The Sherman Act Prohibits Monopolies",
    text: "15 U.S.C. § 2: 'Every person who shall monopolize, or attempt to monopolize, or combine or conspire with any other person or persons, to monopolize any part of the trade or commerce among the several States, or with foreign nations, shall be deemed guilty of a felony.' The legal profession has monopolized the market for legal services through UPL rules enforced by the very courts that benefit from the monopoly.",
  },
  {
    title: "The Clayton Act Prohibits Anti-Competitive Conduct",
    text: "15 U.S.C. § 14: The Clayton Act targets practices that substantially lessen competition. UPL rules prevent paralegals, legal technicians, community advocates, and technology platforms from competing with lawyers — even when those alternatives could provide competent, affordable assistance.",
  },
  {
    title: "The FTC Act Prohibits Unfair Methods of Competition",
    text: "15 U.S.C. § 45: The FTC Act broadly prohibits unfair methods of competition. State bar associations, which are quasi-governmental bodies, use UPL enforcement to suppress competition from non-lawyer legal service providers. The FTC itself has advocated for relaxing UPL restrictions (FTC Staff Letter, 2002; FTC Advocacy, 2016).",
  },
  {
    title: "The State Action Doctrine Shields the Monopoly — For Now",
    text: "The 'state action doctrine' (Parker v. Brown, 1943) currently shields state-authorized monopolies from federal antitrust scrutiny. But this doctrine requires 'active supervision' by the state. When state supreme courts delegate enforcement to bar associations with minimal oversight, the shield may not hold. See N.C. State Board of Dental Examiners v. FTC, 574 U.S. 494 (2015), where the Supreme Court held that a state licensing board composed of market participants was NOT immune from antitrust scrutiny.",
  },
];

/* ── Tab Navigation ──────────────────────────────────────────────── */
type TabId = "overview" | "tracker" | "precedent" | "bias" | "action";
const TABS: { id: TabId; label: string; icon: any }[] = [
  { id: "overview", label: "The Closed Loop", icon: AlertTriangle },
  { id: "tracker", label: "RTC Tracker", icon: Map },
  { id: "precedent", label: "Precedent Chain", icon: Link2 },
  { id: "bias", label: "Structural Bias", icon: Building2 },
  { id: "action", label: "Take Action", icon: Send },
];

/* ═══════════════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */

export default function CivilGideon() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [expandedContradiction, setExpandedContradiction] = useState<number | null>(null);
  const [showAntitrust, setShowAntitrust] = useState(false);
  const [selectedRTCState, setSelectedRTCState] = useState<string | null>(null);
  const [expandedPrecedent, setExpandedPrecedent] = useState<string | null>(null);
  const [selectedBiasState, setSelectedBiasState] = useState<string | null>(null);

  // ─── Data from server ───
  const { data: summary } = trpc.civilGideon.summary.useQuery();
  const { data: rtcProfiles } = trpc.civilGideon.rtcProfiles.useQuery();
  const { data: precedentChain } = trpc.civilGideon.precedentChain.useQuery();
  const { data: biasProfiles } = trpc.civilGideon.biasProfiles.useQuery();

  const selectedRTC = useMemo(() => {
    if (!selectedRTCState || !rtcProfiles) return null;
    return rtcProfiles.find((p: any) => p.state === selectedRTCState) ?? null;
  }, [selectedRTCState, rtcProfiles]);

  const selectedBias = useMemo(() => {
    if (!selectedBiasState || !biasProfiles) return null;
    return biasProfiles.find((p: any) => p.state === selectedBiasState) ?? null;
  }, [selectedBiasState, biasProfiles]);

  const gradeColor = (grade: string) => {
    switch (grade) {
      case "A": return cg.green;
      case "B": return cg.teal;
      case "C": return cg.gold;
      case "D": return cg.amber;
      case "F": return cg.red;
      default: return cg.muted;
    }
  };

  const outcomeIcon = (outcome: string) => {
    switch (outcome) {
      case "positive": return <CheckCircle2 size={14} color={cg.green} />;
      case "negative": return <XCircle size={14} color={cg.red} />;
      case "mixed": return <MinusCircle size={14} color={cg.gold} />;
      default: return null;
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: cg.bg, color: cg.paper }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "48px 24px 80px" }}>
        {/* Back nav */}
        <button
          onClick={() => navigate("/legal-library")}
          style={{
            background: "none", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6,
            fontFamily: fontMono, fontSize: 11, color: cg.muted, marginBottom: 32,
          }}
        >
          <ChevronRight size={12} style={{ transform: "rotate(180deg)" }} /> Back to Legal Library
        </button>

        {/* Title block */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <Scale size={32} color={cg.red} />
            <div>
              <h1 style={{ fontFamily: fontSerif, fontSize: 32, fontWeight: 700, color: cg.paper, lineHeight: 1.2 }}>
                The Case for a Civil Right to Counsel
              </h1>
              <p style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: cg.red, marginTop: 4 }}>
                Documenting the systemic contradictions in access to justice
              </p>
            </div>
          </div>
          <div style={{
            background: cg.redBg, border: `1px solid ${cg.redBorder}`,
            borderRadius: 8, padding: "14px 20px", marginTop: 16,
          }}>
            <p style={{ fontFamily: fontSans, fontSize: 13, color: "#fca5a5", lineHeight: 1.7 }}>
              <strong style={{ color: cg.paper }}>Disclaimer:</strong> This page presents publicly available legal information, 
              legislative records, published research, and documented systemic patterns. It is civic education, not legal advice. 
              For guidance specific to your situation, consult with a licensed attorney. The irony of that statement is part of the point.
            </p>
          </div>
        </div>

        {/* Summary bar */}
        {summary && (
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8,
            marginBottom: 32,
          }}>
            {[
              { value: summary.states_profiled, label: "States Profiled" },
              { value: summary.states_with_eviction_rtc, label: "Eviction RTC" },
              { value: summary.states_with_family_rtc, label: "Family RTC" },
              { value: summary.precedent_chain_length, label: "Key Cases" },
              { value: summary.structural_bias_states_profiled, label: "Bias Profiles" },
            ].map((s, i) => (
              <div key={i} style={{
                background: cg.cardBg, border: `1px solid ${cg.cardBorder}`,
                borderRadius: 6, padding: "12px 14px", textAlign: "center",
              }}>
                <span style={{ fontFamily: fontMono, fontSize: 22, fontWeight: 700, color: cg.gold }}>{s.value}</span>
                <p style={{ fontFamily: fontMono, fontSize: 9, color: cg.muted, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tab navigation */}
        <div style={{
          display: "flex", gap: 4, marginBottom: 32, overflowX: "auto",
          borderBottom: `1px solid ${cg.cardBorder}`, paddingBottom: 0,
        }}>
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  background: isActive ? cg.cardBg : "transparent",
                  border: "none", borderBottom: isActive ? `2px solid ${cg.gold}` : "2px solid transparent",
                  cursor: "pointer", padding: "10px 16px",
                  display: "flex", alignItems: "center", gap: 6,
                  fontFamily: fontMono, fontSize: 11, color: isActive ? cg.paper : cg.muted,
                  transition: "all 0.2s", whiteSpace: "nowrap",
                }}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ═══════════════════════════════════════════════════════════
           TAB: OVERVIEW — The Closed Loop
           ═══════════════════════════════════════════════════════════ */}
        {activeTab === "overview" && (
          <>
            {/* ── The Closed Loop ── */}
            <section style={{ marginBottom: 48 }}>
              <h2 style={{ fontFamily: fontSerif, fontSize: 22, color: cg.paper, marginBottom: 8 }}>
                The Closed Loop: Six Contradictions
              </h2>
              <p style={{ fontFamily: fontSans, fontSize: 14, color: cg.muted, lineHeight: 1.7, marginBottom: 20 }}>
                The American legal system contains six interlocking doctrines that, taken together, create a closed loop: 
                you must know the law, you cannot afford to learn it, you cannot get free help, the state will not provide help, 
                the court's leniency is cosmetic, and if you learn enough to help others, you become a criminal. 
                Each doctrine is individually defensible. Together, they form a trap.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {CONTRADICTIONS.map((c, i) => (
                  <div
                    key={c.id}
                    style={{
                      background: expandedContradiction === c.id ? cg.redBg : cg.cardBg,
                      border: `1px solid ${expandedContradiction === c.id ? cg.redBorder : cg.cardBorder}`,
                      borderRadius: 8, overflow: "hidden", transition: "all 0.2s",
                    }}
                  >
                    <button
                      onClick={() => setExpandedContradiction(expandedContradiction === c.id ? null : c.id)}
                      style={{
                        width: "100%", background: "none", border: "none", cursor: "pointer",
                        padding: "16px 20px", display: "flex", alignItems: "center", gap: 12,
                        textAlign: "left",
                      }}
                    >
                      <span style={{
                        fontFamily: fontMono, fontSize: 18, fontWeight: 700,
                        color: c.color, minWidth: 28,
                      }}>{i + 1}</span>
                      <div style={{ flex: 1 }}>
                        <h3 style={{ fontFamily: fontSans, fontSize: 15, fontWeight: 600, color: cg.paper }}>{c.title}</h3>
                        <span style={{ fontFamily: fontMono, fontSize: 10, color: cg.muted, fontStyle: "italic" }}>{c.doctrine}</span>
                      </div>
                      <ChevronDown size={16} color={cg.muted} style={{
                        transform: expandedContradiction === c.id ? "rotate(180deg)" : "rotate(0)",
                        transition: "transform 0.2s",
                      }} />
                    </button>
                    {expandedContradiction === c.id && (
                      <div style={{ padding: "0 20px 16px 60px" }}>
                        <p style={{ fontFamily: fontSans, fontSize: 13, color: cg.paper, lineHeight: 1.7, marginBottom: 8 }}>
                          {c.description}
                        </p>
                        <p style={{ fontFamily: fontMono, fontSize: 10, color: cg.purple, lineHeight: 1.5 }}>
                          {c.citation}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div style={{
                marginTop: 16, padding: "16px 20px",
                background: "rgba(212,160,23,0.06)", border: `1px solid ${cg.goldBorder}`,
                borderRadius: 8,
              }}>
                <p style={{ fontFamily: fontSerif, fontSize: 15, fontStyle: "italic", color: cg.gold, lineHeight: 1.7 }}>
                  "The system holds you accountable for knowing the law, then makes it functionally impossible to know 
                  the law without paying a gatekeeper. That is not a justice system. That is a toll booth."
                </p>
              </div>
            </section>

            {/* ── The Justice Gap ── */}
            <section style={{ marginBottom: 48 }}>
              <h2 style={{ fontFamily: fontSerif, fontSize: 22, color: cg.paper, marginBottom: 8 }}>
                The Access to Justice Gap
              </h2>
              <p style={{ fontFamily: fontSans, fontSize: 14, color: cg.muted, lineHeight: 1.7, marginBottom: 20 }}>
                The gap between the legal help people need and the legal help they can access is not a minor 
                inefficiency — it is a systemic failure documented by the legal profession's own institutions.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
                {JUSTICE_GAP_STATS.map((s, i) => (
                  <div key={i} style={{
                    background: cg.cardBg, border: `1px solid ${cg.cardBorder}`,
                    borderRadius: 8, padding: "16px 20px",
                  }}>
                    <span style={{ fontFamily: fontMono, fontSize: 28, fontWeight: 700, color: cg.red }}>{s.stat}</span>
                    <p style={{ fontFamily: fontSans, fontSize: 12, color: cg.paper, lineHeight: 1.5, marginTop: 6 }}>{s.label}</p>
                    <p style={{ fontFamily: fontMono, fontSize: 9, color: cg.muted, marginTop: 6 }}>{s.source}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* ── The Antitrust Argument ── */}
            <section style={{ marginBottom: 48 }}>
              <button
                onClick={() => setShowAntitrust(!showAntitrust)}
                style={{
                  width: "100%", background: cg.goldBg, border: `1px solid ${cg.goldBorder}`,
                  borderRadius: 8, padding: "16px 20px", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 12, textAlign: "left",
                }}
              >
                <Gavel size={20} color={cg.gold} />
                <div style={{ flex: 1 }}>
                  <h2 style={{ fontFamily: fontSerif, fontSize: 20, color: cg.paper }}>
                    The Antitrust Argument
                  </h2>
                  <p style={{ fontFamily: fontSans, fontSize: 12, color: cg.muted }}>
                    Monopolies are illegal. The legal profession is a monopoly. The law says so.
                  </p>
                </div>
                <ChevronDown size={16} color={cg.gold} style={{
                  transform: showAntitrust ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s",
                }} />
              </button>
              {showAntitrust && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                  {ANTITRUST_POINTS.map((p, i) => (
                    <div key={i} style={{
                      background: cg.cardBg, border: `1px solid ${cg.cardBorder}`,
                      borderRadius: 8, padding: "16px 20px",
                    }}>
                      <h4 style={{ fontFamily: fontSans, fontSize: 14, fontWeight: 600, color: cg.gold, marginBottom: 6 }}>{p.title}</h4>
                      <p style={{ fontFamily: fontSans, fontSize: 13, color: cg.paper, lineHeight: 1.7 }}>{p.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ── The Movement Timeline ── */}
            <section style={{ marginBottom: 48 }}>
              <h2 style={{ fontFamily: fontSerif, fontSize: 22, color: cg.paper, marginBottom: 8 }}>
                The Movement: Toward a Civil Right to Counsel
              </h2>
              <p style={{ fontFamily: fontSans, fontSize: 14, color: cg.muted, lineHeight: 1.7, marginBottom: 20 }}>
                The idea that every person deserves legal representation in civil cases affecting basic human needs 
                is not radical — it is the logical extension of principles the legal system already claims to uphold.
              </p>

              <div style={{ position: "relative", paddingLeft: 28 }}>
                <div style={{
                  position: "absolute", left: 8, top: 0, bottom: 0, width: 2,
                  background: `linear-gradient(to bottom, ${cg.red}, ${cg.gold}, ${cg.green})`,
                }} />

                {MOVEMENT_MILESTONES.map((m, i) => (
                  <div key={i} style={{ position: "relative", marginBottom: 16 }}>
                    <div style={{
                      position: "absolute", left: -24, top: 6, width: 12, height: 12,
                      borderRadius: "50%", background: cg.bg,
                      border: `2px solid ${i < 4 ? cg.red : i < 7 ? cg.gold : cg.green}`,
                    }} />
                    <div style={{
                      background: cg.cardBg, border: `1px solid ${cg.cardBorder}`,
                      borderRadius: 8, padding: "12px 16px",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontFamily: fontMono, fontSize: 12, fontWeight: 700, color: i < 4 ? cg.red : i < 7 ? cg.gold : cg.green }}>{m.year}</span>
                        <span style={{ fontFamily: fontSans, fontSize: 14, fontWeight: 600, color: cg.paper }}>{m.event}</span>
                      </div>
                      <p style={{ fontFamily: fontSans, fontSize: 12, color: cg.muted, lineHeight: 1.6 }}>{m.description}</p>
                      <p style={{ fontFamily: fontMono, fontSize: 9, color: cg.purple, marginTop: 4 }}>{m.citation}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ── The Proposal ── */}
            <section style={{ marginBottom: 48 }}>
              <h2 style={{ fontFamily: fontSerif, fontSize: 22, color: cg.paper, marginBottom: 8 }}>
                The Logical Conclusion
              </h2>
              <div style={{
                background: cg.redBg, border: `1px solid ${cg.redBorder}`,
                borderRadius: 10, padding: "24px 28px",
              }}>
                <p style={{ fontFamily: fontSans, fontSize: 14, color: cg.paper, lineHeight: 1.8, marginBottom: 16 }}>
                  If the state criminalizes self-representation through UPL rules, and the state does not guarantee 
                  representation, then the state has created a constitutional violation. You cannot simultaneously say 
                  "you are not allowed to help yourself" and "we are not required to help you."
                </p>
                <p style={{ fontFamily: fontSans, fontSize: 14, color: cg.paper, lineHeight: 1.8, marginBottom: 16 }}>
                  The resolution is straightforward: <strong>if the state maintains UPL rules that prevent citizens from 
                  obtaining affordable legal assistance, the state must provide counsel in civil cases involving housing, 
                  family law, public benefits, employment, and civil rights.</strong> Not as charity. As a constitutional obligation.
                </p>
                <p style={{ fontFamily: fontSans, fontSize: 14, color: cg.paper, lineHeight: 1.8, marginBottom: 16 }}>
                  Alternatively: <strong>if the state cannot or will not provide counsel, it must relax UPL rules to allow 
                  qualified non-lawyers — paralegals, legal technicians, community advocates, and technology platforms — 
                  to provide the assistance that the legal profession has failed to deliver.</strong>
                </p>
                <p style={{ fontFamily: fontSerif, fontSize: 16, fontStyle: "italic", color: cg.gold, lineHeight: 1.7 }}>
                  The law belongs to everyone. Making it accessible is not practicing law. It is practicing democracy.
                </p>
              </div>
            </section>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════
           TAB: RIGHT-TO-COUNSEL TRACKER
           ═══════════════════════════════════════════════════════════ */}
        {activeTab === "tracker" && (
          <>
            <section style={{ marginBottom: 48 }}>
              <h2 style={{ fontFamily: fontSerif, fontSize: 22, color: cg.paper, marginBottom: 8 }}>
                Right-to-Counsel Tracker
              </h2>
              <p style={{ fontFamily: fontSans, fontSize: 14, color: cg.muted, lineHeight: 1.7, marginBottom: 8 }}>
                State-by-state mapping of where civil counsel is guaranteed, what case types are covered, 
                and the measured outcomes. The gap between "A" states and "F" states is the gap between 
                justice and its absence.
              </p>
              <p style={{ fontFamily: fontSans, fontSize: 13, color: cg.muted, lineHeight: 1.7, marginBottom: 24 }}>
                <strong style={{ color: cg.paper }}>The family court problem:</strong> In many jurisdictions, family law cases — custody, 
                dependency, domestic violence — are heard in the same courthouse, by the same judges, using the same adversarial 
                machinery designed for criminal prosecution. A judge who just sentenced someone for a violent felony carries that 
                cognitive frame into a custody hearing. The outcomes reflect it.
              </p>

              {/* Grade distribution */}
              {summary && (
                <div style={{
                  display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap",
                }}>
                  {(["A", "B", "C", "D", "F"] as const).map(grade => (
                    <div key={grade} style={{
                      background: cg.cardBg, border: `1px solid ${cg.cardBorder}`,
                      borderRadius: 6, padding: "10px 16px", textAlign: "center", minWidth: 70,
                    }}>
                      <span style={{ fontFamily: fontMono, fontSize: 24, fontWeight: 700, color: gradeColor(grade) }}>{grade}</span>
                      <p style={{ fontFamily: fontMono, fontSize: 11, color: cg.muted, marginTop: 2 }}>
                        {summary.grade_distribution[grade]} state{summary.grade_distribution[grade] !== 1 ? "s" : ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* State cards */}
              {rtcProfiles && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {rtcProfiles.map((profile: any) => {
                    const isExpanded = selectedRTCState === profile.state;
                    return (
                      <div key={profile.state} style={{
                        background: isExpanded ? cg.purpleBg : cg.cardBg,
                        border: `1px solid ${isExpanded ? cg.purpleBorder : cg.cardBorder}`,
                        borderRadius: 8, overflow: "hidden", transition: "all 0.2s",
                      }}>
                        <button
                          onClick={() => setSelectedRTCState(isExpanded ? null : profile.state)}
                          style={{
                            width: "100%", background: "none", border: "none", cursor: "pointer",
                            padding: "14px 20px", display: "flex", alignItems: "center", gap: 12,
                            textAlign: "left",
                          }}
                        >
                          <span style={{
                            fontFamily: fontMono, fontSize: 20, fontWeight: 700,
                            color: gradeColor(profile.overall_grade), minWidth: 32,
                          }}>{profile.overall_grade}</span>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontFamily: fontSans, fontSize: 15, fontWeight: 600, color: cg.paper }}>
                              {profile.state_name}
                            </span>
                            <span style={{ fontFamily: fontMono, fontSize: 11, color: cg.muted, marginLeft: 8 }}>
                              {profile.state} — {profile.provisions.length} provision{profile.provisions.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            {profile.provisions.some((p: any) => p.category === "housing_eviction") && (
                              <span style={{ fontFamily: fontMono, fontSize: 9, color: cg.green, background: cg.greenBg, padding: "2px 6px", borderRadius: 4 }}>EVICTION</span>
                            )}
                            {profile.provisions.some((p: any) => p.category.startsWith("family_")) && (
                              <span style={{ fontFamily: fontMono, fontSize: 9, color: cg.teal, background: cg.tealBg, padding: "2px 6px", borderRadius: 4 }}>FAMILY</span>
                            )}
                          </div>
                          <ChevronDown size={14} color={cg.muted} style={{
                            transform: isExpanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s",
                          }} />
                        </button>

                        {isExpanded && (
                          <div style={{ padding: "0 20px 16px" }}>
                            {/* Provisions */}
                            <div style={{ marginBottom: 16 }}>
                              <h4 style={{ fontFamily: fontMono, fontSize: 10, color: cg.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Provisions</h4>
                              {profile.provisions.map((prov: any, i: number) => (
                                <div key={i} style={{
                                  background: cg.cardBg, border: `1px solid ${cg.cardBorder}`,
                                  borderRadius: 6, padding: "12px 16px", marginBottom: 6,
                                }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                    <span style={{
                                      fontFamily: fontMono, fontSize: 9, textTransform: "uppercase",
                                      color: prov.type === "statutory" ? cg.green : prov.type === "local_ordinance" ? cg.teal : cg.gold,
                                      background: prov.type === "statutory" ? cg.greenBg : prov.type === "local_ordinance" ? cg.tealBg : cg.goldBg,
                                      padding: "2px 6px", borderRadius: 3,
                                    }}>{prov.type.replace("_", " ")}</span>
                                    <span style={{
                                      fontFamily: fontMono, fontSize: 9, textTransform: "uppercase", color: cg.muted,
                                    }}>{prov.category.replace(/_/g, " ")}</span>
                                    <span style={{
                                      fontFamily: fontMono, fontSize: 9, color: cg.purple,
                                      marginLeft: "auto",
                                    }}>{prov.coverage_scope}</span>
                                  </div>
                                  <p style={{ fontFamily: fontSans, fontSize: 12, color: cg.paper, lineHeight: 1.6, marginBottom: 4 }}>
                                    {prov.description}
                                  </p>
                                  <p style={{ fontFamily: fontMono, fontSize: 9, color: cg.purple }}>{prov.citation}</p>
                                  {prov.outcome_data && (
                                    <div style={{
                                      marginTop: 8, display: "flex", gap: 16,
                                      background: "rgba(52,211,153,0.04)", borderRadius: 4, padding: "8px 12px",
                                    }}>
                                      <div>
                                        <span style={{ fontFamily: fontMono, fontSize: 18, fontWeight: 700, color: cg.green }}>
                                          {prov.outcome_data.represented_success_rate}%
                                        </span>
                                        <p style={{ fontFamily: fontMono, fontSize: 9, color: cg.muted }}>Represented</p>
                                      </div>
                                      <div style={{ display: "flex", alignItems: "center" }}>
                                        <span style={{ fontFamily: fontSans, fontSize: 12, color: cg.muted }}>vs</span>
                                      </div>
                                      <div>
                                        <span style={{ fontFamily: fontMono, fontSize: 18, fontWeight: 700, color: cg.red }}>
                                          {prov.outcome_data.unrepresented_success_rate}%
                                        </span>
                                        <p style={{ fontFamily: fontMono, fontSize: 9, color: cg.muted }}>Unrepresented</p>
                                      </div>
                                      <p style={{ fontFamily: fontMono, fontSize: 8, color: cg.muted, marginLeft: "auto", alignSelf: "center" }}>
                                        {prov.outcome_data.source}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>

                            {/* Structural notes */}
                            {profile.structural_notes.length > 0 && (
                              <div style={{ marginBottom: 12 }}>
                                <h4 style={{ fontFamily: fontMono, fontSize: 10, color: cg.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Notes</h4>
                                {profile.structural_notes.map((note: string, i: number) => (
                                  <p key={i} style={{ fontFamily: fontSans, fontSize: 12, color: cg.paper, lineHeight: 1.5, marginBottom: 4 }}>
                                    • {note}
                                  </p>
                                ))}
                              </div>
                            )}

                            {/* Pending legislation */}
                            {profile.pending_legislation.length > 0 && (
                              <div style={{ marginBottom: 12 }}>
                                <h4 style={{ fontFamily: fontMono, fontSize: 10, color: cg.gold, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Pending Legislation</h4>
                                {profile.pending_legislation.map((leg: string, i: number) => (
                                  <p key={i} style={{ fontFamily: fontSans, fontSize: 12, color: cg.gold, lineHeight: 1.5, marginBottom: 4 }}>
                                    → {leg}
                                  </p>
                                ))}
                              </div>
                            )}

                            {/* Funding */}
                            {(profile.legal_aid_funding_per_capita || profile.legal_aid_attorneys_per_10k_poor) && (
                              <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
                                {profile.legal_aid_funding_per_capita && (
                                  <div>
                                    <span style={{ fontFamily: fontMono, fontSize: 16, fontWeight: 700, color: cg.paper }}>
                                      ${profile.legal_aid_funding_per_capita.toFixed(2)}
                                    </span>
                                    <p style={{ fontFamily: fontMono, fontSize: 9, color: cg.muted }}>Legal aid $/capita</p>
                                  </div>
                                )}
                                {profile.legal_aid_attorneys_per_10k_poor && (
                                  <div>
                                    <span style={{ fontFamily: fontMono, fontSize: 16, fontWeight: 700, color: cg.paper }}>
                                      {profile.legal_aid_attorneys_per_10k_poor.toFixed(1)}
                                    </span>
                                    <p style={{ fontFamily: fontMono, fontSize: 9, color: cg.muted }}>Attorneys/10k poor</p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════
           TAB: PRECEDENT CHAIN
           ═══════════════════════════════════════════════════════════ */}
        {activeTab === "precedent" && (
          <>
            <section style={{ marginBottom: 48 }}>
              <h2 style={{ fontFamily: fontSerif, fontSize: 22, color: cg.paper, marginBottom: 8 }}>
                The Doctrinal Path
              </h2>
              <p style={{ fontFamily: fontSans, fontSize: 14, color: cg.muted, lineHeight: 1.7, marginBottom: 24 }}>
                From <em>Powell v. Alabama</em> (1932) to <em>Upsolve v. James</em> (2024), the precedent chain traces 
                nearly a century of jurisprudence on the right to counsel. The trajectory is clear: the principle 
                that counsel is essential to due process has been affirmed repeatedly — but its extension to civil 
                cases has been systematically blocked.
              </p>

              {precedentChain && (
                <div style={{ position: "relative", paddingLeft: 32 }}>
                  {/* Timeline line */}
                  <div style={{
                    position: "absolute", left: 10, top: 0, bottom: 0, width: 2,
                    background: `linear-gradient(to bottom, ${cg.green}, ${cg.gold}, ${cg.red}, ${cg.gold}, ${cg.green})`,
                  }} />

                  {precedentChain.map((node: any, i: number) => {
                    const isExpanded = expandedPrecedent === node.id;
                    const nodeColor = node.outcome_for_rtc === "positive" ? cg.green : node.outcome_for_rtc === "negative" ? cg.red : cg.gold;
                    const nodeBg = node.outcome_for_rtc === "positive" ? cg.greenBg : node.outcome_for_rtc === "negative" ? cg.redBg : cg.goldBg;
                    const nodeBorder = node.outcome_for_rtc === "positive" ? cg.greenBorder : node.outcome_for_rtc === "negative" ? cg.redBorder : cg.goldBorder;

                    return (
                      <div key={node.id} style={{ position: "relative", marginBottom: 12 }}>
                        {/* Dot */}
                        <div style={{
                          position: "absolute", left: -28, top: 14, width: 14, height: 14,
                          borderRadius: "50%", background: cg.bg,
                          border: `3px solid ${nodeColor}`,
                        }} />

                        <div style={{
                          background: isExpanded ? nodeBg : cg.cardBg,
                          border: `1px solid ${isExpanded ? nodeBorder : cg.cardBorder}`,
                          borderRadius: 8, overflow: "hidden", transition: "all 0.2s",
                        }}>
                          <button
                            onClick={() => setExpandedPrecedent(isExpanded ? null : node.id)}
                            style={{
                              width: "100%", background: "none", border: "none", cursor: "pointer",
                              padding: "14px 18px", display: "flex", alignItems: "center", gap: 10,
                              textAlign: "left",
                            }}
                          >
                            {outcomeIcon(node.outcome_for_rtc)}
                            <span style={{ fontFamily: fontMono, fontSize: 12, fontWeight: 700, color: nodeColor, minWidth: 36 }}>
                              {node.year}
                            </span>
                            <div style={{ flex: 1 }}>
                              <span style={{ fontFamily: fontSans, fontSize: 14, fontWeight: 600, color: cg.paper }}>
                                {node.case_name}
                              </span>
                              <span style={{ fontFamily: fontMono, fontSize: 10, color: cg.muted, marginLeft: 8 }}>
                                {node.citation}
                              </span>
                            </div>
                            <ChevronDown size={14} color={cg.muted} style={{
                              transform: isExpanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s",
                            }} />
                          </button>

                          {isExpanded && (
                            <div style={{ padding: "0 18px 16px 42px" }}>
                              <p style={{ fontFamily: fontMono, fontSize: 10, color: cg.muted, marginBottom: 8 }}>{node.court}</p>
                              <div style={{ marginBottom: 12 }}>
                                <h4 style={{ fontFamily: fontMono, fontSize: 10, color: cg.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Holding</h4>
                                <p style={{ fontFamily: fontSans, fontSize: 13, color: cg.paper, lineHeight: 1.7 }}>{node.holding}</p>
                              </div>
                              <div style={{ marginBottom: 12 }}>
                                <h4 style={{ fontFamily: fontMono, fontSize: 10, color: cg.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Significance for Civil RTC</h4>
                                <p style={{ fontFamily: fontSans, fontSize: 13, color: cg.paper, lineHeight: 1.7 }}>{node.significance}</p>
                              </div>
                              <div style={{
                                background: "rgba(168,85,247,0.06)", border: `1px solid ${cg.purpleBorder}`,
                                borderRadius: 6, padding: "12px 16px", marginBottom: 12,
                              }}>
                                <p style={{ fontFamily: fontSerif, fontSize: 14, fontStyle: "italic", color: cg.purple, lineHeight: 1.7 }}>
                                  "{node.key_quote}"
                                </p>
                              </div>
                              {node.connects_to.length > 0 && (
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                                  <span style={{ fontFamily: fontMono, fontSize: 9, color: cg.muted }}>Influenced →</span>
                                  {node.connects_to.map((ref: string) => {
                                    const target = precedentChain.find((n: any) => n.id === ref);
                                    return target ? (
                                      <button
                                        key={ref}
                                        onClick={() => setExpandedPrecedent(ref)}
                                        style={{
                                          background: cg.cardBg, border: `1px solid ${cg.cardBorder}`,
                                          borderRadius: 4, padding: "3px 8px", cursor: "pointer",
                                          fontFamily: fontMono, fontSize: 10, color: cg.paper,
                                        }}
                                      >
                                        {target.case_name} ({target.year})
                                      </button>
                                    ) : null;
                                  })}
                                </div>
                              )}
                              <a
                                href={node.full_text_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: "inline-flex", alignItems: "center", gap: 4,
                                  fontFamily: fontMono, fontSize: 10, color: cg.purple,
                                  textDecoration: "none", marginTop: 8,
                                }}
                              >
                                <ExternalLink size={10} /> Read full text
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════
           TAB: STRUCTURAL BIAS
           ═══════════════════════════════════════════════════════════ */}
        {activeTab === "bias" && (
          <>
            <section style={{ marginBottom: 48 }}>
              <h2 style={{ fontFamily: fontSerif, fontSize: 22, color: cg.paper, marginBottom: 8 }}>
                Structural Bias in Family Court
              </h2>
              <p style={{ fontFamily: fontSans, fontSize: 14, color: cg.muted, lineHeight: 1.7, marginBottom: 8 }}>
                Family law cases — custody, dependency, domestic violence — are among the most consequential 
                proceedings a person can face. Yet in many jurisdictions, they are processed in the same courthouses, 
                by the same judges, using the same adversarial machinery designed for criminal prosecution.
              </p>
              <p style={{ fontFamily: fontSans, fontSize: 14, color: cg.muted, lineHeight: 1.7, marginBottom: 24 }}>
                A judge who just handled a violent felony case carries that cognitive frame into a custody hearing. 
                A parent who cannot afford an attorney faces the same procedural complexity as a criminal defendant — 
                but without the constitutional guarantee of counsel. The outcomes reflect it.
              </p>

              {/* Summary indicators */}
              {summary && (
                <div style={{
                  display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8,
                  marginBottom: 24,
                }}>
                  <div style={{
                    background: cg.redBg, border: `1px solid ${cg.redBorder}`,
                    borderRadius: 6, padding: "14px 18px",
                  }}>
                    <span style={{ fontFamily: fontMono, fontSize: 28, fontWeight: 700, color: cg.red }}>
                      {summary.states_sharing_judges_with_criminal}
                    </span>
                    <p style={{ fontFamily: fontSans, fontSize: 12, color: cg.paper, marginTop: 4 }}>
                      of {summary.structural_bias_states_profiled} profiled states share judges between family and criminal courts
                    </p>
                  </div>
                  <div style={{
                    background: cg.goldBg, border: `1px solid ${cg.goldBorder}`,
                    borderRadius: 6, padding: "14px 18px",
                  }}>
                    <span style={{ fontFamily: fontMono, fontSize: 28, fontWeight: 700, color: cg.gold }}>
                      {summary.states_sharing_courthouse_with_criminal}
                    </span>
                    <p style={{ fontFamily: fontSans, fontSize: 12, color: cg.paper, marginTop: 4 }}>
                      of {summary.structural_bias_states_profiled} profiled states share courthouses with criminal courts
                    </p>
                  </div>
                </div>
              )}

              {/* State bias profiles */}
              {biasProfiles && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {biasProfiles.map((profile: any) => {
                    const isExpanded = selectedBiasState === profile.state;
                    const hasSharedJudges = profile.court_structure.shares_judges_with_criminal;
                    return (
                      <div key={profile.state} style={{
                        background: isExpanded ? (hasSharedJudges ? cg.redBg : cg.greenBg) : cg.cardBg,
                        border: `1px solid ${isExpanded ? (hasSharedJudges ? cg.redBorder : cg.greenBorder) : cg.cardBorder}`,
                        borderRadius: 8, overflow: "hidden", transition: "all 0.2s",
                      }}>
                        <button
                          onClick={() => setSelectedBiasState(isExpanded ? null : profile.state)}
                          style={{
                            width: "100%", background: "none", border: "none", cursor: "pointer",
                            padding: "14px 20px", display: "flex", alignItems: "center", gap: 12,
                            textAlign: "left",
                          }}
                        >
                          <Building2 size={16} color={hasSharedJudges ? cg.red : cg.green} />
                          <span style={{ fontFamily: fontSans, fontSize: 15, fontWeight: 600, color: cg.paper, flex: 1 }}>
                            {profile.state_name}
                          </span>
                          <div style={{ display: "flex", gap: 6 }}>
                            {hasSharedJudges && (
                              <span style={{ fontFamily: fontMono, fontSize: 9, color: cg.red, background: cg.redBg, padding: "2px 6px", borderRadius: 4 }}>SHARED JUDGES</span>
                            )}
                            {profile.court_structure.unified_family_court && (
                              <span style={{ fontFamily: fontMono, fontSize: 9, color: cg.green, background: cg.greenBg, padding: "2px 6px", borderRadius: 4 }}>UNIFIED</span>
                            )}
                          </div>
                          <ChevronDown size={14} color={cg.muted} style={{
                            transform: isExpanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s",
                          }} />
                        </button>

                        {isExpanded && (
                          <div style={{ padding: "0 20px 16px" }}>
                            {/* Court structure */}
                            <div style={{ marginBottom: 16 }}>
                              <h4 style={{ fontFamily: fontMono, fontSize: 10, color: cg.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Court Structure</h4>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                                {[
                                  { label: "Unified Family Court", value: profile.court_structure.unified_family_court },
                                  { label: "Separate Family Division", value: profile.court_structure.separate_family_division },
                                  { label: "Shares Judges w/ Criminal", value: profile.court_structure.shares_judges_with_criminal, invert: true },
                                  { label: "Shares Courthouse w/ Criminal", value: profile.court_structure.shares_courthouse_with_criminal, invert: true },
                                  { label: "Specialized Family Judges", value: profile.court_structure.specialized_family_judges },
                                  { label: "Training Required", value: profile.court_structure.family_judge_training_required },
                                ].map((item, i) => (
                                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    {item.invert ? (
                                      item.value ? <XCircle size={12} color={cg.red} /> : <CheckCircle2 size={12} color={cg.green} />
                                    ) : (
                                      item.value ? <CheckCircle2 size={12} color={cg.green} /> : <XCircle size={12} color={cg.red} />
                                    )}
                                    <span style={{ fontFamily: fontSans, fontSize: 11, color: cg.paper }}>{item.label}</span>
                                  </div>
                                ))}
                              </div>
                              {profile.court_structure.family_judge_training_hours && (
                                <p style={{ fontFamily: fontMono, fontSize: 10, color: cg.muted, marginTop: 6 }}>
                                  Required training: {profile.court_structure.family_judge_training_hours} hours
                                </p>
                              )}
                            </div>

                            {/* Procedural concerns */}
                            <div style={{ marginBottom: 16 }}>
                              <h4 style={{ fontFamily: fontMono, fontSize: 10, color: cg.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Procedural Safeguards</h4>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                                {[
                                  { label: "Guardian ad Litem Available", value: profile.procedural_concerns.guardian_ad_litem_available },
                                  { label: "Mediation Before Trial", value: profile.procedural_concerns.mediation_required_before_trial },
                                  { label: "Child Representation Guaranteed", value: profile.procedural_concerns.child_representation_guaranteed },
                                  { label: "Continuances for Pro Se", value: profile.procedural_concerns.continuances_for_pro_se },
                                  { label: "Default Judgments Allowed", value: profile.procedural_concerns.default_judgments_allowed, invert: true },
                                ].map((item, i) => (
                                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    {item.invert ? (
                                      item.value ? <XCircle size={12} color={cg.red} /> : <CheckCircle2 size={12} color={cg.green} />
                                    ) : (
                                      item.value ? <CheckCircle2 size={12} color={cg.green} /> : <XCircle size={12} color={cg.red} />
                                    )}
                                    <span style={{ fontFamily: fontSans, fontSize: 11, color: cg.paper }}>{item.label}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Outcome disparities */}
                            <div>
                              <h4 style={{ fontFamily: fontMono, fontSize: 10, color: cg.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Representation Gap — Outcome Disparities</h4>

                              {profile.outcome_disparities.pro_se_vs_represented_custody_loss_rate && (
                                <div style={{ marginBottom: 12 }}>
                                  <p style={{ fontFamily: fontSans, fontSize: 11, color: cg.muted, marginBottom: 6 }}>Custody Loss Rate</p>
                                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                                        <span style={{ fontFamily: fontMono, fontSize: 10, color: cg.red }}>Pro Se</span>
                                        <span style={{ fontFamily: fontMono, fontSize: 10, color: cg.red }}>{profile.outcome_disparities.pro_se_vs_represented_custody_loss_rate.pro_se}%</span>
                                      </div>
                                      <div style={{ height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3 }}>
                                        <div style={{ height: "100%", width: `${profile.outcome_disparities.pro_se_vs_represented_custody_loss_rate.pro_se}%`, background: cg.red, borderRadius: 3 }} />
                                      </div>
                                    </div>
                                    <span style={{ fontFamily: fontSans, fontSize: 10, color: cg.muted, padding: "0 4px" }}>vs</span>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                                        <span style={{ fontFamily: fontMono, fontSize: 10, color: cg.green }}>Represented</span>
                                        <span style={{ fontFamily: fontMono, fontSize: 10, color: cg.green }}>{profile.outcome_disparities.pro_se_vs_represented_custody_loss_rate.represented}%</span>
                                      </div>
                                      <div style={{ height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3 }}>
                                        <div style={{ height: "100%", width: `${profile.outcome_disparities.pro_se_vs_represented_custody_loss_rate.represented}%`, background: cg.green, borderRadius: 3 }} />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {profile.outcome_disparities.pro_se_vs_represented_eviction_rate && (
                                <div style={{ marginBottom: 12 }}>
                                  <p style={{ fontFamily: fontSans, fontSize: 11, color: cg.muted, marginBottom: 6 }}>Eviction Rate</p>
                                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                                        <span style={{ fontFamily: fontMono, fontSize: 10, color: cg.red }}>Pro Se</span>
                                        <span style={{ fontFamily: fontMono, fontSize: 10, color: cg.red }}>{profile.outcome_disparities.pro_se_vs_represented_eviction_rate.pro_se}%</span>
                                      </div>
                                      <div style={{ height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3 }}>
                                        <div style={{ height: "100%", width: `${profile.outcome_disparities.pro_se_vs_represented_eviction_rate.pro_se}%`, background: cg.red, borderRadius: 3 }} />
                                      </div>
                                    </div>
                                    <span style={{ fontFamily: fontSans, fontSize: 10, color: cg.muted, padding: "0 4px" }}>vs</span>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                                        <span style={{ fontFamily: fontMono, fontSize: 10, color: cg.green }}>Represented</span>
                                        <span style={{ fontFamily: fontMono, fontSize: 10, color: cg.green }}>{profile.outcome_disparities.pro_se_vs_represented_eviction_rate.represented}%</span>
                                      </div>
                                      <div style={{ height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3 }}>
                                        <div style={{ height: "100%", width: `${profile.outcome_disparities.pro_se_vs_represented_eviction_rate.represented}%`, background: cg.green, borderRadius: 3 }} />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {profile.outcome_disparities.median_case_duration_pro_se_days && (
                                <div style={{ marginBottom: 8 }}>
                                  <p style={{ fontFamily: fontSans, fontSize: 11, color: cg.muted, marginBottom: 4 }}>Median Case Duration</p>
                                  <p style={{ fontFamily: fontSans, fontSize: 12, color: cg.paper }}>
                                    Pro se: <strong style={{ color: cg.red }}>{profile.outcome_disparities.median_case_duration_pro_se_days} days</strong>
                                    {" "}vs Represented: <strong style={{ color: cg.green }}>{profile.outcome_disparities.median_case_duration_represented_days} days</strong>
                                  </p>
                                  <p style={{ fontFamily: fontSans, fontSize: 11, color: cg.muted, marginTop: 2 }}>
                                    Pro se cases resolve faster — not because they are simpler, but because unrepresented 
                                    litigants cannot effectively contest, delay, or negotiate.
                                  </p>
                                </div>
                              )}

                              <p style={{ fontFamily: fontMono, fontSize: 9, color: cg.purple, marginTop: 8 }}>
                                Source: {profile.outcome_disparities.source}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════
           TAB: TAKE ACTION
           ═══════════════════════════════════════════════════════════ */}
        {activeTab === "action" && (
          <>
            <section style={{ marginBottom: 48 }}>
              <h2 style={{ fontFamily: fontSerif, fontSize: 22, color: cg.paper, marginBottom: 16 }}>
                What You Can Do
              </h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 10 }}>
                <ActionCard
                  icon={Send}
                  title="Write to Your Legislators"
                  description="Use LumenSend to draft a letter to your state representatives supporting Civil Right to Counsel legislation."
                  onClick={() => navigate("/lumensend?type=inquiry&context=Civil+Right+to+Counsel+legislation")}
                  color={cg.green}
                />
                <ActionCard
                  icon={BookOpen}
                  title="Explore the Legal Library"
                  description="Research the statutes, case law, and enforcement records that document the access to justice gap in your state."
                  onClick={() => navigate("/legal-library")}
                  color={cg.purple}
                />
                <ActionCard
                  icon={MapPin}
                  title="Find Help Near You"
                  description="Use the Lighthouse to find legal aid organizations, pro bono programs, and self-help resources in your jurisdiction."
                  onClick={() => navigate("/lighthouse")}
                  color={cg.gold}
                />
                <ActionCard
                  icon={Users}
                  title="Join the Movement"
                  description="The National Coalition for a Civil Right to Counsel tracks legislation and advocacy efforts in all 50 states."
                  onClick={() => window.open("http://civilrighttocounsel.org", "_blank")}
                  color={cg.teal}
                />
              </div>
            </section>

            {/* ── Sources ── */}
            <section style={{ marginTop: 48 }}>
              <h3 style={{ fontFamily: fontMono, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: cg.muted, marginBottom: 12 }}>
                Sources & Further Reading
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  { title: "Legal Services Corporation — Justice Gap Report (2022)", url: "https://justicegap.lsc.gov/" },
                  { title: "ABA Resolution 112A — Civil Right to Counsel (2006)", url: "https://www.americanbar.org/groups/legal_aid_indigent_defense/resource_center_for_access_to_justice/resolution-112/" },
                  { title: "National Coalition for a Civil Right to Counsel", url: "http://civilrighttocounsel.org/" },
                  { title: "NCSC — Modernizing UPL Regulations (2023)", url: "https://www.ncsc.org/" },
                  { title: "Gideon v. Wainwright, 372 U.S. 335 (1963)", url: "https://supreme.justia.com/cases/federal/us/372/335/" },
                  { title: "Lassiter v. DSS, 452 U.S. 18 (1981)", url: "https://supreme.justia.com/cases/federal/us/452/18/" },
                  { title: "Turner v. Rogers, 564 U.S. 431 (2011)", url: "https://supreme.justia.com/cases/federal/us/564/431/" },
                  { title: "N.C. State Board of Dental Examiners v. FTC, 574 U.S. 494 (2015)", url: "https://supreme.justia.com/cases/federal/us/574/494/" },
                  { title: "Haines v. Kerner, 404 U.S. 519 (1972)", url: "https://supreme.justia.com/cases/federal/us/404/519/" },
                  { title: "Upsolve v. James (S.D.N.Y. 2024)", url: "https://www.upsolve.org/learn/upsolve-v-james" },
                  { title: "Utah Supreme Court Regulatory Sandbox", url: "https://utahinnovationoffice.org/" },
                  { title: "Powell v. Alabama, 287 U.S. 45 (1932)", url: "https://supreme.justia.com/cases/federal/us/287/45/" },
                  { title: "Santosky v. Kramer, 455 U.S. 745 (1982)", url: "https://supreme.justia.com/cases/federal/us/455/745/" },
                ].map((s, i) => (
                  <a
                    key={i}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      fontFamily: fontMono, fontSize: 11, color: cg.purple,
                      textDecoration: "none", padding: "4px 0",
                    }}
                  >
                    <ExternalLink size={10} />
                    {s.title}
                  </a>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function ActionCard({ icon: Icon, title, description, onClick, color }: {
  icon: any; title: string; description: string; onClick: () => void; color: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: cg.cardBg, border: `1px solid ${cg.cardBorder}`,
        borderRadius: 8, padding: "20px", cursor: "pointer",
        textAlign: "left", transition: "all 0.2s",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = color; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = cg.cardBorder; }}
    >
      <Icon size={20} color={color} style={{ marginBottom: 10 }} />
      <h4 style={{ fontFamily: fontSans, fontSize: 14, fontWeight: 600, color: cg.paper, marginBottom: 6 }}>{title}</h4>
      <p style={{ fontFamily: fontSans, fontSize: 12, color: cg.muted, lineHeight: 1.5 }}>{description}</p>
    </button>
  );
}
