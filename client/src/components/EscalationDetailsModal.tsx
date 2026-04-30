/**
 * EscalationDetailsModal Component
 * Displays detailed escalation pathway information
 */

import React from "react";
import { X, ChevronRight, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

interface EscalationDetailsModalProps {
  escalationId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function EscalationDetailsModal({ escalationId, isOpen, onClose }: EscalationDetailsModalProps) {
  const { data: escalations, isLoading } = trpc.legalRegistry.getEscalationPath.useQuery(
    { domain: "housing", jurisdiction: "NATIONAL" },
    { enabled: isOpen }
  );

  const escalation = escalations?.find((e) => e.id === escalationId);
  const { data: fromAgency } = trpc.legalRegistry.getAgencyById.useQuery(
    { agencyId: escalation?.fromAgencyId || "" },
    { enabled: !!escalation?.fromAgencyId }
  );
  const { data: toAgency } = trpc.legalRegistry.getAgencyById.useQuery(
    { agencyId: escalation?.toAgencyId || "" },
    { enabled: !!escalation?.toAgencyId }
  );

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h2 className="text-2xl font-bold mb-2">Escalation Pathway</h2>
              <p className="text-sm text-gray-600">How to escalate your complaint</p>
            </div>
            <DialogClose asChild>
              <Button variant="ghost" size="icon">
                <X className="h-4 w-4" />
              </Button>
            </DialogClose>
          </DialogTitle>
        </DialogHeader>

        {isLoading || !escalation ? (
          <div className="animate-pulse space-y-4">
            <div className="h-20 bg-gray-200 rounded" />
            <div className="h-20 bg-gray-200 rounded" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Trigger Condition */}
            {escalation.triggerCondition && (
              <Card className="p-4 bg-amber-50 border-amber-200">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-amber-900">When to Escalate</p>
                    <p className="text-sm text-amber-800 mt-1">{escalation.triggerCondition}</p>
                  </div>
                </div>
              </Card>
            )}

            {/* Escalation Flow */}
            <div>
              <h3 className="font-semibold mb-4">Escalation Flow</h3>
              <div className="space-y-4">
                {/* From Agency */}
                {fromAgency && (
                  <div className="p-4 rounded-lg border-2 border-blue-200 bg-blue-50">
                    <p className="text-xs text-blue-600 font-semibold mb-1">STEP 1: FILE WITH</p>
                    <p className="font-semibold text-lg">{fromAgency.agencyName}</p>
                    {fromAgency.contactMethods.phone && (
                      <p className="text-sm text-gray-600 mt-2">{fromAgency.contactMethods.phone}</p>
                    )}
                  </div>
                )}

                {/* Arrow & Timeline */}
                <div className="flex items-center justify-center py-2">
                  <div className="flex-1 border-t-2 border-gray-300" />
                  <div className="px-4 text-center">
                    <ChevronRight className="w-6 h-6 text-gray-400 mx-auto" />
                    {escalation.timeline && (
                      <p className="text-xs text-gray-600 mt-2 font-medium">{escalation.timeline}</p>
                    )}
                  </div>
                  <div className="flex-1 border-t-2 border-gray-300" />
                </div>

                {/* To Agency */}
                {toAgency && (
                  <div className="p-4 rounded-lg border-2 border-green-200 bg-green-50">
                    <p className="text-xs text-green-600 font-semibold mb-1">STEP 2: ESCALATE TO</p>
                    <p className="font-semibold text-lg">{toAgency.agencyName}</p>
                    {toAgency.contactMethods.phone && (
                      <p className="text-sm text-gray-600 mt-2">{toAgency.contactMethods.phone}</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Pathway Description */}
            {escalation.pathwayDescription && (
              <Card className="p-4 bg-gray-50">
                <h3 className="font-semibold mb-2">How It Works</h3>
                <p className="text-sm text-gray-700">{escalation.pathwayDescription}</p>
              </Card>
            )}

            {/* Simultaneous Filing */}
            {escalation.simultaneousFiling && (
              <Card className="p-4 border-green-200 bg-green-50">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-green-900">Simultaneous Filing Allowed</p>
                    <p className="text-sm text-green-800 mt-1">
                      You can file complaints with both agencies at the same time
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {/* Timeline Info */}
            {escalation.timeline && (
              <Card className="p-4 border-blue-200 bg-blue-50">
                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-blue-900">Timeline</p>
                    <p className="text-sm text-blue-800 mt-1">{escalation.timeline}</p>
                  </div>
                </div>
              </Card>
            )}

            {/* Notes */}
            {escalation.notes && (
              <Card className="p-4 bg-gray-50 border">
                <p className="text-sm text-gray-700 italic">{escalation.notes}</p>
              </Card>
            )}

            {/* Metadata */}
            <div className="flex gap-2 flex-wrap">
              <Badge variant="outline">{escalation.domain}</Badge>
              <Badge variant="outline">{escalation.jurisdiction}</Badge>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
