/**
 * ClickableAgencyItem Component
 * Wraps agency items with click handlers to open detail modal
 */

import React, { useState } from "react";
import { Building2, ChevronRight } from "lucide-react";
import { AgencyDetailsModal } from "./AgencyDetailsModal";
import { cn } from "@/lib/utils";

interface ClickableAgencyItemProps {
  agencyId: string;
  agencyName: string;
  jurisdiction?: string;
  agencyType?: string;
  className?: string;
  variant?: "card" | "list-item" | "inline";
}

export function ClickableAgencyItem({
  agencyId,
  agencyName,
  jurisdiction,
  agencyType,
  className,
  variant = "list-item",
}: ClickableAgencyItemProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsOpen(true);
  };

  if (variant === "card") {
    return (
      <>
        <div
          onClick={handleClick}
          className={cn(
            "p-4 rounded-lg border border-gray-200 hover:border-green-400 hover:bg-green-50 transition-all cursor-pointer group",
            className
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="w-4 h-4 text-green-600" />
                <h4 className="font-semibold text-sm group-hover:text-green-700">{agencyName}</h4>
              </div>
              <div className="flex gap-2 text-xs text-gray-600">
                {jurisdiction && <span className="bg-gray-100 px-2 py-1 rounded">{jurisdiction}</span>}
                {agencyType && <span className="bg-gray-100 px-2 py-1 rounded capitalize">{agencyType}</span>}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-green-600 flex-shrink-0" />
          </div>
        </div>
        <AgencyDetailsModal agencyId={agencyId} isOpen={isOpen} onClose={() => setIsOpen(false)} />
      </>
    );
  }

  if (variant === "inline") {
    return (
      <>
        <button
          onClick={handleClick}
          className={cn(
            "text-green-600 hover:text-green-800 hover:underline font-medium inline-flex items-center gap-1 transition-colors",
            className
          )}
        >
          {agencyName}
          <ChevronRight className="w-3 h-3" />
        </button>
        <AgencyDetailsModal agencyId={agencyId} isOpen={isOpen} onClose={() => setIsOpen(false)} />
      </>
    );
  }

  // Default: list-item
  return (
    <>
      <li
        onClick={handleClick}
        className={cn(
          "p-3 rounded-lg border border-transparent hover:border-green-300 hover:bg-green-50 transition-all cursor-pointer group flex items-center justify-between",
          className
        )}
      >
        <div className="flex items-center gap-3 flex-1">
          <Building2 className="w-4 h-4 text-green-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm group-hover:text-green-700">{agencyName}</p>
            {(jurisdiction || agencyType) && (
              <p className="text-xs text-gray-600 mt-0.5">
                {jurisdiction && <span>{jurisdiction}</span>}
                {jurisdiction && agencyType && <span> • </span>}
                {agencyType && <span className="capitalize">{agencyType}</span>}
              </p>
            )}
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-green-600 flex-shrink-0 ml-2" />
      </li>
      <AgencyDetailsModal agencyId={agencyId} isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
