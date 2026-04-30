/**
 * FormDetailsModal Component
 * Displays detailed form information in a modal with action buttons
 */

import React, { useState } from "react";
import { X, ExternalLink, Copy, Check, Calendar, FileText, Phone, Globe } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

interface FormDetailsModalProps {
  formId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function FormDetailsModal({ formId, isOpen, onClose }: FormDetailsModalProps) {
  const { data: form, isLoading } = trpc.legalRegistry.getFormById.useQuery({ formId }, { enabled: isOpen });
  const { data: agency } = trpc.legalRegistry.getAgencyById.useQuery(
    { agencyId: form?.agencyId || "" },
    { enabled: !!form?.agencyId }
  );
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopyUrl = () => {
    if (form?.url) {
      navigator.clipboard.writeText(form.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleOpenForm = () => {
    if (form?.url) {
      window.open(form.url, "_blank");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h2 className="text-2xl font-bold mb-2">{form?.formName}</h2>
              {agency && <p className="text-sm text-gray-600">{agency.agencyName}</p>}
            </div>
            <DialogClose asChild>
              <Button variant="ghost" size="icon">
                <X className="h-4 w-4" />
              </Button>
            </DialogClose>
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-20 bg-gray-200 rounded" />
            <div className="h-20 bg-gray-200 rounded" />
          </div>
        ) : form ? (
          <div className="space-y-6">
            {/* Quick Actions */}
            <div className="flex gap-2">
              <Button onClick={handleOpenForm} className="flex-1" size="lg">
                <ExternalLink className="w-4 h-4 mr-2" />
                Open Form
              </Button>
              <Button onClick={handleCopyUrl} variant="outline" size="lg">
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>

            {/* Filing Deadline */}
            {form.filingDeadline && (
              <Card className="p-4 bg-amber-50 border-amber-200">
                <div className="flex items-start gap-3">
                  <Calendar className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-amber-900">Filing Deadline</p>
                    <p className="text-sm text-amber-800">{form.filingDeadline}</p>
                  </div>
                </div>
              </Card>
            )}

            {/* Access Methods */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                How to Access
              </h3>
              <div className="flex gap-2 flex-wrap">
                {form.accessMethods.map((method) => (
                  <Badge key={method} variant="secondary" className="text-sm py-1.5 px-3">
                    {method === "web" && "🌐 Online"}
                    {method === "phone" && "☎️ Phone"}
                    {method === "mail" && "✉️ Mail"}
                    {method === "walk_in" && "🚪 Walk-in"}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Required Fields */}
            {form.requiredFields && form.requiredFields.length > 0 && (
              <div>
                <h3 className="font-semibold mb-3">Required Information</h3>
                <ul className="space-y-2">
                  {form.requiredFields.map((field) => (
                    <li key={field} className="flex items-center gap-2 text-sm">
                      <div className="w-2 h-2 bg-blue-600 rounded-full" />
                      <span className="capitalize">{field.replace(/_/g, " ")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Agency Contact Info */}
            {agency && (
              <div>
                <h3 className="font-semibold mb-3">Contact the Agency</h3>
                <div className="space-y-2">
                  {agency.contactMethods.phone && (
                    <a
                      href={`tel:${agency.contactMethods.phone}`}
                      className="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 transition-colors"
                    >
                      <Phone className="w-4 h-4 text-blue-600" />
                      <span>{agency.contactMethods.phone}</span>
                    </a>
                  )}
                  {agency.contactMethods.web && (
                    <a
                      href={agency.contactMethods.web}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 transition-colors"
                    >
                      <Globe className="w-4 h-4 text-blue-600" />
                      <span className="truncate">{new URL(agency.contactMethods.web).hostname}</span>
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Notes */}
            {form.notes && (
              <Card className="p-4 bg-gray-50">
                <p className="text-sm text-gray-700">{form.notes}</p>
              </Card>
            )}

            {/* URL Display */}
            <div className="p-3 bg-gray-50 rounded-lg border">
              <p className="text-xs text-gray-600 mb-1">Form URL</p>
              <p className="text-xs font-mono text-gray-800 truncate">{form.url}</p>
            </div>
          </div>
        ) : (
          <p className="text-gray-500">Form not found</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
