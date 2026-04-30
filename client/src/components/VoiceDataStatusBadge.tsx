/**
 * VoiceDataStatusBadge — Shows the data readiness status for voice narration.
 *
 * Displays a small badge indicating whether data is ready, partial, or insufficient.
 * Used alongside VoiceNarrationBar to inform users about data completeness.
 */

import { CheckCircle, AlertTriangle, XCircle } from "lucide-react";

interface VoiceDataStatusBadgeProps {
  dataStatus: "ready" | "partial_data" | "insufficient_data";
  reason?: string;
  className?: string;
}

export function VoiceDataStatusBadge({ dataStatus, reason, className = "" }: VoiceDataStatusBadgeProps) {
  const config = {
    ready: {
      icon: CheckCircle,
      label: "Data ready",
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
    },
    partial_data: {
      icon: AlertTriangle,
      label: "Partial data",
      color: "text-amber-500",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
    },
    insufficient_data: {
      icon: XCircle,
      label: "Insufficient data",
      color: "text-red-500",
      bg: "bg-red-500/10",
      border: "border-red-500/20",
    },
  }[dataStatus];

  const Icon = config.icon;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${config.bg} ${config.border} ${config.color} ${className}`}
      role="status"
      aria-label={`Voice data status: ${config.label}${reason ? `. ${reason}` : ""}`}
      title={reason || config.label}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>{config.label}</span>
    </div>
  );
}
