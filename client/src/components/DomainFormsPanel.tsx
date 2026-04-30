/**
 * DomainFormsPanel Component
 * Displays all forms for a specific domain with clickable items
 * Replaces static form lists with interactive, functional UI
 */

import React from "react";
import { FileText, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ClickableFormItem } from "./ClickableFormItem";
import { trpc } from "@/lib/trpc";

interface DomainFormsPanelProps {
  domain: string;
  jurisdiction?: string;
  title?: string;
}

export function DomainFormsPanel({ domain, jurisdiction, title }: DomainFormsPanelProps) {
  const { data: forms, isLoading } = trpc.legalRegistry.getFormsByDomain.useQuery({
    domain,
    jurisdiction,
  });

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center gap-2 text-gray-600">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Loading forms...</span>
        </div>
      </Card>
    );
  }

  if (!forms || forms.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-center text-gray-500">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No forms available for this domain</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-600" />
          {title || `${domain.charAt(0).toUpperCase() + domain.slice(1)} Forms`}
        </h3>
        <p className="text-sm text-gray-600 mt-1">{forms.length} available form(s)</p>
      </div>

      <ul className="space-y-2">
        {forms.map((form) => (
          <ClickableFormItem
            key={form.id}
            formId={form.id}
            formName={form.formName}
            filingDeadline={form.filingDeadline}
            accessMethods={form.accessMethods}
            variant="list-item"
          />
        ))}
      </ul>
    </Card>
  );
}
