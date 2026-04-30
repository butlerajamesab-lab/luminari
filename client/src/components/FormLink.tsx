/**
 * FormLink Component
 * Displays a clickable link to a form from the registry
 * Used throughout the UI to replace static form references
 */

import React from "react";
import { ExternalLink, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";

interface FormLinkProps {
  formId: string;
  label?: string;
  variant?: "button" | "card" | "inline";
  onClick?: () => void;
  className?: string;
}

export function FormLink({ formId, label, variant = "button", onClick, className }: FormLinkProps) {
  const { data: form, isLoading, error } = trpc.registry.getFormById.useQuery({ formId });

  if (isLoading) {
    return <div className="animate-pulse h-10 bg-gray-200 rounded" />;
  }

  if (error || !form) {
    return (
      <div className="flex items-center gap-2 text-red-600">
        <AlertCircle className="w-4 h-4" />
        <span className="text-sm">Form not found</span>
      </div>
    );
  }

  const handleClick = () => {
    if (form.url) {
      window.open(form.url, "_blank");
    }
    onClick?.();
  };

  const displayLabel = label || form.formName;

  if (variant === "inline") {
    return (
      <button
        onClick={handleClick}
        className={`text-blue-600 hover:text-blue-800 underline flex items-center gap-1 ${className}`}
      >
        {displayLabel}
        <ExternalLink className="w-3 h-3" />
      </button>
    );
  }

  if (variant === "card") {
    return (
      <Card className="p-4 hover:shadow-lg transition-shadow cursor-pointer" onClick={handleClick}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h3 className="font-semibold text-lg mb-1">{displayLabel}</h3>
            <p className="text-sm text-gray-600 mb-2">{form.agencyId}</p>
            {form.filingDeadline && (
              <p className="text-xs text-gray-500 mb-2">
                <strong>Deadline:</strong> {form.filingDeadline}
              </p>
            )}
            <div className="flex gap-2 flex-wrap">
              {form.accessMethods.map((method) => (
                <Badge key={method} variant="secondary" className="text-xs">
                  {method}
                </Badge>
              ))}
            </div>
          </div>
          <ExternalLink className="w-5 h-5 text-blue-600 flex-shrink-0 mt-1" />
        </div>
      </Card>
    );
  }

  // Default: button variant
  return (
    <Button
      onClick={handleClick}
      variant="default"
      className={className}
      title={form.filingDeadline ? `Deadline: ${form.filingDeadline}` : undefined}
    >
      {displayLabel}
      <ExternalLink className="w-4 h-4 ml-2" />
    </Button>
  );
}

/**
 * FormsList Component
 * Displays all forms for a domain
 */

interface FormsListProps {
  domain: string;
  jurisdiction?: string;
  variant?: "list" | "grid" | "compact";
  className?: string;
}

export function FormsList({ domain, jurisdiction, variant = "list", className }: FormsListProps) {
  const { data: forms, isLoading, error } = trpc.registry.getFormsByDomain.useQuery({
    domain,
    jurisdiction,
  });

  if (isLoading) {
    return <div className="animate-pulse space-y-2">Loading forms...</div>;
  }

  if (error || !forms || forms.length === 0) {
    return <p className="text-gray-500 text-sm">No forms available for this domain</p>;
  }

  if (variant === "compact") {
    return (
      <div className={`space-y-1 ${className}`}>
        {forms.map((form) => (
          <FormLink key={form.id} formId={form.id} variant="inline" />
        ))}
      </div>
    );
  }

  if (variant === "grid") {
    return (
      <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${className}`}>
        {forms.map((form) => (
          <FormLink key={form.id} formId={form.id} variant="card" />
        ))}
      </div>
    );
  }

  // Default: list variant
  return (
    <div className={`space-y-2 ${className}`}>
      {forms.map((form) => (
        <div key={form.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
          <div className="flex-1">
            <p className="font-medium text-sm">{form.formName}</p>
            {form.filingDeadline && (
              <p className="text-xs text-gray-500">Deadline: {form.filingDeadline}</p>
            )}
          </div>
          <FormLink formId={form.id} variant="button" />
        </div>
      ))}
    </div>
  );
}
