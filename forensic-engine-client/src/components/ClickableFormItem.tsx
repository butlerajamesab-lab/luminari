/**
 * ClickableFormItem Component
 * Wraps form items with click handlers to open detail modal
 * Replaces static form references with interactive elements
 */

import React, { useState } from "react";
import { FileText, ExternalLink } from "lucide-react";
import { FormDetailsModal } from "./FormDetailsModal";
import { cn } from "@/lib/utils";

interface ClickableFormItemProps {
  formId: string;
  formName: string;
  filingDeadline?: string;
  accessMethods?: string[];
  className?: string;
  variant?: "card" | "list-item" | "inline";
}

export function ClickableFormItem({
  formId,
  formName,
  filingDeadline,
  accessMethods,
  className,
  variant = "list-item",
}: ClickableFormItemProps) {
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
            "p-4 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all cursor-pointer group",
            className
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-blue-600" />
                <h4 className="font-semibold text-sm group-hover:text-blue-700">{formName}</h4>
              </div>
              {filingDeadline && <p className="text-xs text-gray-600">Deadline: {filingDeadline}</p>}
              {accessMethods && accessMethods.length > 0 && (
                <div className="flex gap-1 mt-2">
                  {accessMethods.map((method) => (
                    <span key={method} className="text-xs bg-gray-100 px-2 py-1 rounded">
                      {method}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-blue-600 flex-shrink-0" />
          </div>
        </div>
        <FormDetailsModal formId={formId} isOpen={isOpen} onClose={() => setIsOpen(false)} />
      </>
    );
  }

  if (variant === "inline") {
    return (
      <>
        <button
          onClick={handleClick}
          className={cn(
            "text-blue-600 hover:text-blue-800 hover:underline font-medium inline-flex items-center gap-1 transition-colors",
            className
          )}
        >
          {formName}
          <ExternalLink className="w-3 h-3" />
        </button>
        <FormDetailsModal formId={formId} isOpen={isOpen} onClose={() => setIsOpen(false)} />
      </>
    );
  }

  // Default: list-item
  return (
    <>
      <li
        onClick={handleClick}
        className={cn(
          "p-3 rounded-lg border border-transparent hover:border-blue-300 hover:bg-blue-50 transition-all cursor-pointer group flex items-center justify-between",
          className
        )}
      >
        <div className="flex items-center gap-3 flex-1">
          <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm group-hover:text-blue-700">{formName}</p>
            {filingDeadline && <p className="text-xs text-gray-600 mt-0.5">Deadline: {filingDeadline}</p>}
          </div>
        </div>
        <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-blue-600 flex-shrink-0 ml-2" />
      </li>
      <FormDetailsModal formId={formId} isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
