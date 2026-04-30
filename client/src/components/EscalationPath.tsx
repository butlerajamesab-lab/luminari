/**
 * EscalationPath Component
 * Visualizes escalation pathways between agencies
 */

import React from "react";
import { ChevronRight, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { AgencyCard } from "./AgencyCard";

interface EscalationPathProps {
  domain: string;
  jurisdiction?: string;
  className?: string;
}

export function EscalationPath({ domain, jurisdiction, className }: EscalationPathProps) {
  const { data: escalations, isLoading, error } = trpc.registry.getEscalationPath.useQuery({
    domain,
    jurisdiction,
  });

  if (isLoading) {
    return <div className="animate-pulse h-40 bg-gray-200 rounded" />;
  }

  if (error || !escalations || escalations.length === 0) {
    return (
      <div className="flex items-center gap-2 text-gray-500 text-sm p-4 bg-gray-50 rounded">
        <AlertCircle className="w-4 h-4" />
        No escalation paths defined for this domain
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {escalations.map((escalation) => (
        <EscalationCard key={escalation.id} escalation={escalation} />
      ))}
    </div>
  );
}

interface EscalationCardProps {
  escalation: any;
}

function EscalationCard({ escalation }: EscalationCardProps) {
  const { data: fromAgency } = trpc.registry.getAgencyById.useQuery({
    agencyId: escalation.fromAgencyId,
  });
  const { data: toAgency } = trpc.registry.getAgencyById.useQuery({
    agencyId: escalation.toAgencyId,
  });

  return (
    <Card className="p-6">
      <div className="mb-4">
        <h3 className="font-semibold text-lg mb-2">Escalation Path</h3>
        {escalation.triggerCondition && (
          <p className="text-sm text-gray-600">
            <strong>Trigger:</strong> {escalation.triggerCondition}
          </p>
        )}
      </div>

      {/* Escalation Flow */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex-1">
          {fromAgency && (
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="font-semibold text-sm">{fromAgency.agencyName}</p>
              <p className="text-xs text-gray-600">{fromAgency.jurisdiction}</p>
            </div>
          )}
        </div>

        <div className="flex flex-col items-center gap-2">
          <ChevronRight className="w-5 h-5 text-gray-400" />
          {escalation.timeline && (
            <span className="text-xs text-gray-500 text-center whitespace-nowrap">{escalation.timeline}</span>
          )}
        </div>

        <div className="flex-1">
          {toAgency && (
            <div className="p-3 bg-green-50 rounded-lg border border-green-200">
              <p className="font-semibold text-sm">{toAgency.agencyName}</p>
              <p className="text-xs text-gray-600">{toAgency.jurisdiction}</p>
            </div>
          )}
        </div>
      </div>

      {/* Description */}
      {escalation.pathwayDescription && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-700">{escalation.pathwayDescription}</p>
        </div>
      )}

      {/* Metadata */}
      <div className="flex gap-2 flex-wrap">
        {escalation.simultaneousFiling && (
          <Badge variant="secondary" className="text-xs">
            Can file simultaneously
          </Badge>
        )}
        {escalation.timeline && (
          <Badge variant="outline" className="text-xs">
            {escalation.timeline}
          </Badge>
        )}
      </div>

      {escalation.notes && (
        <p className="text-xs text-gray-600 mt-3 italic">{escalation.notes}</p>
      )}
    </Card>
  );
}

/**
 * DomainProfile Component
 * Complete view of a domain: agencies, forms, escalation paths
 */

interface DomainProfileProps {
  domain: string;
  jurisdiction?: string;
  className?: string;
}

export function DomainProfile({ domain, jurisdiction, className }: DomainProfileProps) {
  const { data: profile, isLoading, error } = trpc.registry.getDomainProfile.useQuery({
    domain,
    jurisdiction,
  });

  if (isLoading) {
    return <div className="animate-pulse space-y-4">Loading domain profile...</div>;
  }

  if (error || !profile) {
    return (
      <div className="flex items-center gap-2 text-red-600 p-4 bg-red-50 rounded">
        <AlertCircle className="w-4 h-4" />
        Failed to load domain profile
      </div>
    );
  }

  return (
    <div className={`space-y-8 ${className}`}>
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold mb-2 capitalize">{domain.replace(/_/g, " ")} Domain</h2>
        <div className="flex gap-4 text-sm text-gray-600">
          <span>
            <strong>{profile.summary.agencyCount}</strong> agencies
          </span>
          <span>
            <strong>{profile.summary.formCount}</strong> forms
          </span>
          <span>
            <strong>{profile.summary.escalationCount}</strong> escalation paths
          </span>
        </div>
      </div>

      {/* Agencies */}
      {profile.agencies.length > 0 && (
        <div>
          <h3 className="text-xl font-semibold mb-4">Agencies</h3>
          <div className="space-y-4">
            {profile.agencies.map((agency) => (
              <AgencyCard key={agency.id} agencyId={agency.id} />
            ))}
          </div>
        </div>
      )}

      {/* Escalation Paths */}
      {profile.escalations.length > 0 && (
        <div>
          <h3 className="text-xl font-semibold mb-4">Escalation Paths</h3>
          <EscalationPath domain={domain} jurisdiction={jurisdiction} />
        </div>
      )}
    </div>
  );
}
