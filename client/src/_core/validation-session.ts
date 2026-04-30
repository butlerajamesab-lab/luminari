/**
 * Validation Session Initialization
 * 
 * For /intake and /case/:id routes, create a temporary validation session
 * to bypass OAuth during development/validation.
 */

export async function initializeValidationSession(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const pathname = window.location.pathname;
  const isValidationRoute = pathname.startsWith('/intake') || pathname.startsWith('/case/');

  if (!isValidationRoute) return false;

  try {
    // Check if we already have a valid session
    const response = await fetch('/api/auth/me', {
      credentials: 'include',
    });

    if (response.ok) {
      // Already authenticated
      return true;
    }

    // No session, create a validation session
    const sessionResponse = await fetch('/api/validation-session', {
      method: 'GET',
      credentials: 'include',
    });

    if (sessionResponse.ok) {
      console.log('[Validation] Session created successfully');
      return true;
    }

    console.warn('[Validation] Failed to create session:', sessionResponse.statusText);
    return false;
  } catch (error) {
    console.error('[Validation] Error initializing session:', error);
    return false;
  }
}
