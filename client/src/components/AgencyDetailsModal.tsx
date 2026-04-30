/**
 * AgencyDetailsModal Component
 * Displays detailed agency information with contact methods and available forms
 */

import React from "react";
import { X, Phone, Globe, Mail, MapPin, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

interface AgencyDetailsModalProps {
  agencyId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function AgencyDetailsModal({ agencyId, isOpen, onClose }: AgencyDetailsModalProps) {
  const { data: agency, isLoading: agencyLoading } = trpc.legalRegistry.getAgencyById.useQuery(
    { agencyId },
    { enabled: isOpen }
  );
  const { data: forms, isLoading: formsLoading } = trpc.legalRegistry.getFormsByAgency.useQuery(
    { agencyId },
    { enabled: isOpen }
  );

  if (!isOpen) return null;

  const getContactIcon = (method: string) => {
    switch (method) {
      case "phone":
        return <Phone className="w-4 h-4" />;
      case "web":
        return <Globe className="w-4 h-4" />;
      case "email":
        return <Mail className="w-4 h-4" />;
      case "mail":
        return <MapPin className="w-4 h-4" />;
      case "walk_in":
        return <MapPin className="w-4 h-4" />;
      default:
        return null;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h2 className="text-2xl font-bold mb-2">{agency?.agencyName}</h2>
              <div className="flex gap-2">
                <Badge variant="outline">{agency?.agencyType}</Badge>
                <Badge variant="secondary">{agency?.jurisdiction}</Badge>
              </div>
            </div>
            <DialogClose asChild>
              <Button variant="ghost" size="icon">
                <X className="h-4 w-4" />
              </Button>
            </DialogClose>
          </DialogTitle>
        </DialogHeader>

        {agencyLoading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-20 bg-gray-200 rounded" />
            <div className="h-20 bg-gray-200 rounded" />
          </div>
        ) : agency ? (
          <div className="space-y-6">
            {/* Description */}
            {agency.notes && (
              <Card className="p-4 bg-blue-50 border-blue-200">
                <p className="text-sm text-blue-900">{agency.notes}</p>
              </Card>
            )}

            {/* Contact Methods */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Phone className="w-4 h-4" />
                Contact Information
              </h3>
              <div className="space-y-2">
                {agency.contactMethods.phone && (
                  <a
                    href={`tel:${agency.contactMethods.phone}`}
                    className="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 transition-colors"
                  >
                    <Phone className="w-4 h-4 text-blue-600" />
                    <div>
                      <p className="text-xs text-gray-600">Phone</p>
                      <p className="font-mono text-sm">{agency.contactMethods.phone}</p>
                    </div>
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
                    <div>
                      <p className="text-xs text-gray-600">Website</p>
                      <p className="text-sm truncate">{new URL(agency.contactMethods.web).hostname}</p>
                    </div>
                  </a>
                )}

                {agency.contactMethods.email && (
                  <a
                    href={`mailto:${agency.contactMethods.email}`}
                    className="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 transition-colors"
                  >
                    <Mail className="w-4 h-4 text-blue-600" />
                    <div>
                      <p className="text-xs text-gray-600">Email</p>
                      <p className="text-sm truncate">{agency.contactMethods.email}</p>
                    </div>
                  </a>
                )}

                {agency.contactMethods.mail && (
                  <div className="flex items-center gap-3 p-3 rounded-lg border bg-gray-50">
                    <MapPin className="w-4 h-4 text-blue-600" />
                    <div>
                      <p className="text-xs text-gray-600">Mailing Address</p>
                      <p className="text-sm">{agency.contactMethods.mail}</p>
                    </div>
                  </div>
                )}

                {agency.contactMethods.walk_in && (
                  <div className="flex items-center gap-3 p-3 rounded-lg border bg-gray-50">
                    <MapPin className="w-4 h-4 text-blue-600" />
                    <div>
                      <p className="text-xs text-gray-600">Walk-in Location</p>
                      <p className="text-sm">{agency.contactMethods.walk_in}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Available Forms */}
            {!formsLoading && forms && forms.length > 0 && (
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Available Forms ({forms.length})
                </h3>
                <div className="space-y-2">
                  {forms.map((form) => (
                    <Card key={form.id} className="p-3 hover:bg-gray-50 transition-colors cursor-pointer">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{form.formName}</p>
                          {form.filingDeadline && (
                            <p className="text-xs text-gray-600 mt-1">Deadline: {form.filingDeadline}</p>
                          )}
                        </div>
                        <a
                          href={form.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          Open →
                        </a>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Status */}
            <div className="p-3 bg-gray-50 rounded-lg border">
              <p className="text-xs text-gray-600 mb-1">Status</p>
              <Badge variant={agency.officialStatus === "active" ? "default" : "secondary"}>
                {agency.officialStatus}
              </Badge>
            </div>
          </div>
        ) : (
          <p className="text-gray-500">Agency not found</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
