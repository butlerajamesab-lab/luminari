import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Volume2, Pause, Square, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePlainLanguage } from "@/contexts/PlainLanguageContext";
import {
  wrapWithCompletion,
  withPlainLanguageAnnouncement,
  type ForensicReadAloudContext,
} from "@/lib/forensicReadAloud";

interface ReadAloudProps {
  /** The text to read aloud. If forensicText is provided, this is used as fallback. */
  text: string;
  /** Pre-formatted forensic text (attribution-first, with quote markers). Overrides text. */
  forensicText?: string;
  /** Forensic context for structural announcements. */
  context?: ForensicReadAloudContext;
  label?: string;
  size?: "sm" | "default";
}

export default function ReadAloud({
  text,
  forensicText,
  context,
  label = "Read Aloud",
  size = "sm",
}: ReadAloudProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [rate, setRate] = useState(1);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const { enabled: isPlainLanguage } = usePlainLanguage();

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setIsPaused(false);
    utteranceRef.current = null;
  }, []);

  const play = useCallback(() => {
    const spokenText = forensicText || text;
    if (!spokenText || !window.speechSynthesis) return;

    if (isPaused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
      return;
    }

    stop();

    // Build forensic read-aloud text
    let finalText = forensicText
      ? wrapWithCompletion(forensicText)
      : wrapWithCompletion(spokenText);

    // Add plain language announcement if active
    finalText = withPlainLanguageAnnouncement(finalText, isPlainLanguage);

    // Add structural announcement prefix if context provided
    if (context) {
      const announcements: string[] = [];
      if (context.caseName) announcements.push(`Case: ${context.caseName}.`);
      if (context.documentName) announcements.push(`Document: ${context.documentName}.`);
      if (context.sectionName) announcements.push(`Section: ${context.sectionName}.`);
      if (announcements.length > 0) {
        finalText = `${announcements.join(" ")} ${finalText}`;
      }
    }

    const utterance = new SpeechSynthesisUtterance(finalText);
    utterance.rate = rate;
    // Neutral, measured cadence
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    utterance.onend = () => {
      setIsPlaying(false);
      setIsPaused(false);
    };
    utterance.onerror = () => {
      setIsPlaying(false);
      setIsPaused(false);
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setIsPlaying(true);
  }, [text, forensicText, context, rate, isPaused, stop, isPlainLanguage]);

  const pause = useCallback(() => {
    window.speechSynthesis.pause();
    setIsPaused(true);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  const spokenText = forensicText || text;
  if (!spokenText || typeof window === "undefined" || !window.speechSynthesis) {
    return null;
  }

  const btnSize = size === "sm" ? "h-7 px-2 text-xs" : "h-8 px-3 text-sm";

  return (
    <div className="flex items-center gap-1">
      {!isPlaying ? (
        <Button
          variant="ghost"
          className={`${btnSize} gap-1.5 text-muted-foreground hover:text-foreground`}
          onClick={play}
        >
          <Volume2 className="h-3.5 w-3.5" />
          {label}
        </Button>
      ) : (
        <>
          <Button
            variant="ghost"
            className={`${btnSize} gap-1 text-primary`}
            onClick={isPaused ? play : pause}
          >
            {isPaused ? (
              <Volume2 className="h-3.5 w-3.5" />
            ) : (
              <Pause className="h-3.5 w-3.5" />
            )}
            {isPaused ? "Resume" : "Pause"}
          </Button>
          <Button
            variant="ghost"
            className={`${btnSize} text-muted-foreground hover:text-foreground`}
            onClick={stop}
          >
            <Square className="h-3 w-3" />
          </Button>
        </>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className={`${btnSize} gap-0.5 text-muted-foreground`}>
            {rate}x
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {[0.75, 1, 1.25, 1.5, 2].map((r) => (
            <DropdownMenuItem
              key={r}
              onClick={() => {
                setRate(r);
                if (isPlaying) {
                  stop();
                  setTimeout(() => {
                    let finalText = forensicText
                      ? wrapWithCompletion(forensicText)
                      : wrapWithCompletion(spokenText);
                    finalText = withPlainLanguageAnnouncement(finalText, isPlainLanguage);
                    const u = new SpeechSynthesisUtterance(finalText);
                    u.rate = r;
                    u.pitch = 1.0;
                    u.onend = () => { setIsPlaying(false); setIsPaused(false); };
                    utteranceRef.current = u;
                    window.speechSynthesis.speak(u);
                    setIsPlaying(true);
                  }, 50);
                }
              }}
              className={rate === r ? "bg-accent" : ""}
            >
              {r}x
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
