import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Scale, BookOpen, Users, Shield, Search, MapPin, Eye,
  Landmark, FileText, ArrowRight, ChevronRight, ExternalLink,
  Filter, Loader2, Building2, Globe, AlertTriangle, Gavel,
  GitCompare, ScrollText, ChevronDown, ChevronUp, Link2,
  Plus, Send, X, Clock, CheckCircle2, XCircle, MessageSquare, Radio,
} from "lucide-react";
import { toast } from "sonner";
import { VoiceReadout } from "@/components/VoiceReadout";

/* ═══════════════════════════════════════════════════════════════════════
   THE DOCKET ROOM — Structural Legislative Analysis
   Core Principle: Reveal structure. Interpret nothing. Judge nothing.
   Persuade no one.
   ═══════════════════════════════════════════════════════════════════════ */

// ── Design tokens ─────────────────────────────────────────────────────
const dk = {
  bg: "#0f1114",
  bgGrad: "radial-gradient(ellipse at 50% 0%, rgba(56,100,160,0.06) 0%, rgba(15,17,20,0) 70%)",
  slate: "#1a1e24",
  slateMid: "#232830",
  slateLight: "#2d333b",
  paper: "#e8ecf0",
  cream: "#d0d7de",
  ink: "#0f1114",
  muted: "#7d8590",
  rule: "#30363d",
  steel: "#4a8cc7",
  steelSoft: "rgba(74,140,199,0.12)",
  steelBorder: "rgba(74,140,199,0.20)",
  steelBright: "#58a6ff",
  copper: "#d29922",
  copperSoft: "rgba(210,153,34,0.12)",
  green: "#3fb950",
  red: "#f85149",
  amber: "#d29922",
  teal: "#39d2c0",
  purple: "#a371f7",
  cardBg: "rgba(26,30,36,0.80)",
  cardBorder: "rgba(74,140,199,0.10)",
  sectionBg: "rgba(26,30,36,0.50)",
};

const fontSerif = "'Cormorant Garamond', serif";
const fontMono = "'IBM Plex Mono', monospace";
const fontSans = "'Inter', system-ui, sans-serif";

const DOCKET_ROOM_STRATEGY = [
  {
    label: "State Coverage",
    text: "Full national coverage — all 50 states plus Washington D.C. LegiScan's unified schema makes this practical since no per-state custom integration is required. Coverage will be rolled out in waves (Pacific Northwest and high-priority states first) but the architecture is designed for all 52 LegiScan jurisdictions from the start.",
  },
  {
    label: "Bill Volume",
    text: "Topic-vertical per state, not exhaustive. We pull the top 50–100 most recently active bills per state per session refresh cycle using getMasterList (which is a single query per state regardless of session size). At 50 states × 100 bills = ~5,000 bills in active cache at any time. getBill detail is only fetched on explicit user click-through, never speculatively bulk-fetched.",
  },
  {
    label: "Query Strategy",
    text: "Server-side caching in Supabase (PostgreSQL) eliminates redundant API calls. The math on the 30,000/month free tier:\ngetSessionList: 50 states × 1 call = 50 queries (one-time per deploy, cached permanently until session changes)\ngetMasterList: 50 states × ~3 refreshes/day × 30 days = 4,500 queries/month\ngetBill detail: estimated 10–20 user-driven lookups/day × 30 days = 300–600 queries/month\nTotal estimated: ~5,100–5,150 queries/month — well within the 30,000 free tier\nNo speculative bulk bill-detail fetching. All getMasterList results are cached and served from the database. If usage grows, we will upgrade to a paid DataSet plan (which actually reduces API dependency by replacing polling with bulk downloads).",
  },
];

// ── Section label map ────────────────────────────────────────────────
const SECTION_ICONS: Record<string, any> = {
  summary: BookOpen,
  actors: Users,
  impacts: Shield,
  implementation: Building2,
  loopholes: AlertTriangle,
  comparative: GitCompare,
  sources: Link2,
};

const SECTION_LABELS: Record<string, string> = {
  summary: "Plain-Language Summary",
  actors: "Actor Ledger",
  impacts: "Impact Grid",
  implementation: "Implementation Dock",
  loopholes: "Loophole Lantern",
  comparative: "Comparative Bay",
  sources: "Source Ledger",
};

const ACTOR_TYPE_LABELS: Record<string, string> = {
  sponsor: "Sponsor",
  cosponsor: "Co-Sponsor",
  committee: "Committee",
  implementing_agency: "Implementing Agency",
  regulatory_body: "Regulatory Body",
  lobbyist_org: "Lobbyist / Industry Group",
  advocacy_group: "Advocacy Group",
  opposition_group: "Opposition Group",
  executive_signatory: "Executive Signatory",
  judicial_body: "Judicial Body",
};

const IMPACT_CAT_LABELS: Record<string, string> = {
  population: "Population",
  industry: "Industry",
  government_agency: "Government Agency",
  geographic: "Geographic",
};

const JURISDICTION_LEVEL_LABELS: Record<string, string> = {
  federal: "Federal",
  state: "State",
  county: "County",
  city: "City / Municipal",
  tribal: "Tribal",
};

const LAW_TYPE_LABELS: Record<string, string> = {
  statute: "Statute",
  ordinance: "Ordinance",
  regulation: "Regulation",
  executive_order: "Executive Order",
  ballot_measure: "Ballot Measure",
  proposed_bill: "Proposed Bill",
  constitutional_amendment: "Constitutional Amendment",
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  enacted: { label: "Enacted", color: dk.green },
  proposed: { label: "Proposed", color: dk.amber },
  repealed: { label: "Repealed", color: dk.red },
  amended: { label: "Amended", color: dk.steelBright },
  under_review: { label: "Under Review", color: dk.purple },
};

// ── Docket List View ─────────────────────────────────────────────────

// ── Submit a Law Modal ──────────────────────────────────────────────

function SubmitLawModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const [lawTitle, setLawTitle] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [jurisdictionLevel, setJurisdictionLevel] = useState<string>("federal");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [uploadedFile, setUploadedFile] = useState<{ url: string; fileName: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const maxSize = 16 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error("File too large. Maximum size is 16MB.");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const resp = await fetch("/api/docket/upload", {
        method: "POST",
        body: formData,
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || "Upload failed");
      }
      const data = await resp.json();
      setUploadedFile({ url: data.url, fileName: data.fileName });
      toast.success(`Uploaded: ${data.fileName}`);
    } catch (err: any) {
      toast.error(err.message || "File upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const utils = trpc.useUtils();
  const submitMut = trpc.docket.submissions.create.useMutation({
    onSuccess: () => {
      toast.success("Submission received. We'll review and analyze it.");
      setLawTitle(""); setJurisdiction(""); setJurisdictionLevel("federal");
      setReferenceUrl(""); setNotes(""); setUploadedFile(null);
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  if (!open) return null;

  const canSubmit = lawTitle.trim().length > 0 && jurisdiction.trim().length > 0;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "1rem",
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: dk.slate, border: `1px solid ${dk.rule}`,
          borderRadius: "12px", maxWidth: 560, width: "100%",
          maxHeight: "90vh", overflow: "auto",
        }}
      >
        {/* Modal header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "1.25rem 1.5rem", borderBottom: `1px solid ${dk.rule}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Send size={18} style={{ color: dk.steel }} />
            <h2 style={{ fontFamily: fontSerif, fontSize: "1.25rem", fontWeight: 600, color: dk.paper, margin: 0 }}>
              Submit a Law for Analysis
            </h2>
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", cursor: "pointer", color: dk.muted, padding: "0.25rem",
          }}>
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <p style={{ fontFamily: fontSans, fontSize: "0.85rem", color: dk.muted, lineHeight: 1.6, margin: 0 }}>
            Submit a law, ordinance, or proposal for structural analysis. Our team will review it and add it to the Docket Room.
          </p>

          {/* Law Title */}
          <div>
            <label style={{ fontFamily: fontMono, fontSize: "0.7rem", color: dk.muted, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: "0.35rem" }}>
              Law / Proposal Title *
            </label>
            <input
              value={lawTitle}
              onChange={e => setLawTitle(e.target.value)}
              placeholder="e.g., Seattle Tenant Relocation Assistance Ordinance"
              style={{
                width: "100%", padding: "0.6rem 0.75rem",
                background: dk.bg, border: `1px solid ${dk.rule}`, borderRadius: "6px",
                color: dk.paper, fontFamily: fontSans, fontSize: "0.9rem",
                outline: "none",
              }}
              onFocus={e => e.currentTarget.style.borderColor = dk.steel}
              onBlur={e => e.currentTarget.style.borderColor = dk.rule}
            />
          </div>

          {/* Jurisdiction */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <label style={{ fontFamily: fontMono, fontSize: "0.7rem", color: dk.muted, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: "0.35rem" }}>
                Jurisdiction *
              </label>
              <input
                value={jurisdiction}
                onChange={e => setJurisdiction(e.target.value)}
                placeholder="e.g., Washington, Federal"
                style={{
                  width: "100%", padding: "0.6rem 0.75rem",
                  background: dk.bg, border: `1px solid ${dk.rule}`, borderRadius: "6px",
                  color: dk.paper, fontFamily: fontSans, fontSize: "0.9rem",
                  outline: "none",
                }}
                onFocus={e => e.currentTarget.style.borderColor = dk.steel}
                onBlur={e => e.currentTarget.style.borderColor = dk.rule}
              />
            </div>
            <div>
              <label style={{ fontFamily: fontMono, fontSize: "0.7rem", color: dk.muted, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: "0.35rem" }}>
                Level *
              </label>
              <select
                value={jurisdictionLevel}
                onChange={e => setJurisdictionLevel(e.target.value)}
                style={{
                  width: "100%", padding: "0.6rem 0.75rem",
                  background: dk.bg, border: `1px solid ${dk.rule}`, borderRadius: "6px",
                  color: dk.paper, fontFamily: fontSans, fontSize: "0.9rem",
                  outline: "none", cursor: "pointer",
                }}
              >
                <option value="federal">Federal</option>
                <option value="state">State</option>
                <option value="county">County</option>
                <option value="city">City / Municipal</option>
                <option value="tribal">Tribal</option>
              </select>
            </div>
          </div>

          {/* Reference URL */}
          <div>
            <label style={{ fontFamily: fontMono, fontSize: "0.7rem", color: dk.muted, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: "0.35rem" }}>
              Reference URL (optional)
            </label>
            <input
              value={referenceUrl}
              onChange={e => setReferenceUrl(e.target.value)}
              placeholder="https://congress.gov/bill/..."
              style={{
                width: "100%", padding: "0.6rem 0.75rem",
                background: dk.bg, border: `1px solid ${dk.rule}`, borderRadius: "6px",
                color: dk.paper, fontFamily: fontSans, fontSize: "0.9rem",
                outline: "none",
              }}
              onFocus={e => e.currentTarget.style.borderColor = dk.steel}
              onBlur={e => e.currentTarget.style.borderColor = dk.rule}
            />
          </div>

          {/* File Upload */}
          <div>
            <label style={{ fontFamily: fontMono, fontSize: "0.7rem", color: dk.muted, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: "0.35rem" }}>
              Attach Document (optional)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt"
              onChange={handleFileSelect}
              style={{ display: "none" }}
            />
            {uploadedFile ? (
              <div style={{
                display: "flex", alignItems: "center", gap: "0.5rem",
                padding: "0.5rem 0.75rem",
                background: dk.bg, border: `1px solid ${dk.steelBorder}`, borderRadius: "6px",
              }}>
                <FileText size={14} style={{ color: dk.steel, flexShrink: 0 }} />
                <span style={{ fontFamily: fontSans, fontSize: "0.85rem", color: dk.paper, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {uploadedFile.fileName}
                </span>
                <button
                  onClick={() => setUploadedFile(null)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: dk.muted, padding: "0.15rem", flexShrink: 0 }}
                  title="Remove file"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                style={{
                  display: "flex", alignItems: "center", gap: "0.5rem",
                  width: "100%", padding: "0.6rem 0.75rem",
                  background: dk.bg, border: `1px dashed ${dk.rule}`, borderRadius: "6px",
                  color: dk.muted, fontFamily: fontSans, fontSize: "0.85rem",
                  cursor: uploading ? "not-allowed" : "pointer",
                  transition: "all 0.15s",
                }}
              >
                {uploading ? (
                  <><Loader2 size={14} className="animate-spin" /> Uploading...</>
                ) : (
                  <><Plus size={14} /> Upload PDF, DOCX, or TXT (max 16MB)</>
                )}
              </button>
            )}
          </div>

          {/* Notes */}
          <div>
            <label style={{ fontFamily: fontMono, fontSize: "0.7rem", color: dk.muted, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: "0.35rem" }}>
              Why does this matter? (optional)
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Context about why this law should be analyzed..."
              rows={3}
              style={{
                width: "100%", padding: "0.6rem 0.75rem",
                background: dk.bg, border: `1px solid ${dk.rule}`, borderRadius: "6px",
                color: dk.paper, fontFamily: fontSans, fontSize: "0.9rem",
                outline: "none", resize: "vertical",
              }}
              onFocus={e => e.currentTarget.style.borderColor = dk.steel}
              onBlur={e => e.currentTarget.style.borderColor = dk.rule}
            />
          </div>

          {/* Submit */}
          <button
            onClick={() => {
              if (!canSubmit) return;
              submitMut.mutate({
                lawTitle: lawTitle.trim(),
                jurisdiction: jurisdiction.trim(),
                jurisdictionLevel: jurisdictionLevel as any,
                referenceUrl: referenceUrl.trim() || undefined,
                fileUrl: uploadedFile?.url || undefined,
                fileName: uploadedFile?.fileName || undefined,
                notes: notes.trim() || undefined,
              });
            }}
            disabled={!canSubmit || submitMut.isPending}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
              padding: "0.7rem 1.5rem",
              background: canSubmit ? dk.steel : dk.slateLight,
              color: canSubmit ? "#fff" : dk.muted,
              border: "none", borderRadius: "6px",
              fontFamily: fontMono, fontSize: "0.8rem",
              cursor: canSubmit ? "pointer" : "not-allowed",
              transition: "all 0.15s",
              opacity: submitMut.isPending ? 0.7 : 1,
            }}
          >
            {submitMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {submitMut.isPending ? "Submitting..." : "Submit for Analysis"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── My Submissions Panel ────────────────────────────────────────────

function MySubmissions() {
  const { data: submissions, isLoading } = trpc.docket.submissions.mine.useQuery();

  if (isLoading) return null;
  if (!submissions || submissions.length === 0) return null;

  const statusIcon = (s: string) => {
    switch (s) {
      case "pending": return <Clock size={13} style={{ color: dk.amber }} />;
      case "in_review": return <Eye size={13} style={{ color: dk.steelBright }} />;
      case "published": return <CheckCircle2 size={13} style={{ color: dk.green }} />;
      case "rejected": return <XCircle size={13} style={{ color: dk.red }} />;
      default: return <Clock size={13} style={{ color: dk.muted }} />;
    }
  };

  const statusLabel = (s: string) => {
    switch (s) {
      case "pending": return "Pending Review";
      case "in_review": return "Under Review";
      case "published": return "Published";
      case "rejected": return "Not Added";
      default: return s;
    }
  };

  return (
    <div style={{
      background: dk.cardBg, border: `1px solid ${dk.cardBorder}`,
      borderRadius: "8px", padding: "1rem 1.25rem", marginBottom: "1.5rem",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <MessageSquare size={14} style={{ color: dk.steel }} />
        <span style={{ fontFamily: fontMono, fontSize: "0.72rem", color: dk.steel, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Your Submissions ({submissions.length})
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {submissions.map((sub: any) => (
          <div key={sub.id} style={{
            display: "flex", alignItems: "center", gap: "0.75rem",
            padding: "0.5rem 0.75rem",
            background: dk.slateMid, borderRadius: "6px",
          }}>
            {statusIcon(sub.status)}
            <span style={{ fontFamily: fontSans, fontSize: "0.85rem", color: dk.paper, flex: 1 }}>
              {sub.lawTitle}
            </span>
            <span style={{
              fontFamily: fontMono, fontSize: "0.65rem",
              color: sub.status === "published" ? dk.green : sub.status === "rejected" ? dk.red : dk.muted,
            }}>
              {statusLabel(sub.status)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Legistar Live Feed ──────────────────────────────────────────────

function LegistarLiveFeed({ keyword }: { keyword?: string }) {
  const { data, isLoading } = trpc.docket.legistarFeed.useQuery(
    { keyword, top: 6 },
    { refetchInterval: 5 * 60 * 1000 } // refresh every 5 minutes
  );
  const [collapsed, setCollapsed] = useState(false);

  const formatDate = (d: string | null) => {
    if (!d) return null;
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const statusColor = (status: string) => {
    if (status.toLowerCase().includes("passed") || status.toLowerCase().includes("adopted")) return dk.green;
    if (status.toLowerCase().includes("agenda") || status.toLowerCase().includes("ready")) return dk.copper;
    if (status.toLowerCase().includes("committee")) return dk.steel;
    return dk.muted;
  };

  return (
    <div style={{
      background: dk.sectionBg,
      border: `1px solid ${dk.steelBorder}`,
      borderRadius: "8px",
      overflow: "hidden",
      marginBottom: "1.5rem",
    }}>
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          display: "flex", alignItems: "center", gap: "0.75rem",
          width: "100%", padding: "0.85rem 1.25rem",
          background: "transparent", border: "none", cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{
          width: 28, height: 28, borderRadius: "6px",
          background: dk.steelSoft,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <Radio size={14} style={{ color: dk.steelBright }} />
        </div>
        <div style={{ flex: 1 }}>
          <span style={{
            fontFamily: fontMono, fontSize: "0.75rem",
            color: dk.steelBright, fontWeight: 600,
            letterSpacing: "0.04em", textTransform: "uppercase",
          }}>
            Seattle City Council — Live Legislative Feed
          </span>
          {data && !isLoading && (
            <span style={{ fontFamily: fontMono, fontSize: "0.68rem", color: dk.muted, marginLeft: "0.75rem" }}>
              {data.matters.length} recent matters
              {keyword && ` matching "${keyword}"`}
              {" · "}
              {new Date(data.fetchedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
        {collapsed ? <ChevronDown size={14} style={{ color: dk.muted }} /> : <ChevronUp size={14} style={{ color: dk.muted }} />}
      </button>

      {!collapsed && (
        <div style={{ borderTop: `1px solid ${dk.rule}`, padding: "0.75rem 1.25rem" }}>
          {isLoading ? (
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", padding: "0.5rem 0", color: dk.muted }}>
              <Loader2 size={14} className="animate-spin" />
              <span style={{ fontFamily: fontMono, fontSize: "0.75rem" }}>Fetching from Seattle Legistar...</span>
            </div>
          ) : data?.error ? (
            <p style={{ fontFamily: fontMono, fontSize: "0.75rem", color: dk.red, padding: "0.5rem 0" }}>
              ⚠ {data.error}
            </p>
          ) : data?.matters.length === 0 ? (
            <p style={{ fontFamily: fontMono, fontSize: "0.75rem", color: dk.muted, padding: "0.5rem 0" }}>
              No recent matters found{keyword ? ` for "${keyword}"` : ""}.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {data?.matters.map((m: any) => (
                <a
                  key={m.id}
                  href={m.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "flex", alignItems: "flex-start", gap: "0.75rem",
                    padding: "0.65rem 0.85rem",
                    background: dk.cardBg,
                    border: `1px solid ${dk.cardBorder}`,
                    borderRadius: "6px",
                    textDecoration: "none",
                    transition: "border-color 0.15s",
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = dk.steel}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = dk.cardBorder}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.2rem" }}>
                      <span style={{
                        fontFamily: fontMono, fontSize: "0.65rem",
                        padding: "0.1rem 0.4rem", borderRadius: "3px",
                        background: `${statusColor(m.status)}22`,
                        color: statusColor(m.status),
                        border: `1px solid ${statusColor(m.status)}44`,
                        flexShrink: 0,
                      }}>{m.status}</span>
                      <span style={{ fontFamily: fontMono, fontSize: "0.65rem", color: dk.muted }}>{m.file}</span>
                      <span style={{ fontFamily: fontMono, fontSize: "0.65rem", color: dk.muted }}>{m.type}</span>
                    </div>
                    <p style={{
                      fontFamily: fontSans, fontSize: "0.82rem", color: dk.cream,
                      margin: 0, lineHeight: 1.4,
                      overflow: "hidden", textOverflow: "ellipsis",
                      display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                    }}>{m.title}</p>
                    <div style={{ display: "flex", gap: "1rem", marginTop: "0.3rem", flexWrap: "wrap" }}>
                      <span style={{ fontFamily: fontMono, fontSize: "0.65rem", color: dk.muted }}>
                        <Building2 size={10} style={{ display: "inline", marginRight: "0.25rem" }} />
                        {m.body}
                      </span>
                      {m.introDate && (
                        <span style={{ fontFamily: fontMono, fontSize: "0.65rem", color: dk.muted }}>
                          <Clock size={10} style={{ display: "inline", marginRight: "0.25rem" }} />
                          Intro: {formatDate(m.introDate)}
                        </span>
                      )}
                    </div>
                  </div>
                  <ExternalLink size={12} style={{ color: dk.muted, flexShrink: 0, marginTop: "0.25rem" }} />
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Docket List View ─────────────────────────────────────────────────

function DocketList({ onSelect }: { onSelect: (id: number) => void }) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterLevel, setFilterLevel] = useState<string>("");
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const queryInput = useMemo(() => ({
    search: debouncedSearch || undefined,
    jurisdictionLevel: (filterLevel || undefined) as any,
  }), [debouncedSearch, filterLevel]);

  const { data: entries, isLoading } = trpc.docket.list.useQuery(queryInput);
  const { data: stats } = trpc.docket.stats.useQuery();

  return (
    <div style={{ minHeight: "100vh", background: dk.bg }}>
      {/* Header */}
      <div style={{
        background: dk.bgGrad,
        borderBottom: `1px solid ${dk.rule}`,
        padding: "3rem 0 2rem",
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
            <Gavel size={28} style={{ color: dk.steel }} />
            <h1 style={{
              fontFamily: fontSerif,
              fontSize: "2.25rem",
              fontWeight: 600,
              color: dk.paper,
              letterSpacing: "-0.02em",
              margin: 0,
            }}>
              The Docket Room
            </h1>
          </div>
          <p style={{
            fontFamily: fontSans,
            fontSize: "0.95rem",
            color: dk.muted,
            maxWidth: 600,
            lineHeight: 1.6,
            margin: "0.5rem 0 0",
          }}>
            Structural analysis of laws and proposals. Reveals mechanics, actors, and documented facts.
            <br />
            <span style={{ fontStyle: "italic", color: dk.steel, opacity: 0.7 }}>
              Reveal structure. Interpret nothing. Judge nothing. Persuade no one.
            </span>
          </p>

          <div style={{
            display: "grid",
            gap: "0.75rem",
            marginTop: "1.5rem",
            padding: "1rem",
            background: dk.sectionBg,
            border: `1px solid ${dk.steelBorder}`,
            borderRadius: "8px",
          }}>
            {DOCKET_ROOM_STRATEGY.map(item => (
              <div key={item.label}>
                <div style={{
                  fontFamily: fontMono,
                  fontSize: "0.72rem",
                  color: dk.steelBright,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  marginBottom: "0.25rem",
                }}>{item.label}</div>
                <p style={{
                  fontFamily: fontSans,
                  fontSize: "0.82rem",
                  color: dk.cream,
                  lineHeight: 1.55,
                  whiteSpace: "pre-line",
                  margin: 0,
                }}>{item.text}</p>
              </div>
            ))}
          </div>

          {/* Stats bar */}
          {stats && (
            <div style={{
              display: "flex", gap: "2rem", marginTop: "1.5rem",
              fontFamily: fontMono, fontSize: "0.8rem", color: dk.muted,
              flexWrap: "wrap",
            }}>
              <span><strong style={{ color: dk.paper }}>{stats.total}</strong> entries analyzed</span>
              {Object.entries(stats.byLevel || {}).map(([level, count]) => (
                <span key={level}>
                  <strong style={{ color: dk.steelBright }}>{count as number}</strong> {JURISDICTION_LEVEL_LABELS[level] || level}
                </span>
              ))}
            </div>
          )}

          {/* Search bar + Submit button */}
          <div style={{
            display: "flex", gap: "0.75rem", marginTop: "1.25rem",
            alignItems: "center",
          }}>
            <div style={{
              flex: 1, position: "relative",
            }}>
              <Search size={15} style={{
                position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)",
                color: dk.muted, pointerEvents: "none",
              }} />
              <input
                ref={searchRef}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search by title, jurisdiction, or keyword..."
                style={{
                  width: "100%", padding: "0.6rem 0.75rem 0.6rem 2.25rem",
                  background: dk.slate, border: `1px solid ${dk.rule}`, borderRadius: "6px",
                  color: dk.paper, fontFamily: fontSans, fontSize: "0.9rem",
                  outline: "none", transition: "border-color 0.15s",
                }}
                onFocus={e => e.currentTarget.style.borderColor = dk.steel}
                onBlur={e => e.currentTarget.style.borderColor = dk.rule}
              />
              {searchTerm && (
                <button
                  onClick={() => { setSearchTerm(""); searchRef.current?.focus(); }}
                  style={{
                    position: "absolute", right: "0.5rem", top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer", color: dk.muted,
                    padding: "0.2rem", display: "flex", alignItems: "center",
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              onClick={() => {
                if (!user) {
                  toast.info("Sign in to submit a law for analysis.");
                  window.location.href = getLoginUrl();
                  return;
                }
                setShowSubmitModal(true);
              }}
              style={{
                display: "flex", alignItems: "center", gap: "0.4rem",
                padding: "0.6rem 1rem",
                background: dk.steelSoft, border: `1px solid ${dk.steelBorder}`,
                borderRadius: "6px", cursor: "pointer",
                color: dk.steelBright, fontFamily: fontMono, fontSize: "0.8rem",
                whiteSpace: "nowrap", transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = dk.steel; e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={e => { e.currentTarget.style.background = dk.steelSoft; e.currentTarget.style.color = dk.steelBright; }}
            >
              <Plus size={14} />
              Submit a Law
            </button>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{
        maxWidth: 1100, margin: "0 auto", padding: "1rem 1.5rem",
        display: "flex", alignItems: "center", gap: "0.75rem",
        flexWrap: "wrap",
      }}>
        <Filter size={14} style={{ color: dk.muted }} />
        <span style={{ fontFamily: fontMono, fontSize: "0.75rem", color: dk.muted }}>Level:</span>
        {["", "federal", "state", "county", "city", "tribal"].map(level => (
          <button
            key={level}
            onClick={() => setFilterLevel(level)}
            style={{
              fontFamily: fontMono,
              fontSize: "0.75rem",
              padding: "0.3rem 0.75rem",
              borderRadius: "4px",
              border: `1px solid ${filterLevel === level ? dk.steel : dk.rule}`,
              background: filterLevel === level ? dk.steelSoft : "transparent",
              color: filterLevel === level ? dk.steelBright : dk.muted,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {level === "" ? "All" : JURISDICTION_LEVEL_LABELS[level] || level}
          </button>
        ))}
        {(debouncedSearch || filterLevel) && (
          <button
            onClick={() => { setSearchTerm(""); setFilterLevel(""); }}
            style={{
              fontFamily: fontMono, fontSize: "0.7rem",
              padding: "0.25rem 0.6rem", borderRadius: "4px",
              border: `1px solid ${dk.red}44`, background: `${dk.red}11`,
              color: dk.red, cursor: "pointer",
              marginLeft: "auto",
            }}
          >
            Clear all filters
          </button>
        )}
      </div>

      {/* My Submissions (if logged in) */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 1.5rem" }}>
        {user && <MySubmissions />}
      </div>

      {/* Seattle Legistar Live Feed */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 1.5rem 1.5rem" }}>
        <LegistarLiveFeed keyword={debouncedSearch || undefined} />
      </div>

      {/* Entry cards */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 1.5rem 3rem" }}>
        {isLoading ? (
          <div style={{ textAlign: "center", padding: "4rem 0", color: dk.muted }}>
            <Loader2 size={24} className="animate-spin" style={{ margin: "0 auto 1rem" }} />
            <p style={{ fontFamily: fontMono, fontSize: "0.85rem" }}>Loading docket entries...</p>
          </div>
        ) : !entries || entries.length === 0 ? (
          <div style={{ textAlign: "center", padding: "4rem 0", color: dk.muted }}>
            <Gavel size={32} style={{ margin: "0 auto 1rem", opacity: 0.3 }} />
            <p style={{ fontFamily: fontSans, fontSize: "0.95rem" }}>
              {debouncedSearch ? `No entries matching "${debouncedSearch}"` : "No entries found."}
            </p>
            {debouncedSearch && (
              <button
                onClick={() => setSearchTerm("")}
                style={{
                  fontFamily: fontMono, fontSize: "0.8rem",
                  padding: "0.4rem 1rem", borderRadius: "4px",
                  border: `1px solid ${dk.rule}`, background: dk.slateMid,
                  color: dk.muted, cursor: "pointer", marginTop: "0.5rem",
                }}
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {entries.map((entry: any) => {
              const statusInfo = STATUS_LABELS[entry.status] || { label: entry.status, color: dk.muted };
              return (
                <button
                  key={entry.id}
                  onClick={() => onSelect(entry.id)}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "1rem",
                    padding: "1.25rem 1.5rem",
                    background: dk.cardBg,
                    border: `1px solid ${dk.cardBorder}`,
                    borderRadius: "8px",
                    cursor: "pointer",
                    textAlign: "left",
                    width: "100%",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = dk.steel;
                    (e.currentTarget as HTMLElement).style.background = dk.slateMid;
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = dk.cardBorder;
                    (e.currentTarget as HTMLElement).style.background = dk.cardBg;
                  }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: "8px",
                    background: dk.steelSoft,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0, marginTop: "0.1rem",
                  }}>
                    <Scale size={18} style={{ color: dk.steelBright }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      <h3 style={{
                        fontFamily: fontSerif,
                        fontSize: "1.15rem",
                        fontWeight: 600,
                        color: dk.paper,
                        margin: 0,
                      }}>
                        {entry.title}
                      </h3>
                      <span style={{
                        fontFamily: fontMono,
                        fontSize: "0.65rem",
                        padding: "0.15rem 0.5rem",
                        borderRadius: "3px",
                        background: `${statusInfo.color}22`,
                        color: statusInfo.color,
                        border: `1px solid ${statusInfo.color}44`,
                      }}>
                        {statusInfo.label}
                      </span>
                    </div>
                    <div style={{
                      display: "flex", gap: "1rem", marginTop: "0.5rem",
                      fontFamily: fontMono, fontSize: "0.72rem", color: dk.muted,
                      flexWrap: "wrap",
                    }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                        <Globe size={11} />
                        {entry.jurisdiction}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                        <Landmark size={11} />
                        {JURISDICTION_LEVEL_LABELS[entry.jurisdictionLevel] || entry.jurisdictionLevel}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                        <ScrollText size={11} />
                        {LAW_TYPE_LABELS[entry.lawType] || entry.lawType}
                      </span>
                      {entry.dateEnacted && (
                        <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                          <Gavel size={11} />
                          Enacted {entry.dateEnacted}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={18} style={{ color: dk.muted, flexShrink: 0, marginTop: "0.5rem" }} />
                </button>
              );
            })}
          </div>
        )}
      </div>
      {/* Submit Law Modal */}
      <SubmitLawModal open={showSubmitModal} onClose={() => setShowSubmitModal(false)} />
    </div>
  );
}

// ── Collapsible Section ──────────────────────────────────────────────

function Section({ id, children, defaultOpen = true }: { id: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = SECTION_ICONS[id] || BookOpen;
  const label = SECTION_LABELS[id] || id;

  return (
    <div style={{
      background: dk.sectionBg,
      border: `1px solid ${dk.cardBorder}`,
      borderRadius: "8px",
      overflow: "hidden",
      marginBottom: "1rem",
    }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex", alignItems: "center", gap: "0.75rem",
          width: "100%", padding: "1rem 1.25rem",
          background: "transparent", border: "none", cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{
          width: 32, height: 32, borderRadius: "6px",
          background: dk.steelSoft,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon size={16} style={{ color: dk.steelBright }} />
        </div>
        <span style={{
          fontFamily: fontSerif,
          fontSize: "1.1rem",
          fontWeight: 600,
          color: dk.paper,
          flex: 1,
        }}>
          {label}
        </span>
        {open ? <ChevronUp size={16} style={{ color: dk.muted }} /> : <ChevronDown size={16} style={{ color: dk.muted }} />}
      </button>
      {open && (
        <div style={{ padding: "0 1.25rem 1.25rem", borderTop: `1px solid ${dk.rule}` }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── Docket Detail View ───────────────────────────────────────────────

function DocketDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const [, navigateTo] = useLocation();
  const { data, isLoading } = trpc.docket.getFullAnalysis.useQuery({ id });

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", background: dk.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={24} className="animate-spin" style={{ color: dk.steel }} />
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ minHeight: "100vh", background: dk.bg, padding: "4rem", textAlign: "center", color: dk.muted }}>
        Entry not found.
      </div>
    );
  }

  const { entry, actors, impacts, sources } = data;
  const statusInfo = STATUS_LABELS[entry.status] || { label: entry.status, color: dk.muted };

  // Group actors by type
  const actorsByType: Record<string, typeof actors> = {};
  for (const a of actors) {
    const t = a.actorType;
    if (!actorsByType[t]) actorsByType[t] = [];
    actorsByType[t].push(a);
  }

  // Group impacts by category
  const impactsByCat: Record<string, typeof impacts> = {};
  for (const i of impacts) {
    const c = i.impactCategory;
    if (!impactsByCat[c]) impactsByCat[c] = [];
    impactsByCat[c].push(i);
  }

  return (
    <div style={{ minHeight: "100vh", background: dk.bg }}>
      {/* Header */}
      <div style={{
        background: dk.bgGrad,
        borderBottom: `1px solid ${dk.rule}`,
        padding: "2rem 0 2rem",
      }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 1.5rem" }}>
          <button
            onClick={onBack}
            style={{
              fontFamily: fontMono, fontSize: "0.75rem", color: dk.steel,
              background: "transparent", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", gap: "0.3rem",
              marginBottom: "1rem", padding: 0,
            }}
          >
            <ArrowRight size={12} style={{ transform: "rotate(180deg)" }} />
            Back to Docket Room
          </button>

          <h1 style={{
            fontFamily: fontSerif,
            fontSize: "1.85rem",
            fontWeight: 600,
            color: dk.paper,
            letterSpacing: "-0.02em",
            margin: "0 0 0.75rem",
            lineHeight: 1.3,
          }}>
            {entry.title}
          </h1>

          <div style={{
            display: "flex", gap: "0.75rem", flexWrap: "wrap",
            fontFamily: fontMono, fontSize: "0.72rem",
          }}>
            <span style={{
              padding: "0.2rem 0.6rem", borderRadius: "3px",
              background: `${statusInfo.color}22`, color: statusInfo.color,
              border: `1px solid ${statusInfo.color}44`,
            }}>
              {statusInfo.label}
            </span>
            <span style={{
              padding: "0.2rem 0.6rem", borderRadius: "3px",
              background: dk.steelSoft, color: dk.steelBright,
              border: `1px solid ${dk.steelBorder}`,
            }}>
              {JURISDICTION_LEVEL_LABELS[entry.jurisdictionLevel] || entry.jurisdictionLevel}
            </span>
            <span style={{
              padding: "0.2rem 0.6rem", borderRadius: "3px",
              background: dk.steelSoft, color: dk.cream,
              border: `1px solid ${dk.rule}`,
            }}>
              {entry.jurisdiction}
            </span>
            <span style={{
              padding: "0.2rem 0.6rem", borderRadius: "3px",
              background: dk.copperSoft, color: dk.copper,
              border: `1px solid rgba(210,153,34,0.25)`,
            }}>
              {LAW_TYPE_LABELS[entry.lawType] || entry.lawType}
            </span>
          </div>

          {/* Date row */}
          <div style={{
            display: "flex", gap: "1.5rem", marginTop: "0.75rem",
            fontFamily: fontMono, fontSize: "0.72rem", color: dk.muted,
          }}>
            {entry.dateIntroduced && <span>Introduced: {entry.dateIntroduced}</span>}
            {entry.dateEnacted && <span>Enacted: {entry.dateEnacted}</span>}
            {entry.dateEffective && <span>Effective: {entry.dateEffective}</span>}
          </div>

          {/* Voice Readout */}
          {(entry.summary || entry.title) && (
            <div style={{ marginTop: "1rem" }}>
              <VoiceReadout
                text={[
                  `${entry.title}.`,
                  entry.summary ? `Summary: ${entry.summary}` : "",
                  (entry.keyChanges as string[] | null)?.length
                    ? `Key changes: ${(entry.keyChanges as string[]).join(". ")}`
                    : "",
                ].filter(Boolean).join(" ")}
                label="Read this entry aloud"
                className="text-xs"
              />
            </div>
          )}

          {/* LumenSend Action Buttons */}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "1rem" }}>
            <button
              onClick={() => navigateTo(`/lumensend?type=inquiry&context=docket_entry&contextId=${entry.id}&state=${entry.jurisdiction || ''}`)}
              style={{
                display: "inline-flex", alignItems: "center", gap: "0.4rem",
                fontFamily: fontMono, fontSize: "0.72rem",
                padding: "0.35rem 0.75rem", borderRadius: "4px",
                background: "rgba(210,153,34,0.12)", color: dk.copper,
                border: `1px solid rgba(210,153,34,0.3)`,
                cursor: "pointer", transition: "all 0.15s",
              }}
              onMouseEnter={e => { (e.target as HTMLElement).style.background = "rgba(210,153,34,0.22)"; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.background = "rgba(210,153,34,0.12)"; }}
            >
              <Send size={11} />
              Write to Legislator
            </button>
            <button
              onClick={() => navigateTo(`/lumensend?type=complaint&context=docket_entry&contextId=${entry.id}&state=${entry.jurisdiction || ''}`)}
              style={{
                display: "inline-flex", alignItems: "center", gap: "0.4rem",
                fontFamily: fontMono, fontSize: "0.72rem",
                padding: "0.35rem 0.75rem", borderRadius: "4px",
                background: dk.steelSoft, color: dk.steelBright,
                border: `1px solid ${dk.steelBorder}`,
                cursor: "pointer", transition: "all 0.15s",
              }}
              onMouseEnter={e => { (e.target as HTMLElement).style.background = dk.steelBorder; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.background = dk.steelSoft; }}
            >
              <Send size={11} />
              File Public Comment
            </button>
          </div>

          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
            {entry.primarySourceUrl && (
              <a
                href={entry.primarySourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.3rem",
                  fontFamily: fontMono, fontSize: "0.72rem", color: dk.steel,
                  textDecoration: "none",
                }}
              >
                <ExternalLink size={11} />
                Primary Source
              </a>
            )}
            {entry.sourceDocumentUrl && (
              <a
                href={entry.sourceDocumentUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.3rem",
                  fontFamily: fontMono, fontSize: "0.72rem", color: dk.copper,
                  textDecoration: "none",
                }}
              >
                <FileText size={11} />
                {entry.sourceDocumentName || "Source Document"}
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Sections */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "1.5rem" }}>

        {/* 1. Plain-Language Summary */}
        <Section id="summary" defaultOpen={true}>
          <div style={{ paddingTop: "1rem" }}>
            {entry.summary && (
              <p style={{
                fontFamily: fontSans, fontSize: "0.92rem", color: dk.cream,
                lineHeight: 1.75, margin: "0 0 1rem",
                whiteSpace: "pre-wrap",
              }}>
                {entry.summary}
              </p>
            )}
            {(entry.keyChanges as string[] | null)?.length ? (
              <div>
                <h4 style={{
                  fontFamily: fontMono, fontSize: "0.75rem", color: dk.muted,
                  textTransform: "uppercase", letterSpacing: "0.05em",
                  margin: "1rem 0 0.5rem",
                }}>
                  Key Changes
                </h4>
                <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
                  {(entry.keyChanges as string[]).map((change, i) => (
                    <li key={i} style={{
                      fontFamily: fontSans, fontSize: "0.88rem", color: dk.cream,
                      lineHeight: 1.65, marginBottom: "0.4rem",
                    }}>
                      {change}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </Section>

        {/* 2. Actor Ledger */}
        <Section id="actors" defaultOpen={true}>
          <div style={{ paddingTop: "1rem" }}>
            {Object.keys(actorsByType).length === 0 ? (
              <p style={{ fontFamily: fontMono, fontSize: "0.8rem", color: dk.muted, fontStyle: "italic" }}>
                No actors documented for this entry.
              </p>
            ) : (
              Object.entries(actorsByType).map(([type, typeActors]) => (
                <div key={type} style={{ marginBottom: "1.25rem" }}>
                  <h4 style={{
                    fontFamily: fontMono, fontSize: "0.72rem", color: dk.steel,
                    textTransform: "uppercase", letterSpacing: "0.05em",
                    margin: "0 0 0.5rem",
                    display: "flex", alignItems: "center", gap: "0.4rem",
                  }}>
                    <Users size={12} />
                    {ACTOR_TYPE_LABELS[type] || type}
                    <span style={{ color: dk.muted }}>({typeActors.length})</span>
                  </h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    {typeActors.map((actor: any) => (
                      <div key={actor.id} style={{
                        padding: "0.6rem 0.85rem",
                        background: dk.slate,
                        borderRadius: "6px",
                        border: `1px solid ${dk.rule}`,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                          <span style={{
                            fontFamily: fontSans, fontSize: "0.88rem", fontWeight: 500, color: dk.paper,
                          }}>
                            {actor.actorName}
                          </span>
                          {actor.affiliation && (
                            <span style={{
                              fontFamily: fontMono, fontSize: "0.68rem", color: dk.muted,
                              padding: "0.1rem 0.4rem", borderRadius: "3px",
                              background: "rgba(255,255,255,0.04)",
                            }}>
                              {actor.affiliation}
                            </span>
                          )}
                        </div>
                        {actor.role && (
                          <p style={{
                            fontFamily: fontSans, fontSize: "0.8rem", color: dk.muted,
                            margin: "0.25rem 0 0",
                          }}>
                            {actor.role}
                          </p>
                        )}
                        {actor.sourceUrl && (
                          <a
                            href={actor.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontFamily: fontMono, fontSize: "0.65rem", color: dk.steel,
                              textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.2rem",
                              marginTop: "0.2rem",
                            }}
                          >
                            <ExternalLink size={9} /> source
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </Section>

        {/* 3. Impact Grid */}
        <Section id="impacts" defaultOpen={true}>
          <div style={{ paddingTop: "1rem" }}>
            {Object.keys(impactsByCat).length === 0 ? (
              <p style={{ fontFamily: fontMono, fontSize: "0.8rem", color: dk.muted, fontStyle: "italic" }}>
                No impacts documented for this entry.
              </p>
            ) : (
              Object.entries(impactsByCat).map(([cat, catImpacts]) => (
                <div key={cat} style={{ marginBottom: "1.25rem" }}>
                  <h4 style={{
                    fontFamily: fontMono, fontSize: "0.72rem", color: dk.copper,
                    textTransform: "uppercase", letterSpacing: "0.05em",
                    margin: "0 0 0.5rem",
                    display: "flex", alignItems: "center", gap: "0.4rem",
                  }}>
                    <Shield size={12} />
                    {IMPACT_CAT_LABELS[cat] || cat}
                    <span style={{ color: dk.muted }}>({catImpacts.length})</span>
                  </h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    {catImpacts.map((impact: any) => (
                      <div key={impact.id} style={{
                        padding: "0.6rem 0.85rem",
                        background: dk.slate,
                        borderRadius: "6px",
                        border: `1px solid ${dk.rule}`,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                          <span style={{
                            fontFamily: fontSans, fontSize: "0.88rem", fontWeight: 500, color: dk.paper,
                          }}>
                            {impact.affectedEntity}
                          </span>
                          {impact.scope && (
                            <span style={{
                              fontFamily: fontMono, fontSize: "0.68rem", color: dk.teal,
                              padding: "0.1rem 0.4rem", borderRadius: "3px",
                              background: "rgba(57,210,192,0.08)",
                            }}>
                              {impact.scope}
                            </span>
                          )}
                        </div>
                        {impact.impactDescription && (
                          <p style={{
                            fontFamily: fontSans, fontSize: "0.82rem", color: dk.cream,
                            margin: "0.3rem 0 0", lineHeight: 1.6,
                          }}>
                            {impact.impactDescription}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </Section>

        {/* 4. Implementation Dock */}
        <Section id="implementation" defaultOpen={false}>
          <div style={{ paddingTop: "1rem" }}>
            <JsonArrayList label="Implementing Agencies" items={entry.implementationAgencies as string[] | null} icon={Building2} color={dk.green} />
            <JsonArrayList label="Administrative Steps" items={entry.adminSteps as string[] | null} icon={FileText} color={dk.steelBright} />
            <JsonArrayList label="Compliance Obligations" items={entry.complianceObligations as string[] | null} icon={Shield} color={dk.copper} />
            <JsonArrayList label="Rollout Timeline" items={entry.rolloutTimeline as string[] | null} icon={ScrollText} color={dk.teal} />
          </div>
        </Section>

        {/* 5. Loophole Lantern */}
        <Section id="loopholes" defaultOpen={false}>
          <div style={{ paddingTop: "1rem" }}>
            <JsonArrayList label="Structural Exemptions" items={entry.structuralExemptions as string[] | null} icon={AlertTriangle} color={dk.amber} />
            <JsonArrayList label="Enforcement Gaps" items={entry.enforcementGaps as string[] | null} icon={Eye} color={dk.red} />
            <JsonArrayList label="Reporting Gaps" items={entry.reportingGaps as string[] | null} icon={FileText} color={dk.red} />
            <JsonArrayList label="Delegated Authority / Carve-outs" items={entry.delegatedAuthority as string[] | null} icon={Gavel} color={dk.purple} />
          </div>
        </Section>

        {/* 6. Comparative Bay */}
        <Section id="comparative" defaultOpen={false}>
          <div style={{ paddingTop: "1rem" }}>
            {/* Similar Laws */}
            {(entry.similarLaws as any[] | null)?.length ? (
              <div style={{ marginBottom: "1.25rem" }}>
                <h4 style={{
                  fontFamily: fontMono, fontSize: "0.72rem", color: dk.teal,
                  textTransform: "uppercase", letterSpacing: "0.05em",
                  margin: "0 0 0.5rem",
                }}>
                  Similar Laws in Other Jurisdictions
                </h4>
                {(entry.similarLaws as any[]).map((law, i) => (
                  <div key={i} style={{
                    padding: "0.5rem 0.85rem", marginBottom: "0.4rem",
                    background: dk.slate, borderRadius: "6px", border: `1px solid ${dk.rule}`,
                  }}>
                    <span style={{ fontFamily: fontSans, fontSize: "0.85rem", fontWeight: 500, color: dk.paper }}>
                      {law.title}
                    </span>
                    <span style={{
                      fontFamily: fontMono, fontSize: "0.68rem", color: dk.muted,
                      marginLeft: "0.5rem",
                    }}>
                      ({law.jurisdiction})
                    </span>
                    {law.note && (
                      <p style={{ fontFamily: fontSans, fontSize: "0.78rem", color: dk.cream, margin: "0.2rem 0 0", lineHeight: 1.5 }}>
                        {law.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : null}

            {/* Historical Precedents */}
            {(entry.historicalPrecedents as any[] | null)?.length ? (
              <div style={{ marginBottom: "1.25rem" }}>
                <h4 style={{
                  fontFamily: fontMono, fontSize: "0.72rem", color: dk.purple,
                  textTransform: "uppercase", letterSpacing: "0.05em",
                  margin: "0 0 0.5rem",
                }}>
                  Historical Precedents
                </h4>
                {(entry.historicalPrecedents as any[]).map((p, i) => (
                  <div key={i} style={{
                    padding: "0.5rem 0.85rem", marginBottom: "0.4rem",
                    background: dk.slate, borderRadius: "6px", border: `1px solid ${dk.rule}`,
                  }}>
                    <span style={{ fontFamily: fontSans, fontSize: "0.85rem", fontWeight: 500, color: dk.paper }}>
                      {p.title}
                    </span>
                    <span style={{
                      fontFamily: fontMono, fontSize: "0.68rem", color: dk.muted,
                      marginLeft: "0.5rem",
                    }}>
                      ({p.year})
                    </span>
                    {p.note && (
                      <p style={{ fontFamily: fontSans, fontSize: "0.78rem", color: dk.cream, margin: "0.2rem 0 0", lineHeight: 1.5 }}>
                        {p.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : null}

            {/* Implementation Variations */}
            <JsonArrayList label="Implementation Variations" items={entry.implementationVariations as string[] | null} icon={GitCompare} color={dk.steelBright} />
          </div>
        </Section>

        {/* 7. Source Ledger */}
        <Section id="sources" defaultOpen={false}>
          <div style={{ paddingTop: "1rem" }}>
            {sources.length === 0 ? (
              <p style={{ fontFamily: fontMono, fontSize: "0.8rem", color: dk.muted, fontStyle: "italic" }}>
                No sources documented for this entry.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {sources.map((src: any) => (
                  <div key={src.id} style={{
                    padding: "0.6rem 0.85rem",
                    background: dk.slate,
                    borderRadius: "6px",
                    border: `1px solid ${dk.rule}`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      <span style={{
                        fontFamily: fontMono, fontSize: "0.65rem",
                        padding: "0.1rem 0.4rem", borderRadius: "3px",
                        background: dk.steelSoft, color: dk.steelBright,
                        textTransform: "uppercase",
                      }}>
                        {src.sourceType.replace(/_/g, " ")}
                      </span>
                      <span style={{
                        fontFamily: fontSans, fontSize: "0.85rem", fontWeight: 500, color: dk.paper,
                      }}>
                        {src.title}
                      </span>
                    </div>
                    {src.citation && (
                      <p style={{
                        fontFamily: fontMono, fontSize: "0.72rem", color: dk.muted,
                        margin: "0.2rem 0 0",
                      }}>
                        {src.citation}
                      </p>
                    )}
                    {src.url && (
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontFamily: fontMono, fontSize: "0.65rem", color: dk.steel,
                          textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.2rem",
                          marginTop: "0.2rem",
                        }}
                      >
                        <ExternalLink size={9} /> {src.url.length > 60 ? src.url.substring(0, 60) + "..." : src.url}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Section>

        {/* Principle reminder footer */}
        <div style={{
          textAlign: "center", padding: "2rem 0 1rem",
          fontFamily: fontMono, fontSize: "0.72rem", color: dk.muted,
          fontStyle: "italic", opacity: 0.6,
        }}>
          Reveal structure. Interpret nothing. Judge nothing. Persuade no one.
        </div>
      </div>
    </div>
  );
}

// ── Helper: render a JSON string[] as a labeled list ─────────────────

function JsonArrayList({ label, items, icon: Icon, color }: {
  label: string;
  items: string[] | null;
  icon: any;
  color: string;
}) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <h4 style={{
        fontFamily: fontMono, fontSize: "0.72rem", color,
        textTransform: "uppercase", letterSpacing: "0.05em",
        margin: "0 0 0.5rem",
        display: "flex", alignItems: "center", gap: "0.4rem",
      }}>
        <Icon size={12} />
        {label}
      </h4>
      <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
        {items.map((item, i) => (
          <li key={i} style={{
            fontFamily: fontSans, fontSize: "0.85rem", color: dk.cream,
            lineHeight: 1.6, marginBottom: "0.3rem",
          }}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────

export default function DocketRoom() {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  if (selectedId !== null) {
    return <DocketDetail id={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return <DocketList onSelect={setSelectedId} />;
}
