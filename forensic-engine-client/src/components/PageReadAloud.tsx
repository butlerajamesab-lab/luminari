import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Volume2, Pause, Square, ChevronDown, Headphones } from "lucide-react";
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
  buildStructuralAnnouncement,
  type ForensicReadAloudContext,
} from "@/lib/forensicReadAloud";

interface PageReadAloudProps {
  /** The full text content to read aloud for the current page/section. */
  text: string;
  /** Pre-formatted forensic text. Overrides text. */
  forensicText?: string;
  /** Forensic context for structural announcements. */
  context?: ForensicReadAloudContext;
  /** Label shown on the button. */
  label?: string;
}

/**
 * A prominent, discoverable Read Aloud button for page-level content.
 * Renders as a visible card/banner with headphones icon — not a ghost button.
 */
export default function PageReadAloud({
  text,
  forensicText,
  context,
  label = "Listen to this page",
}: PageReadAloudProps) {
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

  const buildFinalText = useCallback(() => {
    const spokenText = forensicText || text;
    if (!spokenText) return "";

    let finalText = wrapWithCompletion(spokenText);
    finalText = withPlainLanguageAnnouncement(finalText, isPlainLanguage);

    if (context) {
      const announcement = buildStructuralAnnouncement(context);
      if (announcement) {
        finalText = `${announcement} ${finalText}`;
      }
    }

    return finalText;
  }, [text, forensicText, context, isPlainLanguage]);

  const play = useCallback(() => {
    const finalText = buildFinalText();
    if (!finalText || !window.speechSynthesis) return;

    if (isPaused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
      return;
    }

    stop();

    const utterance = new SpeechSynthesisUtterance(finalText);
    utterance.rate = rate;
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
  }, [buildFinalText, rate, isPaused, stop]);

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

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20">
      <Headphones className="h-4 w-4 text-primary shrink-0" />

      {!isPlaying ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-3 text-xs gap-1.5 text-primary hover:text-primary hover:bg-primary/10"
          onClick={play}
        >
          <Volume2 className="h-3.5 w-3.5" />
          {label}
        </Button>
      ) : (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs gap-1 text-primary"
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
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={stop}
          >
            <Square className="h-3 w-3" />
          </Button>
          {/* Playback indicator */}
          <span className="text-[10px] text-primary/60 font-mono ml-1">
            {isPaused ? "Paused" : "Playing..."}
          </span>
        </div>
      )}

      {/* Speed control */}
      <div className="ml-auto">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-0.5 text-muted-foreground">
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
                      const finalText = buildFinalText();
                      if (!finalText) return;
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
    </div>
  );
}
