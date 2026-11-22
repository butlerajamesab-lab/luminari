/**
 * ClickToReadContext — Global Click-to-Read Accessibility Feature
 *
 * When enabled, clicking any text content on the page reads it aloud
 * using the browser's Web Speech API.
 *
 * - Single click: reads the clicked element's text
 * - Double click: reads the nearest paragraph/section
 * - Works on every page automatically once wired into main.tsx
 * - No backend, no API keys, no credits consumed
 */
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { Square } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────
interface ClickToReadContextValue {
  enabled: boolean;
  toggle: () => void;
  isSpeaking: boolean;
  stop: () => void;
}

const ClickToReadContext = createContext<ClickToReadContextValue>({
  enabled: false,
  toggle: () => {},
  isSpeaking: false,
  stop: () => {},
});

export function useClickToRead() {
  return useContext(ClickToReadContext);
}

// ── Tags that should never be read on click ────────────────────────────
const SKIP_TAGS = new Set([
  "SCRIPT", "STYLE", "META", "HEAD", "HTML", "BODY",
  "INPUT", "TEXTAREA", "SELECT", "OPTION",
  "SVG", "PATH", "CIRCLE", "RECT", "LINE", "POLYLINE", "POLYGON",
]);

// ── Tags that are interactive — read their accessible label instead ────
const INTERACTIVE_TAGS = new Set(["BUTTON", "A", "LABEL"]);

// ── Roles that should be skipped ──────────────────────────────────────
const SKIP_ROLES = new Set(["navigation", "menu", "menubar", "toolbar", "banner"]);

/**
 * Extract the best readable text from a clicked element.
 * Walks up the DOM tree to find meaningful content.
 */
function extractText(target: Element): string | null {
  let el: Element | null = target;

  // Walk up to find a meaningful text container
  for (let i = 0; i < 6 && el; i++) {
    const tag = el.tagName;
    const role = el.getAttribute("role") || "";

    // Skip non-content elements
    if (SKIP_TAGS.has(tag)) return null;
    if (SKIP_ROLES.has(role)) return null;

    // For interactive elements, use aria-label or text content
    if (INTERACTIVE_TAGS.has(tag)) {
      const label = el.getAttribute("aria-label") || el.textContent?.trim();
      return label && label.length > 1 ? label : null;
    }

    // For content elements, get the text
    const text = el.textContent?.trim();
    if (text && text.length > 3) {
      // Prefer the element itself if it has good content
      // but cap at ~500 chars to avoid reading entire sections
      return text.slice(0, 500);
    }

    el = el.parentElement;
  }

  return null;
}

/**
 * On double-click, walk up to find the nearest block container
 * and read the full section.
 */
function extractSectionText(target: Element): string | null {
  const BLOCK_TAGS = new Set(["P", "LI", "TD", "TH", "BLOCKQUOTE", "ARTICLE", "SECTION", "DIV", "H1", "H2", "H3", "H4", "H5", "H6"]);
  let el: Element | null = target;

  for (let i = 0; i < 8 && el; i++) {
    if (BLOCK_TAGS.has(el.tagName)) {
      const text = el.textContent?.trim();
      if (text && text.length > 10) {
        return text.slice(0, 1200);
      }
    }
    el = el.parentElement;
  }

  return null;
}

// ── Provider ───────────────────────────────────────────────────────────
export function ClickToReadProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const lastClickTime = useRef<number>(0);
  const lastClickTarget = useRef<Element | null>(null);
  const cancelledRef = useRef(false);

  const speak = useCallback((text: string) => {
    if (!text?.trim() || typeof window === "undefined" || !("speechSynthesis" in window)) return;

    cancelledRef.current = false;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Prefer a natural voice
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(
      (v) =>
        v.lang.startsWith("en") &&
        (v.name.includes("Natural") ||
          v.name.includes("Neural") ||
          v.name.includes("Enhanced") ||
          v.name.includes("Samantha") ||
          v.name.includes("Google"))
    );
    if (preferred) utterance.voice = preferred;

    utterance.onstart = () => { if (!cancelledRef.current) setIsSpeaking(true); };
    utterance.onend = () => { if (!cancelledRef.current) setIsSpeaking(false); };
    utterance.onerror = (e) => {
      if (e.error !== "interrupted") setIsSpeaking(false);
    };

    window.speechSynthesis.speak(utterance);
  }, []);

  const stop = useCallback(() => {
    cancelledRef.current = true;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, []);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      if (prev) stop(); // stop speech when disabling
      return !prev;
    });
  }, [stop]);

  // ── Global click handler ─────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target) return;

      const now = Date.now();
      const isDoubleClick =
        now - lastClickTime.current < 400 &&
        lastClickTarget.current === target;

      lastClickTime.current = now;
      lastClickTarget.current = target;

      // Double-click: read the whole section
      if (isDoubleClick) {
        const text = extractSectionText(target);
        if (text) {
          e.preventDefault();
          e.stopPropagation();
          speak(text);
        }
        return;
      }

      // Single click: read the element text
      const text = extractText(target);
      if (text) {
        speak(text);
      }
    };

    // Use capture phase so we intercept before other handlers
    document.addEventListener("click", handleClick, { capture: true, passive: false });

    return () => {
      document.removeEventListener("click", handleClick, { capture: true });
    };
  }, [enabled, speak]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return (
    <ClickToReadContext.Provider value={{ enabled, toggle, isSpeaking, stop }}>
      {children}
      {/* Floating accessibility toggle — always visible */}
      <ClickToReadFloatingButton />
    </ClickToReadContext.Provider>
  );
}

// ── Floating stop control ──────────────────────────────────────────────
// The enable/disable toggle lives in the Luminari Helper panel (owner
// direction 2026-11-22: less is more — the permanent floating speaker
// button covered page text). The only control that still floats is Stop
// reading, and only while speech is actually playing: it is transient,
// and it has to be reachable the moment someone wants the reading stopped.
function ClickToReadFloatingButton() {
  const { isSpeaking, stop } = useClickToRead();

  if (!isSpeaking) return null;

  return (
    <div
      className="fixed bottom-20 left-4 z-[99999] md:bottom-6 md:left-6"
      aria-label="Accessibility controls"
    >
      <button
        onClick={stop}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.4rem",
          background: "rgba(74,140,199,0.15)",
          border: "1px solid rgba(74,140,199,0.4)",
          borderRadius: "20px",
          padding: "0.35rem 0.75rem",
          fontSize: "0.72rem",
          color: "#58a6ff",
          cursor: "pointer",
          fontFamily: "'IBM Plex Mono', monospace",
          letterSpacing: "0.03em",
          whiteSpace: "nowrap",
        }}
        aria-label="Stop reading"
        title="Stop reading"
      >
        <Square size={10} />
        Stop reading
      </button>
    </div>
  );
}
