/**
 * DomainAgenciesPanel Component
 * Displays all agencies for a specific domain with clickable items
 */

import React from "react";
import { Building2, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ClickableAgencyItem } from "./ClickableAgencyItem";
import { trpc } from "@/lib/trpc";

interface DomainAgenciesPanelProps {
  domain: string;
  jurisdiction?: string;
  title?: string;
}

export function DomainAgenciesPanel({ domain, jurisdiction, title }: DomainAgenciesPanelProps) {
  const { data: agencies, isLoading } = trpc.legalRegistry.getAgenciesByDomain.useQuery({
    domain,
    jurisdiction,
  });

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center gap-2 text-gray-600">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Loading agencies...</span>
        </div>
      </Card>
    );
  }

  if (!agencies || agencies.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-center text-gray-500">
          <Building2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No agencies available for this domain</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Building2 className="w-5 h-5 text-green-600" />
          {title || `${domain.charAt(0).toUpperCase() + domain.slice(1)} Agencies`}
        </h3>
        <p className="text-sm text-gray-600 mt-1">{agencies.length} available agency(ies)</p>
      </div>

      <ul className="space-y-2">
        {agencies.map((agency) => (
          <ClickableAgencyItem
            key={agency.id}
            agencyId={agency.id}
            agencyName={agency.agencyName}
            jurisdiction={agency.jurisdiction}
            agencyType={agency.agencyType}
            variant="list-item"
          />
        ))}
      </ul>
    </Card>
  );
}
