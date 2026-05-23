/**
 * MapIntakePanel — Geographic entry point for the pipeline engine.
 *
 * Displayed as a bottom-right overlay on the Civic Map when the user
 * clicks "Start Intake From Map" in the discovery panel.
 *
 * Shows:
 * 1. Detected state and geographic context
 * 2. Suggested pipelines based on nearby resources and signals
 * 3. Nearest programs and oversight bodies
 * 4. Action to initialize a full intake session
 */
import { useState, useMemo } from "react";
import { useAuth } from "@/core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import {
  X, Loader2, Zap, Shield, Target, ArrowRight,
  Building2, MapPin, Phone, Globe, ChevronDown,
  ChevronUp, ExternalLink, AlertTriangle, Lock,
} from "lucide-react";
import { toast } from "sonner";

// ─── Design tokens (match CivicMap palette) ──────────────────────────
const lh = {
  bg: "#0a0806",
  paper: "#f5f0e8",
  gold: "#d4af37",
  goldSoft: "rgba(212,175,55,0.08)",
  goldBorder: "rgba(212,175,55,0.15)",
  muted: "#9a9080",
  cardBorder: "rgba(212,175,55,0.08)",
  teal: "#2dd4bf",
  coral: "#e07a5f",
  sage: "#6b8f71",
};
const fontSerif = "'Playfair Display', Georgia, serif";
const fontSans = "'Inter', system-ui, sans-serif";
const fontMono = "'JetBrains Mono', 'Fira Code', monospace";

const STATE_NAMES: Record<string, string> = {
  AZ: "Arizona", CA: "California", FL: "Florida", IL: "Illinois",
  MO: "Missouri", NY: "New York", OR: "Oregon", PA: "Pennsylvania",
  TX: "Texas", WA: "Washington",
};

// ─── Confidence indicator ────────────────────────────────────────────
function ConfidenceDot({ label }: { label: "high" | "medium" | "low" }) {
  const color = label === "high" ? "#22c55e" : label === "medium" ? "#eab308" : "#64748b";
  return (
    <span
      style={{
        display: "inline-block",
        width: 6, height: 6,
        borderRadius: "50%",
        background: color,
        marginRight: 4,
      }}
    />
  );
}

// ─── Props ───────────────────────────────────────────────────────────
interface MapIntakePanelProps {
  lat: number;
  lng: number;
  onClose: () => void;
  onNavigate: (path: string) => void;
  isAuthenticated: boolean;
}

