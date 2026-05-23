import { useState, useMemo } from "react";
import { useAuth } from "@/core/hooks/useAuth";
import { useLocation } from "wouter";
import { useWorldIndex, type WorldObject } from "@/hooks/useWorldIndex";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Heart, Scale, Shield, Phone, Globe,
  Building2, Users, BookOpen, ChevronRight, ArrowRight,
  Landmark, Gavel, HelpCircle, MapPin, ExternalLink,
  Briefcase, GraduationCap, Home, Baby, Accessibility,
  Stethoscope, Banknote, FileText, Loader2, Filter,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════
   RESOURCE DIRECTORY — Where You Find Help
   
   Now powered by the unified World Index (world.getIndex).
   Displays programs (type='program') and agencies (type='agency')
   from the single projection layer.
   ═══════════════════════════════════════════════════════════════════════ */

const rd = {
  bg: "#0c0e14",
  cardBg: "rgba(34,197,94,0.03)",
  cardBorder: "rgba(34,197,94,0.12)",
  green: "#22c55e",
  emerald: "#10b981",
  teal: "#14b8a6",
  cream: "#f5edd6",
  muted: "#8b8070",
  purple: "#a855f7",
  cyan: "#06b6d4",
  gold: "#d4a017",
  red: "#ef4444",
  amber: "#f59e0b",
};
const fontSerif = "'Cormorant Garamond', serif";
const fontSans = "'DM Sans', sans-serif";
const fontMono = "'JetBrains Mono', monospace";

// Map program categories to UI categories
const CATEGORY_MAP: Record<string, string[]> = {
  benefits: ["cash_assistance", "food_assistance", "childcare", "tanf", "snap", "wic"],
  "legal-aid": ["legal_aid", "legal_services", "civil_rights"],
  crisis: ["crisis", "mental_health", "domestic_violence", "emergency"],
  housing: ["housing", "rental_assistance", "shelter", "eviction_prevention"],
  government: ["government", "oversight", "regulatory", "enforcement"],
  disability: ["disability", "ada", "vocational_rehabilitation", "ssi", "ssdi"],
  elder: ["elder", "aging", "long_term_care", "nursing"],
  children: ["child_welfare", "child_care", "education", "family_services"],
};

interface ResourceCategory {
  id: string;
  icon: React.ElementType;
  title: string;
  description: string;
  color: string;
  internalHref?: string;
}

const CATEGORY_CONFIG: ResourceCategory[] = [
  {
    id: "benefits",
    icon: Heart,
    title: "Benefits Navigator",
    description: "Discover government benefits you may qualify for. Guided screening for federal, state, and local programs.",
    color: rd.green,
    internalHref: "/benefits",
  },
  {
    id: "legal-aid",
    icon: Scale,
    title: "Legal Aid & Pro Bono",
    description: "Free and low-cost legal assistance. Find legal aid organizations, pro bono attorneys, and law school clinics.",
    color: rd.purple,
  },
  {
    id: "crisis",
    icon: Phone,
    title: "Crisis & Emergency",
    description: "Immediate help for emergencies. Hotlines for domestic violence, mental health, housing, and more.",
    color: rd.red,
  },
  {
    id: "housing",
    icon: Home,
    title: "Housing & Shelter",
    description: "Housing assistance, tenant rights, eviction prevention, and emergency shelter resources.",
    color: rd.amber,
  },
  {
    id: "government",
    icon: Landmark,
    title: "Government Agencies & Oversight",
    description: "File complaints and access services from federal and state oversight bodies.",
    color: rd.cyan,
  },
  {
    id: "disability",
    icon: Accessibility,
    title: "Disability Rights",
    description: "Resources for disability benefits, accommodations, and civil rights protections.",
    color: rd.teal,
  },
  {
    id: "elder",
    icon: Users,
    title: "Elder Care & Protection",
    description: "Resources for elder abuse prevention, long-term care advocacy, and senior services.",
    color: rd.gold,
  },
  {
    id: "children",
    icon: Baby,
    title: "Children & Family",
    description: "Child welfare, custody, education rights, and family support services.",
    color: rd.emerald,
  },
];

