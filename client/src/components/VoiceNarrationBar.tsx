/**
 * VoiceNarrationBar — Compact voice narration control for forensic modules.
 *
 * Renders a status bar with play/pause/stop controls and narration text.
 * Uses useLuminariVoice hook internally.
 *
 * Usage:
 *   <VoiceNarrationBar target={{ type: "case", caseId: 7 }} />
 *   <VoiceNarrationBar target={{ type: "signal", caseId: 7, signalId: 42 }} />
 *   <VoiceNarrationBar target={{ type: "pattern", caseId: 7, patternId: 3 }} />
 *
 * Data gating: If data is insufficient, shows a disabled state with reason.
 * Empty modules: Guarded — won't attempt narration if no data.
 */

import { useState } from "react";
import { Volume2, VolumeX, Pause, Play, Square, AlertTriangle, Loader2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLuminariVoice } from "@/hooks/useLuminariVoice";
import type { NarrationTarget, NarrationOptions } from "@/hooks/useLuminariVoice";

interface VoiceNarrationBarProps {
  /** The narration target — case, signal, or pattern */
  target: NarrationTarget;
  /** Allow narration with partial data */
  allowPartial?: boolean;
  /** Compact mode — smaller bar */
  compact?: boolean;
  /** Custom class name */
  className?: string;
}

export function VoiceNarrationBar({
  target,
  allowPartial = false,
  compact = false,
  className = "",
}: VoiceNarrationBarProps) {
  const voice = useLuminariVoice();
  const [showTranscript, setShowTranscript] = useState(false);

  const handlePlay = () => {
    const options: NarrationOptions = { allowPartial };
    voice.narrate(target, options);
  };

  const handleTextOnly = () => {
    voice.narrate(target, { allowPartial, textOnly: true });
    setShowTranscript(true);
  };

  // Status label for ARIA
  const statusLabel = {
    idle: "Voice narration ready",
    loading: "Loading narration data",
    narrating: "Narrating",
    paused: "Narration paused",
    complete: "Narration complete",
    gated: "Narration unavailable — insufficient data",
    error: "Narration error",
    unsupported: "Voice narration not supported in this browser",
  }[voice.status];

  const isActive = voice.status === "narrating" || voice.status === "paused";
  const isIdle = voice.status === "idle" || voice.status === "complete";

  return (
    <div
      className={`rounded-lg border border-border/50 bg-card/50 ${className}`}
      role="region"
      aria-label="Voice narration controls"
      aria-live="polite"
    >
      {/* Control Bar */}
      <div className={`flex items-center gap-2 ${compact ? "px-2 py-1.5" : "px-3 py-2"}`}>
        {/* Status Icon */}
        <div className="shrink-0" aria-hidden="true">
          {voice.status === "loading" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {voice.status === "narrating" && <Volume2 className="h-4 w-4 text-primary animate-pulse" />}
          {voice.status === "paused" && <Pause className="h-4 w-4 text-amber-500" />}
          {voice.status === "gated" && <AlertTriangle className="h-4 w-4 text-amber-500" />}
          {voice.status === "error" && <AlertTriangle className="h-4 w-4 text-destructive" />}
          {isIdle && <Volume2 className="h-4 w-4 text-muted-foreground" />}
        </div>

        {/* Status Text */}
        <span className={`text-xs text-muted-foreground flex-1 truncate ${compact ? "" : "min-w-0"}`}>
          {voice.status === "idle" && "Voice Readout"}
          {voice.status === "loading" && "Preparing narration..."}
          {voice.status === "narrating" && (
            voice.narration?.sections[voice.currentSectionIndex]?.label || "Narrating..."
          )}
          {voice.status === "paused" && "Paused"}
          {voice.status === "complete" && "Readout complete"}
          {voice.status === "gated" && (voice.narration?.reason || "Insufficient data")}
          {voice.status === "error" && (voice.errorMessage || "Error")}
        </span>

        {/* Controls */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Play / Resume */}
          {(isIdle || voice.status === "gated") && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePlay}
                disabled={voice.status === "loading" || voice.status === "gated"}
                className="h-7 w-7 p-0"
                aria-label="Start voice narration"
              >
                <Play className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleTextOnly}
                disabled={voice.status === "loading"}
                className="h-7 w-7 p-0"
                aria-label="Show narration text"
                title="Text only"
              >
                <FileText className="h-3.5 w-3.5" />
              </Button>
            </>
          )}

          {voice.status === "paused" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={voice.resume}
              className="h-7 w-7 p-0"
              aria-label="Resume narration"
            >
              <Play className="h-3.5 w-3.5" />
            </Button>
          )}

          {/* Pause */}
          {voice.status === "narrating" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={voice.pause}
              className="h-7 w-7 p-0"
              aria-label="Pause narration"
            >
              <Pause className="h-3.5 w-3.5" />
            </Button>
          )}

          {/* Stop */}
          {isActive && (
            <Button
              variant="ghost"
              size="sm"
              onClick={voice.stop}
              className="h-7 w-7 p-0"
              aria-label="Stop narration"
            >
              <Square className="h-3.5 w-3.5" />
            </Button>
          )}

          {/* Mute indicator for unsupported */}
          {!voice.speechAvailable && voice.status === "idle" && (
            <VolumeX className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          )}

          {/* Transcript toggle */}
          {voice.narration && (voice.status === "complete" || voice.status === "narrating" || voice.status === "paused") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowTranscript(!showTranscript)}
              className="h-7 px-1.5 text-xs"
              aria-label={showTranscript ? "Hide transcript" : "Show transcript"}
            >
              {showTranscript ? "Hide" : "Text"}
            </Button>
          )}
        </div>
      </div>

      {/* Transcript Panel */}
      {showTranscript && voice.narration && (
        <div className="border-t border-border/30 px-3 py-2 max-h-48 overflow-y-auto">
          {voice.narration.sections.map((section, idx) => (
            <div key={idx} className="mb-2 last:mb-0">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                {section.label}
              </p>
              <p className={`text-xs leading-relaxed ${
                idx === voice.currentSectionIndex && voice.status === "narrating"
                  ? "text-foreground font-medium"
                  : "text-muted-foreground"
              }`}>
                {section.text}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Screen reader status */}
      <span className="sr-only" role="status" aria-live="assertive">
        {statusLabel}
      </span>
    </div>
  );
}
