import { ReactNode, useEffect, useState } from 'react';

/**
 * ValidationRouteWrapper
 * 
 * Wraps validation routes (/intake, /case/:id) to:
 * 1. Skip all auth checks
 * 2. Render children immediately without waiting for auth
 * 3. Bypass OAuth redirects
 */

interface ValidationRouteWrapperProps {
  children: ReactNode;
}

export function ValidationRouteWrapper({ children }: ValidationRouteWrapperProps) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Mark as ready immediately - no auth checks needed
    setIsReady(true);
  }, []);

  if (!isReady) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-pulse text-muted-foreground mb-4">Loading...</div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
