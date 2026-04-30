/**
 * AgencyCard Component
 * Displays agency information with contact methods and available forms
 */

import React from "react";
import { Phone, Globe, MapPin, Mail, MessageSquare } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { FormLink } from "./FormLink";

interface AgencyCardProps {
  agencyId: string;
  compact?: boolean;
  className?: string;
}

export function AgencyCard({ agencyId, compact = false, className }: AgencyCardProps) {
  const { data: agency, isLoading: agencyLoading } = trpc.registry.getAgencyById.useQuery({ agencyId });
  const { data: forms, isLoading: formsLoading } = trpc.registry.getFormsByAgency.useQuery({ agencyId });

  if (agencyLoading) {
    return <div className="animate-pulse h-32 bg-gray-200 rounded" />;
  }

  if (!agency) {
    return null;
  }

  const getContactIcon = (method: string) => {
    switch (method) {
      case "phone":
        return <Phone className="w-4 h-4" />;
      case "web":
        return <Globe className="w-4 h-4" />;
      case "mail":
        return <MapPin className="w-4 h-4" />;
      case "email":
        return <Mail className="w-4 h-4" />;
      case "walk_in":
        return <MapPin className="w-4 h-4" />;
      default:
        return null;
    }
  };

  if (compact) {
    return (
      <div className={`p-3 border rounded-lg ${className}`}>
        <p className="font-semibold text-sm mb-2">{agency.agencyName}</p>
        <div className="space-y-1">
          {agency.contactMethods.phone && (
            <a
              href={`tel:${agency.contactMethods.phone}`}
              className="flex items-center gap-2 text-xs text-blue-600 hover:underline"
            >
              <Phone className="w-3 h-3" />
              {agency.contactMethods.phone}
            </a>
          )}
          {agency.contactMethods.web && (
            <a
              href={agency.contactMethods.web}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-blue-600 hover:underline"
            >
              <Globe className="w-3 h-3" />
              Visit Website
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card className={`p-6 ${className}`}>
      <div className="mb-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-lg font-semibold">{agency.agencyName}</h3>
          <Badge variant="outline">{agency.agencyType}</Badge>
        </div>
        <p className="text-sm text-gray-600">{agency.jurisdiction}</p>
      </div>

      {agency.notes && <p className="text-sm text-gray-700 mb-4">{agency.notes}</p>}

      {/* Contact Methods */}
      <div className="mb-6">
        <h4 className="text-sm font-semibold mb-3">Contact</h4>
        <div className="space-y-2">
          {agency.contactMethods.phone && (
            <a
              href={`tel:${agency.contactMethods.phone}`}
              className="flex items-center gap-3 p-2 rounded hover:bg-gray-100 transition-colors"
            >
              <Phone className="w-4 h-4 text-blue-600" />
              <span className="text-sm">{agency.contactMethods.phone}</span>
            </a>
          )}
          {agency.contactMethods.web && (
            <a
              href={agency.contactMethods.web}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-2 rounded hover:bg-gray-100 transition-colors"
            >
              <Globe className="w-4 h-4 text-blue-600" />
              <span className="text-sm truncate">{new URL(agency.contactMethods.web).hostname}</span>
            </a>
          )}
          {agency.contactMethods.email && (
            <a
              href={`mailto:${agency.contactMethods.email}`}
              className="flex items-center gap-3 p-2 rounded hover:bg-gray-100 transition-colors"
            >
              <Mail className="w-4 h-4 text-blue-600" />
              <span className="text-sm truncate">{agency.contactMethods.email}</span>
            </a>
          )}
          {agency.contactMethods.walk_in && (
            <div className="flex items-center gap-3 p-2 rounded">
              <MapPin className="w-4 h-4 text-blue-600" />
              <span className="text-sm">{agency.contactMethods.walk_in}</span>
            </div>
          )}
        </div>
      </div>

      {/* Forms */}
      {!formsLoading && forms && forms.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-3">Available Forms</h4>
          <div className="space-y-2">
            {forms.map((form) => (
              <FormLink key={form.id} formId={form.id} variant="inline" />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

/**
 * AgenciesList Component
 * Displays all agencies for a domain
 */

interface AgenciesListProps {
  domain: string;
  jurisdiction?: string;
  compact?: boolean;
  className?: string;
}

export function AgenciesList({ domain, jurisdiction, compact = false, className }: AgenciesListProps) {
  const { data: agencies, isLoading, error } = trpc.registry.getAgenciesByDomain.useQuery({
    domain,
    jurisdiction,
  });

  if (isLoading) {
    return <div className="animate-pulse space-y-3">Loading agencies...</div>;
  }

  if (error || !agencies || agencies.length === 0) {
    return <p className="text-gray-500 text-sm">No agencies found for this domain</p>;
  }

  if (compact) {
    return (
      <div className={`space-y-2 ${className}`}>
        {agencies.map((agency) => (
          <AgencyCard key={agency.id} agencyId={agency.id} compact={true} />
        ))}
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {agencies.map((agency) => (
        <AgencyCard key={agency.id} agencyId={agency.id} />
      ))}
    </div>
  );
}
