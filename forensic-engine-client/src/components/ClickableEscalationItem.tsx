/**
 * ClickableEscalationItem Component
 * Wraps escalation path items with click handlers to open detail modal
 */

import React, { useState } from "react";
import { ArrowRight, AlertCircle } from "lucide-react";
import { EscalationDetailsModal } from "./EscalationDetailsModal";
import { cn } from "@/lib/utils";

interface ClickableEscalationItemProps {
  escalationId: string;
  fromAgencyName: string;
  toAgencyName: string;
  triggerCondition?: string;
  className?: string;
  variant?: "card" | "list-item" | "inline";
}

export function ClickableEscalationItem({
  escalationId,
  fromAgencyName,
  toAgencyName,
  triggerCondition,
  className,
  variant = "list-item",
}: ClickableEscalationItemProps) {
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
            "p-4 rounded-lg border border-gray-200 hover:border-purple-400 hover:bg-purple-50 transition-all cursor-pointer group",
            className
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              {triggerCondition && (
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <p className="text-xs text-amber-700 font-medium">{triggerCondition}</p>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-gray-900 truncate">{fromAgencyName}</span>
                <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="font-medium text-gray-900 truncate">{toAgencyName}</span>
              </div>
            </div>
          </div>
        </div>
        <EscalationDetailsModal escalationId={escalationId} isOpen={isOpen} onClose={() => setIsOpen(false)} />
      </>
    );
  }

  if (variant === "inline") {
    return (
      <>
        <button
          onClick={handleClick}
          className={cn(
            "text-purple-600 hover:text-purple-800 hover:underline font-medium inline-flex items-center gap-1 transition-colors",
            className
          )}
        >
          {fromAgencyName}
          <ArrowRight className="w-3 h-3" />
          {toAgencyName}
        </button>
        <EscalationDetailsModal escalationId={escalationId} isOpen={isOpen} onClose={() => setIsOpen(false)} />
      </>
    );
  }

  // Default: list-item
  return (
    <>
      <li
        onClick={handleClick}
        className={cn(
          "p-3 rounded-lg border border-transparent hover:border-purple-300 hover:bg-purple-50 transition-all cursor-pointer group",
          className
        )}
      >
        {triggerCondition && (
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <p className="text-xs text-amber-700 font-medium">{triggerCondition}</p>
          </div>
        )}
        <div className="flex items-center gap-2 justify-between">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="font-medium text-sm text-gray-900 truncate">{fromAgencyName}</span>
            <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="font-medium text-sm text-gray-900 truncate">{toAgencyName}</span>
          </div>
        </div>
      </li>
      <EscalationDetailsModal escalationId={escalationId} isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
