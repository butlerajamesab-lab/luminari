import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Phone, Globe, Mail, MapPin, Clock, Shield, ChevronDown, ChevronUp,
  ExternalLink, Building2, Scale, FileText, Heart, AlertTriangle,
  Lightbulb, ArrowRight, CheckCircle2, Info
} from "lucide-react";

// ─── Resource type icons and colors ───
const RESOURCE_TYPE_CONFIG: Record<string, { icon: typeof Building2; label: string; color: string; bg: string }> = {
  government_program: { icon: Building2, label: "Government Program", color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
  enforcement_path: { icon: Scale, label: "Filing Path", color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
  enforcement_record: { icon: FileText, label: "Enforcement Record", color: "text-purple-700", bg: "bg-purple-50 border-purple-200" },
  legal_aid: { icon: Scale, label: "Legal Aid", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  nonprofit: { icon: Heart, label: "Nonprofit", color: "text-rose-700", bg: "bg-rose-50 border-rose-200" },
  agency_authority: { icon: Shield, label: "Agency Authority", color: "text-slate-700", bg: "bg-slate-50 border-slate-200" },
  hotline: { icon: Phone, label: "Hotline", color: "text-red-700", bg: "bg-red-50 border-red-200" },
  online_tool: { icon: Globe, label: "Online Tool", color: "text-cyan-700", bg: "bg-cyan-50 border-cyan-200" },
};

const URGENCY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  crisis: { label: "Crisis", color: "text-red-700", bg: "bg-red-100 text-red-800" },
  urgent: { label: "Urgent", color: "text-amber-700", bg: "bg-amber-100 text-amber-800" },
  standard: { label: "Standard", color: "text-blue-700", bg: "bg-blue-100 text-blue-800" },
  informational: { label: "Info", color: "text-slate-700", bg: "bg-slate-100 text-slate-800" },
};

interface ResourceResult {
  id: number;
  name: string;
  description: string | null;
  resource_type: string;
  domain: string;
  urgency_level: string;
  state_code: string | null;
  phone: string | null;
  website: string | null;
  email: string | null;
  agency: string | null;
  category: string | null;
  eligibility_notes: string | null;
  apply_notes: string | null;
  score: number;
  match_reasons: string[];
  need_types: string[];
}

function ResourceCard({ resource, rank }: { resource: ResourceResult; rank: number }) {
  const [expanded, setExpanded] = useState(false);
  const typeConfig = RESOURCE_TYPE_CONFIG[resource.resource_type] || RESOURCE_TYPE_CONFIG.government_program;
  const urgencyConfig = URGENCY_CONFIG[resource.urgency_level] || URGENCY_CONFIG.standard;
  const TypeIcon = typeConfig.icon;

  const hasContactInfo = resource.phone || resource.website || resource.email;
  const scorePercent = Math.round(resource.score * 100);

  return (
    <div className={`border rounded-lg overflow-hidden transition-all duration-200 ${expanded ? "shadow-md" : "shadow-sm hover:shadow-md"} ${typeConfig.bg}`}>
      {/* Main row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-4 flex items-start gap-3"
      >
        {/* Rank badge */}
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-white border flex items-center justify-center text-sm font-bold text-slate-700">
          {rank}
        </div>

        {/* Icon */}
        <div className="flex-shrink-0 mt-0.5">
          <TypeIcon className={`w-5 h-5 ${typeConfig.color}`} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="font-semibold text-slate-900 text-sm leading-tight">
                {resource.name.replace(/^(FILE|DC|STATE):\s*/i, "")}
              </h4>
              {resource.agency && (
                <p className="text-xs text-slate-500 mt-0.5">{resource.agency}</p>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${urgencyConfig.bg} border-0`}>
                {urgencyConfig.label}
              </Badge>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-white">
                {scorePercent}%
              </Badge>
            </div>
          </div>

          {/* Match reasons - always visible */}
          <div className="flex flex-wrap gap-1 mt-2">
            {resource.match_reasons.slice(0, 2).map((reason, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
                {reason}
              </span>
            ))}
          </div>

          {/* Quick contact - always visible if available */}
          {hasContactInfo && (
            <div className="flex flex-wrap gap-3 mt-2">
              {resource.phone && (
                <a
                  href={`tel:${resource.phone}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  <Phone className="w-3 h-3" />
                  {resource.phone}
                </a>
              )}
              {resource.website && (
                <a
                  href={resource.website.startsWith("http") ? resource.website : `https://${resource.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  <Globe className="w-3 h-3" />
                  Website
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
            </div>
          )}
        </div>

        {/* Expand toggle */}
        <div className="flex-shrink-0 mt-1">
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t border-white/50 space-y-3">
          {/* Description */}
          {resource.description && (
            <p className="text-sm text-slate-700 leading-relaxed">{resource.description}</p>
          )}

          {/* Eligibility */}
          {resource.eligibility_notes && (
            <div className="flex items-start gap-2 p-2.5 bg-white/60 rounded-md">
              <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-slate-700 mb-0.5">Eligibility</p>
                <p className="text-xs text-slate-600">{resource.eligibility_notes}</p>
              </div>
            </div>
          )}

          {/* How to apply */}
          {resource.apply_notes && (
            <div className="flex items-start gap-2 p-2.5 bg-white/60 rounded-md">
              <ArrowRight className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-slate-700 mb-0.5">How to Apply</p>
                <p className="text-xs text-slate-600">{resource.apply_notes}</p>
              </div>
            </div>
          )}

          {/* All match reasons */}
          {resource.match_reasons.length > 2 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-700">Why this matched:</p>
              {resource.match_reasons.map((reason, i) => (
                <span key={i} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                  <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
                  {reason}
                </span>
              ))}
            </div>
          )}

          {/* Contact details */}
          <div className="flex flex-wrap gap-2">
            {resource.email && (
              <a
                href={`mailto:${resource.email}`}
                className="inline-flex items-center gap-1.5 text-xs bg-white px-2.5 py-1.5 rounded-md border text-slate-700 hover:bg-slate-50"
              >
                <Mail className="w-3.5 h-3.5" />
                {resource.email}
              </a>
            )}
            {resource.state_code && (
              <span className="inline-flex items-center gap-1.5 text-xs bg-white px-2.5 py-1.5 rounded-md border text-slate-700">
                <MapPin className="w-3.5 h-3.5" />
                {resource.state_code}
              </span>
            )}
            {resource.category && (
              <span className="inline-flex items-center gap-1.5 text-xs bg-white px-2.5 py-1.5 rounded-md border text-slate-700">
                <Lightbulb className="w-3.5 h-3.5" />
                {resource.category}
              </span>
            )}
          </div>

          {/* Need types */}
          {resource.need_types && resource.need_types.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {resource.need_types.map((need, i) => (
                <Badge key={i} variant="outline" className="text-[10px] bg-white">
                  {need.replace(/_/g, " ")}
                </Badge>
              ))}
            </div>
          )}

          {/* Type badge */}
          <div className="flex items-center gap-2 pt-1">
            <Badge variant="outline" className={`text-[10px] ${typeConfig.bg} border-0`}>
              <TypeIcon className="w-3 h-3 mr-1" />
              {typeConfig.label}
            </Badge>
            <Badge variant="outline" className="text-[10px] bg-white">
              {resource.domain.replace(/_/g, " ")}
            </Badge>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component: by pipeline type ───
export function SupportRecommendations({
  pipeline_type,
  jurisdiction,
  urgency,
}: {
  pipeline_type: string;
  jurisdiction?: string;
  urgency?: "crisis" | "urgent" | "standard" | "informational";
}) {
  const { data: resources, isLoading, error } = trpc.supportMatcher.match.useQuery(
    { pipeline_type, jurisdiction, urgency, limit: 5 },
    { enabled: !!pipeline_type, staleTime: 60_000 }
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600" />
            Finding Support Resources...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-slate-100 rounded-lg animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !resources || resources.length === 0) {
    return null; // Don't show empty state — fail silently
  }

  return (
    <Card className="border-blue-200 bg-gradient-to-br from-blue-50/50 to-white">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-600" />
              Support Resources For You
            </CardTitle>
            <CardDescription className="mt-1 text-xs">
              Matched to your situation — ranked by relevance and urgency
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
            {resources.length} matched
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {resources.map((resource, i) => (
          <ResourceCard key={resource.id} resource={resource} rank={i + 1} />
        ))}

        {/* Disclaimer */}
        <div className="flex items-start gap-2 pt-2 text-[11px] text-slate-500">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <p>
            These resources are matched based on your case type and location. Verify eligibility
            directly with each organization. Contact information may change — if a number doesn't
            work, search for the organization name online.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Case-specific version (uses caseId to auto-detect pipeline + jurisdiction) ───
export function CaseSupportRecommendations({ caseId }: { caseId: number }) {
  const { data, isLoading, error } = trpc.supportMatcher.matchForCase.useQuery(
    { caseId },
    { enabled: !!caseId, staleTime: 60_000 }
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600" />
            Finding Support Resources...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-slate-100 rounded-lg animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data || !data.resources || data.resources.length === 0) {
    return null;
  }

  return (
    <Card className="border-blue-200 bg-gradient-to-br from-blue-50/50 to-white">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-600" />
              Support Resources For You
            </CardTitle>
            <CardDescription className="mt-1 text-xs">
              Matched to your case — ranked by relevance and urgency
              {data.urgency === "crisis" && (
                <span className="ml-1 text-red-600 font-medium">• Crisis-level priority</span>
              )}
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
            {data.resources.length} matched
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.resources.map((resource: ResourceResult, i: number) => (
          <ResourceCard key={resource.id} resource={resource} rank={i + 1} />
        ))}

        <div className="flex items-start gap-2 pt-2 text-[11px] text-slate-500">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <p>
            These resources are matched based on your case type and location. Verify eligibility
            directly with each organization.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
