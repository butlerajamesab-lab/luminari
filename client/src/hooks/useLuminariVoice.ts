/**
 * useLuminariVoice Hook
 *
 * Provides voice narration for forensic data modules.
 * Wires the voice adapter → narrative synthesis → Web Speech API pipeline.
 *
 * Architecture:
 * 1. Adapter fetches + validates data from tRPC endpoints
 * 2. Synthesis transforms validated data into spoken text
 * 3. Web Speech API (SpeechSynthesis) reads the text aloud
 *
 * Rules:
 * - Projection-only: no mutations, no writes
 * - Data-gated: refuses to narrate insufficient data
 * - Graceful degradation: falls back to text display if speech unavailable
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import {
  getCaseNarrationInput,
  getSignalNarrationInput,
  getPatternNarrationInput,
} from "@/lib/voice/voiceAdapter";
import {
  synthesizeCaseNarration,
  synthesizeSignalNarration,
  synthesizePatternNarration,
} from "@/lib/voice/narrativeSynthesis";
import type { NarrationResult } from "@/lib/voice/narrativeSynthesis";

// ─── Types ───

export type VoiceStatus =
  | "idle"
  | "loading"
  | "narrating"
  | "paused"
  | "complete"
  | "gated"
  | "error"
  | "unsupported";

export type NarrationTarget =
  | { type: "case"; caseId: number }
  | { type: "signal"; caseId: number; signalId: number }
  | { type: "pattern"; caseId: number; patternId: number };

export interface UseLuminariVoiceReturn {
  /** Current voice status */
  status: VoiceStatus;
  /** The narration result (text, sections, data status) */
  narration: NarrationResult | null;
  /** Start narrating a target */
  narrate: (target: NarrationTarget, options?: NarrationOptions) => Promise<void>;
  /** Pause current narration */
  pause: () => void;
  /** Resume paused narration */
  resume: () => void;
  /** Stop and reset */
  stop: () => void;
  /** Whether Web Speech API is available */
  speechAvailable: boolean;
  /** Current section being narrated (index) */
  currentSectionIndex: number;
  /** Error message if status is "error" */
  errorMessage: string | null;
}

export interface NarrationOptions {
  /** Allow narration even with partial data */
  allowPartial?: boolean;
  /** Speech rate (0.5 - 2.0, default 0.9) */
  rate?: number;
  /** Speech pitch (0 - 2.0, default 1.0) */
  pitch?: number;
  /** Preferred voice name (if available) */
  voiceName?: string;
  /** Text-only mode — skip speech, just produce text */
  textOnly?: boolean;
}

// ─── Hook ───

