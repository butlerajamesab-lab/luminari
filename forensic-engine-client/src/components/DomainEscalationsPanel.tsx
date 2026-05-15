/**
 * DomainEscalationsPanel Component
 * Displays escalation paths for a specific domain with clickable items
 */

import React from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ClickableEscalationItem } from "./ClickableEscalationItem";
import { trpc } from "@/lib/trpc";

interface DomainEscalationsPanelProps {
  domain: string;
  jurisdiction?: string;
  title?: string;
}

export function DomainEscalationsPanel({ domain, jurisdiction, title }: DomainEscalationsPanelProps) {
  const { data: escalations, isLoading } = trpc.legalRegistry.getEscalationPath.useQuery({
    domain,
    jurisdiction,
  });

  const { data: agencies } = trpc.legalRegistry.getAgenciesByDomain.useQuery({
    domain,
    jurisdiction,
  });

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center gap-2 text-gray-600">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Loading escalation paths...</span>
        </div>
      </Card>
    );
  }

  if (!escalations || escalations.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-center text-gray-500">
          <ArrowRight className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No escalation paths available for this domain</p>
        </div>
      </Card>
    );
  }

  const getAgencyName = (agencyId: string) => {
    return agencies?.find((a) => a.id === agencyId)?.agencyName || agencyId;
  };

  return (
    <Card className="p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <ArrowRight className="w-5 h-5 text-purple-600" />
          {title || "Escalation Pathways"}
        </h3>
        <p className="text-sm text-gray-600 mt-1">{escalations.length} escalation path(s)</p>
      </div>

      <ul className="space-y-2">
        {escalations.map((escalation) => (
          <ClickableEscalationItem
            key={escalation.id}
            escalationId={escalation.id}
            fromAgencyName={getAgencyName(escalation.fromAgencyId)}
            toAgencyName={getAgencyName(escalation.toAgencyId)}
            triggerCondition={escalation.triggerCondition}
            variant="list-item"
          />
        ))}
      </ul>
    </Card>
  );
}