export default function ResourceDirectory() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [jurisdictionFilter, setJurisdictionFilter] = useState<string | null>(null);

  // ── World Index: single source of truth ──
  const { nodes, nodesByType, jurisdictions, isLoading, error } = useWorldIndex();

  // Programs and agencies from the world index
  const programs = useMemo(() => {
    const all = nodesByType["program"] ?? [];
    if (!jurisdictionFilter) return all;
    return all.filter(n => n.jurisdiction === jurisdictionFilter);
  }, [nodesByType, jurisdictionFilter]);

  const agencies = useMemo(() => {
    const all = nodesByType["agency"] ?? [];
    if (!jurisdictionFilter) return all;
    return all.filter(n => n.jurisdiction === jurisdictionFilter);
  }, [nodesByType, jurisdictionFilter]);

  // Classify programs into categories
  const getResourcesForCategory = (categoryId: string): WorldObject[] => {
    if (categoryId === "government") {
      // Government category shows agencies (oversight bodies)
      return agencies;
    }
    const keywords = CATEGORY_MAP[categoryId] || [];
    if (keywords.length === 0) return [];
    return programs.filter(p => {
      const cat = (p.metadata?.category || p.domain || "").toLowerCase();
      const name = (p.metadata?.name || "").toLowerCase();
      return keywords.some(kw => cat.includes(kw) || name.includes(kw));
    });
  };

  // Count all uncategorized programs
  const uncategorizedPrograms = useMemo(() => {
    const allKeywords = Object.values(CATEGORY_MAP).flat();
    return programs.filter(p => {
      const cat = (p.metadata?.category || p.domain || "").toLowerCase();
      const name = (p.metadata?.name || "").toLowerCase();
      return !allKeywords.some(kw => cat.includes(kw) || name.includes(kw));
    });
  }, [programs]);

  const renderWorldNode = (node: WorldObject) => {
    const name = node.metadata?.name || node.metadata?.agency_name || node.id;
    const description = node.metadata?.function || node.metadata?.category || node.domain || "";
    const website = node.metadata?.website || node.metadata?.contact;
    const contact = node.metadata?.contact;

    return (
      <div key={node.id} style={{
        padding: "10px 12px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: fontSans, fontSize: 13, fontWeight: 500, color: rd.cream, marginBottom: 2 }}>
            {name}
          </p>
          <p style={{ fontFamily: fontSans, fontSize: 11, color: rd.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {node.jurisdiction !== "unknown" && (
              <span style={{ color: rd.green, marginRight: 6 }}>{node.jurisdiction}</span>
            )}
            {description}
          </p>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {contact && typeof contact === "string" && contact.match(/\d{3}/) && (
            <a
              href={`tel:${contact.replace(/[^0-9]/g, "")}`}
              style={{
                fontFamily: fontMono, fontSize: 10, color: rd.green,
                background: `${rd.green}12`, padding: "3px 8px", borderRadius: 100,
                textDecoration: "none", display: "flex", alignItems: "center", gap: 4,
              }}
            >
              <Phone size={10} /> Call
            </a>
          )}
          {website && typeof website === "string" && website.startsWith("http") && (
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontFamily: fontMono, fontSize: 10, color: rd.cyan,
                background: `${rd.cyan}12`, padding: "3px 8px", borderRadius: 100,
                textDecoration: "none", display: "flex", alignItems: "center", gap: 4,
              }}
            >
              <ExternalLink size={10} /> Visit
            </a>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen" style={{ background: rd.bg, fontFamily: fontSans }}>
      {/* ── Header ── */}
      <header style={{
        padding: "14px 24px",
        borderBottom: `1px solid ${rd.cardBorder}`,
        background: "rgba(12,14,20,0.9)",
        backdropFilter: "blur(12px)",
        position: "sticky",
        top: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button onClick={() => navigate("/lighthouse")} style={{
            background: "none", border: "none", cursor: "pointer",
            color: rd.muted, display: "flex", alignItems: "center", gap: 4,
            fontFamily: fontMono, fontSize: 11,
          }}>
            <ArrowLeft size={14} /> Lighthouse
          </button>
          <div style={{ width: 1, height: 20, background: rd.cardBorder }} />
          <Globe size={16} color={rd.green} />
          <span style={{ fontFamily: fontSerif, fontSize: 18, fontWeight: 600, color: rd.cream }}>
            Resource Directory
          </span>
        </div>
        {/* Jurisdiction filter */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Filter size={12} color={rd.muted} />
          <select
            value={jurisdictionFilter || ""}
            onChange={(e) => setJurisdictionFilter(e.target.value || null)}
            style={{
              background: "rgba(255,255,255,0.05)",
              border: `1px solid ${rd.cardBorder}`,
              borderRadius: 6,
              padding: "4px 8px",
              fontFamily: fontMono,
              fontSize: 11,
              color: rd.cream,
              cursor: "pointer",
            }}
          >
            <option value="">All States</option>
            {jurisdictions.map(j => (
              <option key={j.id} value={j.metadata?.abbreviation || j.jurisdiction}>
                {j.metadata?.name || j.jurisdiction}
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* ── Intro ── */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px 16px" }}>
        <p style={{ fontFamily: fontSerif, fontSize: 22, color: "#86efac", fontWeight: 500, lineHeight: 1.4, marginBottom: 8 }}>
          Where you find help.
        </p>
        <p style={{ fontFamily: fontSans, fontSize: 14, color: rd.muted, lineHeight: 1.6, maxWidth: 600 }}>
          Legal aid, government benefits, crisis hotlines, and community resources.
          Everything is free or low-cost. No login required to browse.
        </p>
        {!isLoading && !error && (
          <p style={{ fontFamily: fontMono, fontSize: 11, color: rd.muted, marginTop: 8 }}>
            {programs.length} programs · {agencies.length} agencies
            {jurisdictionFilter && ` · filtered: ${jurisdictionFilter}`}
          </p>
        )}
      </div>

      {/* ── Loading State ── */}
      {isLoading && (
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px", textAlign: "center" }}>
          <Loader2 size={24} style={{ animation: "spin 1s linear infinite", margin: "0 auto", color: rd.green }} />
          <p style={{ fontFamily: fontSans, fontSize: 14, color: rd.muted, marginTop: 12 }}>
            Loading resources...
          </p>
        </div>
      )}

      {/* ── Error State ── */}
      {error && (
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
          <div style={{
            background: `${rd.red}12`,
            border: `1px solid ${rd.red}30`,
            borderRadius: 10,
            padding: 16,
          }}>
            <p style={{ fontFamily: fontSans, fontSize: 14, color: rd.red }}>
              Error loading resources. Please try again later.
            </p>
          </div>
        </div>
      )}

      {/* ── Category Grid ── */}
      {!isLoading && !error && (
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "16px 24px 80px" }}>
          {CATEGORY_CONFIG.map((cat) => {
            const resources = getResourcesForCategory(cat.id);
            const totalResources = resources.length;

            return (
              <div key={cat.id} style={{ marginBottom: 12 }}>
                <button
                  onClick={() => {
                    if (cat.internalHref) {
                      navigate(cat.internalHref);
                    } else {
                      setExpanded(expanded === cat.id ? null : cat.id);
                    }
                  }}
                  style={{
                    width: "100%",
                    background: rd.cardBg,
                    border: `1px solid ${rd.cardBorder}`,
                    borderRadius: expanded === cat.id ? "10px 10px 0 0" : 10,
                    padding: "16px 20px",
                    cursor: "pointer",
                    textAlign: "left" as const,
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    transition: "all 0.2s",
                  }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                    background: `${cat.color}10`, border: `1px solid ${cat.color}20`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <cat.icon size={20} color={cat.color} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontFamily: fontSans, fontSize: 15, fontWeight: 600, color: rd.cream, marginBottom: 2 }}>
                      {cat.title}
                    </h3>
                    <p style={{ fontFamily: fontSans, fontSize: 12, color: rd.muted, lineHeight: 1.4 }}>
                      {cat.description}
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                    {cat.internalHref ? (
                      <ArrowRight size={16} color={cat.color} />
                    ) : (
                      <span style={{
                        fontFamily: fontMono, fontSize: 10, color: rd.muted,
                        background: "rgba(255,255,255,0.04)", padding: "2px 8px", borderRadius: 100,
                      }}>
                        {totalResources} resources
                      </span>
                    )}
                    {!cat.internalHref && (
                      <ChevronRight
                        size={14}
                        color={rd.muted}
                        style={{
                          transform: expanded === cat.id ? "rotate(90deg)" : "none",
                          transition: "transform 0.2s",
                        }}
                      />
                    )}
                  </div>
                </button>
                {/* Expanded Resources */}
                {expanded === cat.id && (
                  <div style={{
                    background: "rgba(255,255,255,0.01)",
                    border: `1px solid ${rd.cardBorder}`,
                    borderTop: "none",
                    borderRadius: "0 0 10px 10px",
                    padding: "8px 12px",
                    maxHeight: 400,
                    overflowY: "auto",
                  }}>
                    {resources.map((node, i) => (
                      <div key={node.id} style={{ borderBottom: i < resources.length - 1 ? `1px solid rgba(255,255,255,0.04)` : "none" }}>
                        {renderWorldNode(node)}
                      </div>
                    ))}
                    {totalResources === 0 && (
                      <div style={{ padding: "16px 12px", textAlign: "center" }}>
                        <p style={{ fontFamily: fontSans, fontSize: 12, color: rd.muted }}>
                          No resources available in this category yet.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Uncategorized programs */}
          {uncategorizedPrograms.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <button
                onClick={() => setExpanded(expanded === "other" ? null : "other")}
                style={{
                  width: "100%",
                  background: rd.cardBg,
                  border: `1px solid ${rd.cardBorder}`,
                  borderRadius: expanded === "other" ? "10px 10px 0 0" : 10,
                  padding: "16px 20px",
                  cursor: "pointer",
                  textAlign: "left" as const,
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  transition: "all 0.2s",
                }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  background: `${rd.muted}10`, border: `1px solid ${rd.muted}20`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <FileText size={20} color={rd.muted} />
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontFamily: fontSans, fontSize: 15, fontWeight: 600, color: rd.cream, marginBottom: 2 }}>
                    All Other Programs
                  </h3>
                  <p style={{ fontFamily: fontSans, fontSize: 12, color: rd.muted, lineHeight: 1.4 }}>
                    Additional programs and services across all jurisdictions.
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                  <span style={{
                    fontFamily: fontMono, fontSize: 10, color: rd.muted,
                    background: "rgba(255,255,255,0.04)", padding: "2px 8px", borderRadius: 100,
                  }}>
                    {uncategorizedPrograms.length} resources
                  </span>
                  <ChevronRight
                    size={14}
                    color={rd.muted}
                    style={{
                      transform: expanded === "other" ? "rotate(90deg)" : "none",
                      transition: "transform 0.2s",
                    }}
                  />
                </div>
              </button>
              {expanded === "other" && (
                <div style={{
                  background: "rgba(255,255,255,0.01)",
                  border: `1px solid ${rd.cardBorder}`,
                  borderTop: "none",
                  borderRadius: "0 0 10px 10px",
                  padding: "8px 12px",
                  maxHeight: 400,
                  overflowY: "auto",
                }}>
                  {uncategorizedPrograms.map((node, i) => (
                    <div key={node.id} style={{ borderBottom: i < uncategorizedPrograms.length - 1 ? `1px solid rgba(255,255,255,0.04)` : "none" }}>
                      {renderWorldNode(node)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