export function useLuminariVoice(): UseLuminariVoiceReturn {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [narration, setNarration] = useState<NarrationResult | null>(null);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const isCancelledRef = useRef(false);

  // Check speech availability
  const speechAvailable = typeof window !== "undefined" && "speechSynthesis" in window;

  // Build a tRPC client interface for the adapter
  const trpcClient = trpc.useUtils();

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (speechAvailable) {
        window.speechSynthesis.cancel();
      }
    };
  }, [speechAvailable]);

  /**
   * Start narrating a target module.
   */
  const narrate = useCallback(
    async (target: NarrationTarget, options: NarrationOptions = {}) => {
      // Reset state
      isCancelledRef.current = false;
      setErrorMessage(null);
      setCurrentSectionIndex(0);
      setStatus("loading");

      try {
        // Step 1: Fetch + validate via adapter
        let result: NarrationResult;

        const clientProxy = {
          cases: { get: { query: (input: { id: number }) => trpcClient.cases.get.fetch(input) } },
          flags: { list: { query: (input: { caseId: number }) => trpcClient.flags.list.fetch(input) } },
          patterns: { forCase: { query: (input: { caseId: number }) => trpcClient.patterns.forCase.fetch(input) } },
          analyze: {
            getIntakeSpineStatus: { query: (input: { caseId: number }) => trpcClient.analyze.getIntakeSpineStatus.fetch(input) },
            getIntakeVerificationProjection: { query: (input: { caseId: number }) => trpcClient.analyze.getIntakeVerificationProjection.fetch(input) },
          },
        };

        if (target.type === "case") {
          const adapterInput = await getCaseNarrationInput(clientProxy, target.caseId);
          result = synthesizeCaseNarration(adapterInput, { allowPartial: options.allowPartial });
        } else if (target.type === "signal") {
          const adapterInput = await getSignalNarrationInput(clientProxy, target.caseId, target.signalId);
          result = synthesizeSignalNarration(adapterInput);
        } else if (target.type === "pattern") {
          const adapterInput = await getPatternNarrationInput(clientProxy, target.caseId, target.patternId);
          result = synthesizePatternNarration(adapterInput);
        } else {
          throw new Error("Unknown narration target type.");
        }

        if (isCancelledRef.current) return;

        setNarration(result);

        // Step 2: Check if gated
        if (result.status === "gated") {
          setStatus("gated");
          return;
        }

        // Step 3: Speak or text-only
        if (options.textOnly || !speechAvailable) {
          setStatus("complete");
          return;
        }

        // Step 4: Web Speech API narration
        setStatus("narrating");
        await speakText(result.text, {
          rate: options.rate ?? 0.9,
          pitch: options.pitch ?? 1.0,
          voiceName: options.voiceName,
          onSectionChange: (idx: number) => setCurrentSectionIndex(idx),
          isCancelled: isCancelledRef,
        });

        if (!isCancelledRef.current) {
          setStatus("complete");
        }
      } catch (err) {
        if (!isCancelledRef.current) {
          setStatus("error");
          setErrorMessage(err instanceof Error ? err.message : "Narration failed.");
        }
      }
    },
    [trpcClient, speechAvailable]
  );

  const pause = useCallback(() => {
    if (speechAvailable && window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      setStatus("paused");
    }
  }, [speechAvailable]);

  const resume = useCallback(() => {
    if (speechAvailable && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setStatus("narrating");
    }
  }, [speechAvailable]);

  const stop = useCallback(() => {
    isCancelledRef.current = true;
    if (speechAvailable) {
      window.speechSynthesis.cancel();
    }
    setStatus("idle");
    setNarration(null);
    setCurrentSectionIndex(0);
    setErrorMessage(null);
  }, [speechAvailable]);

  return {
    status,
    narration,
    narrate,
    pause,
    resume,
    stop,
    speechAvailable,
    currentSectionIndex,
    errorMessage,
  };
}

// ─── Speech Helper ───

function speakText(
  text: string,
  options: {
    rate: number;
    pitch: number;
    voiceName?: string;
    onSectionChange: (idx: number) => void;
    isCancelled: React.MutableRefObject<boolean>;
  }
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (options.isCancelled.current) {
      resolve();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = options.rate;
    utterance.pitch = options.pitch;
    utterance.lang = "en-US";

    // Try to find preferred voice
    if (options.voiceName) {
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find((v) => v.name.includes(options.voiceName!));
      if (preferred) utterance.voice = preferred;
    }

    utterance.onend = () => resolve();
    utterance.onerror = (event) => {
      if (event.error === "canceled" || event.error === "interrupted") {
        resolve();
      } else {
        reject(new Error(`Speech synthesis error: ${event.error}`));
      }
    };

    // Track section boundaries via word boundaries
    let charIndex = 0;
    utterance.onboundary = (event) => {
      if (event.name === "sentence") {
        charIndex = event.charIndex;
        // Rough section tracking based on "End of readout" markers
        const spoken = text.substring(0, charIndex);
        const sectionBreaks = spoken.split(/\.\s+/).length;
        options.onSectionChange(Math.floor(sectionBreaks / 5)); // Approximate
      }
    };

    window.speechSynthesis.speak(utterance);
  });
}
