import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface PlainLanguageContextValue {
  enabled: boolean;
  toggle: () => void;
}

const PlainLanguageContext = createContext<PlainLanguageContextValue>({
  enabled: false,
  toggle: () => {},
});

export function PlainLanguageProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem("plainLanguage") === "true";
    } catch {
      return false;
    }
  });

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("plainLanguage", String(next));
      } catch {}
      return next;
    });
  }, []);

  return (
    <PlainLanguageContext.Provider value={{ enabled, toggle }}>
      {children}
    </PlainLanguageContext.Provider>
  );
}

export function usePlainLanguage() {
  return useContext(PlainLanguageContext);
}
