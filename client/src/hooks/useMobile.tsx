import * as React from "react";

const MOBILE_BREAKPOINT = 768;
const TOUCH_WORKSPACE_BREAKPOINT = 1100;
const MOBILE_MEDIA_QUERY =
  `(max-width: ${MOBILE_BREAKPOINT - 1}px), ` +
  `(pointer: coarse) and (max-width: ${TOUCH_WORKSPACE_BREAKPOINT}px)`;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(
    undefined
  );

  React.useEffect(() => {
    const mql = window.matchMedia(MOBILE_MEDIA_QUERY);
    const onChange = () => {
      setIsMobile(mql.matches);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}