export default function MapIntakePanel({
  lat,
  lng,
  onClose,
  onNavigate,
  isAuthenticated,
}: MapIntakePanelProps) {
  const [showAllPipelines, setShowAllPipelines] = useState(false);
  const [showPrograms, setShowPrograms] = useState(false);
  const [showOversight, setShowOversight] = useState(false);
  const [initiating, setInitiating] = useState(false);

  // Fetch pipeline suggestions for this location
  const queryInput = useMemo(() => ({ lat, lng, radiusKm: 50 }), [lat, lng]);
  const { data: suggestions, isLoading: suggestionsLoading } =
    trpc.lighthouse.mapIntake.suggestPipelines.useQuery(queryInput, {
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    });

  // Fetch nearby resources for programs/oversight display
  const nearbyData = trpc.lighthouse.map.nearby.useQuery(queryInput, {
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  // Init from map mutation
  const initFromMap = trpc.lighthouse.mapIntake.initFromMap.useMutation();

  const detectedState = suggestions?.detectedState;
  const pipelines = suggestions?.suggestions ?? [];
  const visiblePipelines = showAllPipelines ? pipelines : pipelines.slice(0, 4);

  // Partition nearby resources into programs and oversight
  const programs = (nearbyData.data?.resources ?? []).filter(
    (r: any) => r.type !== "oversight"
  );
  const oversight = (nearbyData.data?.resources ?? []).filter(
    (r: any) => r.type === "oversight"
  );

  const handleStartIntake = async () => {
    if (!isAuthenticated) {
      toast.info("Please sign in to start an intake session");
      window.location.href = getLoginUrl();
      return;
    }
    setInitiating(true);
    try {
      const result = await initFromMap.mutateAsync({ lat, lng, radiusKm: 50 });
      toast.success("Intake session created");
      // Navigate to guided intake with the session context
      onNavigate(`/guided-intake?mapSession=${result.sessionId}&state=${detectedState ?? ""}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to initialize intake session");
    } finally {
      setInitiating(false);
    }
  };

  return (
    <div
      style={{
        position: "absolute",
        bottom: 20,
        right: 16,
        width: 360,
        maxHeight: "calc(100vh - 120px)",
        background: "rgba(15,12,8,0.97)",
        backdropFilter: "blur(16px)",
        border: `1px solid ${lh.goldBorder}`,
        borderRadius: 10,
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 16px",
          borderBottom: `1px solid ${lh.cardBorder}`,
          background: "rgba(212,175,55,0.04)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <Zap size={14} color={lh.gold} />
              <span
                style={{
                  fontFamily: fontMono, fontSize: 10,
                  letterSpacing: "0.12em", textTransform: "uppercase",
                  color: lh.gold,
                }}
              >
                Map-Based Intake
              </span>
            </div>
            {detectedState && (
              <div style={{ fontFamily: fontSans, fontSize: 13, color: lh.paper, fontWeight: 500 }}>
                {STATE_NAMES[detectedState] ?? detectedState}
              </div>
            )}
            <div style={{ fontFamily: fontMono, fontSize: 9, color: lh.muted, marginTop: 2 }}>
              {lat.toFixed(4)}, {lng.toFixed(4)}
              {suggestions && ` · ${suggestions.resourceCount} resources nearby`}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              color: lh.muted, padding: 4, flexShrink: 0,
            }}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {/* Loading state */}
        {suggestionsLoading && (
          <div style={{ padding: 24, textAlign: "center" }}>
            <Loader2 size={20} color={lh.gold} style={{ animation: "spin 1s linear infinite" }} />
            <p style={{ fontFamily: fontMono, fontSize: 10, color: lh.muted, marginTop: 8 }}>
              Analyzing geographic context...
            </p>
          </div>
        )}

        {/* Suggested Pipelines */}
        {!suggestionsLoading && pipelines.length > 0 && (
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${lh.cardBorder}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <Target size={12} color={lh.gold} />
              <span style={{ fontFamily: fontMono, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: lh.gold }}>
                Suggested Pipelines
              </span>
              <span style={{ fontFamily: fontMono, fontSize: 9, color: lh.muted }}>
                ({pipelines.length})
              </span>
            </div>

            {visiblePipelines.map((p, i) => (
              <div
                key={p.pipeline_id}
                style={{
                  padding: "8px 10px",
                  marginBottom: 6,
                  background: i === 0 ? "rgba(212,175,55,0.06)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${i === 0 ? lh.goldBorder : lh.cardBorder}`,
                  borderRadius: 6,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontFamily: fontSans, fontSize: 11, color: lh.paper, fontWeight: 500 }}>
                    {p.pipeline_id.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                  </span>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <ConfidenceDot label={p.confidence_label} />
                    <span style={{ fontFamily: fontMono, fontSize: 9, color: lh.muted }}>
                      {Math.round(p.confidence * 100)}%
                    </span>
                  </div>
                </div>
                <div style={{ fontFamily: fontMono, fontSize: 9, color: lh.muted, lineHeight: 1.5 }}>
                  {p.match_reasons.slice(0, 2).join(" · ")}
                </div>
              </div>
            ))}

            {pipelines.length > 4 && (
              <button
                onClick={() => setShowAllPipelines(!showAllPipelines)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                  width: "100%", padding: "6px 0",
                  fontFamily: fontMono, fontSize: 9, color: lh.gold,
                  background: "transparent", border: "none", cursor: "pointer",
                }}
              >
                {showAllPipelines ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                {showAllPipelines ? "Show fewer" : `Show ${pipelines.length - 4} more`}
              </button>
            )}
          </div>
        )}

        {/* Nearest Programs */}
        {programs.length > 0 && (
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${lh.cardBorder}` }}>
            <button
              onClick={() => setShowPrograms(!showPrograms)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                width: "100%", background: "transparent", border: "none", cursor: "pointer",
                padding: 0,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <MapPin size={12} color={lh.teal} />
                <span style={{ fontFamily: fontMono, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: lh.teal }}>
                  Nearest Programs
                </span>
                <span style={{ fontFamily: fontMono, fontSize: 9, color: lh.muted }}>
                  ({programs.length})
                </span>
              </div>
              {showPrograms ? <ChevronUp size={12} color={lh.muted} /> : <ChevronDown size={12} color={lh.muted} />}
            </button>

            {showPrograms && (
              <div style={{ marginTop: 8 }}>
                {programs.slice(0, 8).map((r: any, i: number) => (
                  <div
                    key={`prog-${i}`}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "6px 0",
                      borderBottom: i < Math.min(programs.length, 8) - 1 ? `1px solid ${lh.cardBorder}` : "none",
                    }}
                  >
                    <MapPin size={10} color={lh.teal} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: fontSans, fontSize: 11, color: lh.paper, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {r.name}
                      </div>
                      <div style={{ fontFamily: fontMono, fontSize: 9, color: lh.muted }}>
                        {r.stateCode} · {r.category || r.type}
                      </div>
                    </div>
                    {r.phone && (
                      <a href={`tel:${r.phone}`} style={{ color: lh.muted, flexShrink: 0 }} title={r.phone}>
                        <Phone size={10} />
                      </a>
                    )}
                    {r.website && (
                      <a href={r.website} target="_blank" rel="noopener noreferrer" style={{ color: lh.muted, flexShrink: 0 }} title="Website">
                        <Globe size={10} />
                      </a>
                    )}
                  </div>
                ))}
                {programs.length > 8 && (
                  <div style={{ fontFamily: fontMono, fontSize: 9, color: lh.muted, padding: "6px 0", textAlign: "center" }}>
                    +{programs.length - 8} more programs nearby
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Oversight Bodies */}
        {oversight.length > 0 && (
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${lh.cardBorder}` }}>
            <button
              onClick={() => setShowOversight(!showOversight)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                width: "100%", background: "transparent", border: "none", cursor: "pointer",
                padding: 0,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Shield size={12} color={lh.coral} />
                <span style={{ fontFamily: fontMono, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: lh.coral }}>
                  Oversight Bodies
                </span>
                <span style={{ fontFamily: fontMono, fontSize: 9, color: lh.muted }}>
                  ({oversight.length})
                </span>
              </div>
              {showOversight ? <ChevronUp size={12} color={lh.muted} /> : <ChevronDown size={12} color={lh.muted} />}
            </button>

            {showOversight && (
              <div style={{ marginTop: 8 }}>
                {oversight.slice(0, 6).map((r: any, i: number) => (
                  <div
                    key={`ov-${i}`}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "6px 0",
                      borderBottom: i < Math.min(oversight.length, 6) - 1 ? `1px solid ${lh.cardBorder}` : "none",
                    }}
                  >
                    <Building2 size={10} color={lh.coral} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: fontSans, fontSize: 11, color: lh.paper, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {r.name}
                      </div>
                      <div style={{ fontFamily: fontMono, fontSize: 9, color: lh.muted }}>
                        {r.stateCode} · {r.agency || r.category || "oversight"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Privacy notice */}
        <div style={{ padding: "10px 16px", display: "flex", alignItems: "flex-start", gap: 8 }}>
          <Lock size={10} color={lh.muted} style={{ flexShrink: 0, marginTop: 2 }} />
          <span style={{ fontFamily: fontMono, fontSize: 9, color: lh.muted, lineHeight: 1.5 }}>
            Pattern signals are aggregated. No individual case data is exposed.
          </span>
        </div>
      </div>

      {/* Footer action */}
      <div
        style={{
          padding: "12px 16px",
          borderTop: `1px solid ${lh.goldBorder}`,
          background: "rgba(212,175,55,0.03)",
          flexShrink: 0,
        }}
      >
        <button
          onClick={handleStartIntake}
          disabled={initiating || suggestionsLoading}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            width: "100%",
            fontFamily: fontMono, fontSize: 11, fontWeight: 600,
            color: initiating ? lh.muted : "#0a0806",
            background: initiating
              ? "rgba(212,175,55,0.2)"
              : `linear-gradient(135deg, ${lh.gold}, #c5a028)`,
            border: "none", borderRadius: 8,
            padding: "10px 16px", cursor: initiating ? "wait" : "pointer",
            letterSpacing: "0.05em", textTransform: "uppercase",
            transition: "all 0.15s ease",
            opacity: suggestionsLoading ? 0.5 : 1,
          }}
        >
          {initiating ? (
            <>
              <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
              Initializing Session...
            </>
          ) : (
            <>
              <Zap size={14} />
              Initialize Intake Session
              <ArrowRight size={14} />
            </>
          )}
        </button>
        {!isAuthenticated && (
          <div style={{ fontFamily: fontMono, fontSize: 9, color: lh.coral, marginTop: 6, textAlign: "center" }}>
            Sign in required to create intake sessions
          </div>
        )}
      </div>
    </div>
  );
}
