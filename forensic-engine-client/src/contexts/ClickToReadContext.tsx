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
import { Volume2, VolumeX, Square } from "lucide-react";

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

// ── Floating Toggle Button ─────────────────────────────────────────────
function ClickToReadFloatingButton() {
  const { enabled, toggle, isSpeaking, stop } = useClickToRead();
  const [expanded, setExpanded] = useState(false);
  const [justEnabled, setJustEnabled] = useState(false);

  const handleToggle = () => {
    if (!enabled) {
      setJustEnabled(true);
      setTimeout(() => setJustEnabled(false), 3000);
    }
    toggle();
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: "1.5rem",
        left: "1.5rem",
        zIndex: 99999,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: "0.5rem",
        pointerEvents: "none",
      }}
      aria-label="Accessibility controls"
    >
      {/* Tooltip when just enabled */}
      {justEnabled && (
        <div
          style={{
            background: "rgba(15,20,30,0.95)",
            border: "1px solid rgba(74,140,199,0.4)",
            borderRadius: "8px",
            padding: "0.6rem 0.9rem",
            fontSize: "0.75rem",
            color: "#e8ecf0",
            maxWidth: "220px",
            lineHeight: 1.5,
            pointerEvents: "none",
            boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
          }}
          role="status"
          aria-live="polite"
        >
          <strong style={{ color: "#58a6ff" }}>Click-to-read on.</strong>
          <br />
          Tap any text to hear it.
          <br />
          Double-tap to read the full section.
        </div>
      )}

      {/* Speaking indicator */}
      {isSpeaking && (
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
            pointerEvents: "all",
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
      )}

      {/* Main toggle button */}
      <button
        onClick={handleToggle}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "2.75rem",
          height: "2.75rem",
          borderRadius: "50%",
          border: enabled
            ? "2px solid rgba(74,140,199,0.6)"
            : "2px solid rgba(255,255,255,0.12)",
          background: enabled
            ? "rgba(74,140,199,0.18)"
            : "rgba(15,20,30,0.85)",
          color: enabled ? "#58a6ff" : "rgba(255,255,255,0.4)",
          cursor: "pointer",
          pointerEvents: "all",
          transition: "all 0.2s ease",
          boxShadow: enabled
            ? "0 0 0 4px rgba(74,140,199,0.12), 0 4px 16px rgba(0,0,0,0.4)"
            : "0 2px 12px rgba(0,0,0,0.3)",
        }}
        aria-label={enabled ? "Click-to-read enabled. Click to disable." : "Enable click-to-read accessibility mode"}
        aria-pressed={enabled}
        title={enabled ? "Click-to-read: ON — tap any text to hear it" : "Enable click-to-read accessibility"}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.transform = "scale(1.08)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.transform = "scale(1)";
        }}
      >
        {enabled ? (
          <Volume2 size={18} />
        ) : (
          <VolumeX size={18} />
        )}
      </button>
    </div>
  );
}
