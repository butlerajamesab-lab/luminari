/**
 * VoiceReadout — Standalone Web Speech API component
 *
 * For public pages (Docket Room, Anomaly Viewfinder) that have no caseId context.
 * Reads provided text aloud using the browser's SpeechSynthesis API.
 *
 * Accessibility-first: works without any backend, no API keys needed.
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { Volume2, VolumeX, Pause, Play, Square, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VoiceReadoutProps {
  /** The text to read aloud */
  text: string;
  /** Optional label shown in the bar */
  label?: string;
  /** Compact mode — just the icon button */
  compact?: boolean;
  /** Auto-read when mounted (for accessibility auto-read on intake) */
  autoRead?: boolean;
  /** Called when reading completes */
  onComplete?: () => void;
  /** Style override for the container */
  className?: string;
}

type ReadStatus = "idle" | "loading" | "reading" | "paused" | "done" | "error" | "unsupported";

export function VoiceReadout({
  text,
  label = "Read Aloud",
  compact = false,
  autoRead = false,
  onComplete,
  className = "",
}: VoiceReadoutProps) {
  const [status, setStatus] = useState<ReadStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const cancelledRef = useRef(false);

  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  const stop = useCallback(() => {
    cancelledRef.current = true;
    if (supported) window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setStatus("idle");
  }, [supported]);

  const read = useCallback(() => {
    if (!supported) {
      setStatus("unsupported");
      return;
    }
    if (!text?.trim()) {
      setStatus("error");
      setErrorMsg("No content to read.");
      return;
    }

    // Cancel any existing speech
    window.speechSynthesis.cancel();
    cancelledRef.current = false;
    setStatus("loading");

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.92;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Prefer a natural-sounding voice if available
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(
      (v) =>
        v.lang.startsWith("en") &&
        (v.name.includes("Natural") || v.name.includes("Neural") || v.name.includes("Enhanced") || v.name.includes("Samantha") || v.name.includes("Google"))
    );
    if (preferred) utterance.voice = preferred;

    utterance.onstart = () => {
      if (!cancelledRef.current) setStatus("reading");
    };
    utterance.onpause = () => {
      if (!cancelledRef.current) setStatus("paused");
    };
    utterance.onresume = () => {
      if (!cancelledRef.current) setStatus("reading");
    };
    utterance.onend = () => {
      if (!cancelledRef.current) {
        setStatus("done");
        onComplete?.();
      }
    };
    utterance.onerror = (e) => {
      if (!cancelledRef.current && e.error !== "interrupted") {
        setStatus("error");
        setErrorMsg("Speech failed. Your browser may not support this feature.");
      }
    };

    utteranceRef.current = utterance;
    // Small delay to allow voices to load
    setTimeout(() => {
      if (!cancelledRef.current) {
        setStatus("reading");
        window.speechSynthesis.speak(utterance);
      }
    }, 100);
  }, [text, supported, onComplete]);

  const pause = useCallback(() => {
    if (supported && status === "reading") {
      window.speechSynthesis.pause();
      setStatus("paused");
    }
  }, [supported, status]);

  const resume = useCallback(() => {
    if (supported && status === "paused") {
      window.speechSynthesis.resume();
      setStatus("reading");
    }
  }, [supported, status]);

  // Auto-read on mount if requested
  useEffect(() => {
    if (autoRead && supported && text?.trim()) {
      const timer = setTimeout(() => read(), 300);
      return () => clearTimeout(timer);
    }
  }, [autoRead, supported]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      if (supported) window.speechSynthesis.cancel();
    };
  }, [supported]);

  if (!supported) {
    return compact ? null : (
      <div className={`flex items-center gap-2 text-xs text-muted-foreground ${className}`}>
        <VolumeX className="h-3.5 w-3.5" />
        <span>Voice readout not supported in this browser.</span>
      </div>
    );
  }

  const isActive = status === "reading" || status === "paused";

  if (compact) {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        {status === "loading" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {status === "idle" || status === "done" ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={read}
            className="h-7 w-7 p-0"
            title="Read aloud"
            aria-label="Read aloud"
          >
            <Volume2 className="h-3.5 w-3.5" />
          </Button>
        ) : null}
        {status === "reading" && (
          <>
            <Button variant="ghost" size="sm" onClick={pause} className="h-7 w-7 p-0" aria-label="Pause">
              <Pause className="h-3.5 w-3.5 text-primary" />
            </Button>
            <Button variant="ghost" size="sm" onClick={stop} className="h-7 w-7 p-0" aria-label="Stop">
              <Square className="h-3 w-3" />
            </Button>
          </>
        )}
        {status === "paused" && (
          <>
            <Button variant="ghost" size="sm" onClick={resume} className="h-7 w-7 p-0" aria-label="Resume">
              <Play className="h-3.5 w-3.5 text-amber-400" />
            </Button>
            <Button variant="ghost" size="sm" onClick={stop} className="h-7 w-7 p-0" aria-label="Stop">
              <Square className="h-3 w-3" />
            </Button>
          </>
        )}
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border bg-muted/20 ${
        isActive ? "border-primary/30" : "border-border/40"
      } ${className}`}
      role="region"
      aria-label="Voice readout controls"
    >
      {/* Status icon */}
      <div className="shrink-0">
        {status === "loading" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {status === "reading" && <Volume2 className="h-4 w-4 text-primary animate-pulse" />}
        {status === "paused" && <Pause className="h-4 w-4 text-amber-400" />}
        {(status === "idle" || status === "done") && <Volume2 className="h-4 w-4 text-muted-foreground" />}
        {status === "error" && <VolumeX className="h-4 w-4 text-destructive" />}
      </div>

      {/* Label */}
      <span className="text-xs text-muted-foreground flex-1 truncate">
        {status === "idle" && label}
        {status === "loading" && "Preparing..."}
        {status === "reading" && "Reading aloud..."}
        {status === "paused" && "Paused"}
        {status === "done" && "Readout complete"}
        {status === "error" && (errorMsg || "Error")}
      </span>

      {/* Controls */}
      <div className="flex items-center gap-1 shrink-0">
        {(status === "idle" || status === "done") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={read}
            className="h-7 px-2 text-xs gap-1"
            aria-label="Start reading"
          >
            <Play className="h-3 w-3" />
            {!compact && "Read"}
          </Button>
        )}
        {status === "reading" && (
          <>
            <Button variant="ghost" size="sm" onClick={pause} className="h-7 w-7 p-0" aria-label="Pause">
              <Pause className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" onClick={stop} className="h-7 w-7 p-0" aria-label="Stop">
              <Square className="h-3 w-3" />
            </Button>
          </>
        )}
        {status === "paused" && (
          <>
            <Button variant="ghost" size="sm" onClick={resume} className="h-7 w-7 p-0" aria-label="Resume">
              <Play className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" onClick={stop} className="h-7 w-7 p-0" aria-label="Stop">
              <Square className="h-3 w-3" />
            </Button>
          </>
        )}
      </div>

      {/* Screen reader live region */}
      <span className="sr-only" role="status" aria-live="polite">
        {status === "reading" ? "Reading aloud" : status === "done" ? "Readout complete" : ""}
      </span>
    </div>
  );
}
