/**
 * TEMPORARY AUTH BYPASS - DEVELOPMENT VALIDATION ONLY
 * 
 * This middleware provides temporary authentication bypass for:
 * - /intake route
 * - /case/:id route
 * 
 * Purpose: Unblock Action Engine validation while OAuth is being configured
 * 
 * IMPORTANT:
 * - This is TEMPORARY and scoped to current deployment only
 * - Should be removed once OAuth is fully configured
 * - Do NOT use in production without explicit authorization
 * - Auto-creates mock user session for testing
 */

import { NextRequest, NextResponse } from 'next/server';

// Mock user for development validation
const MOCK_USER = {
  id: 'dev-validation-user-001',
  email: 'validation@luminari.dev',
  name: 'Validation User',
  role: 'user' as const,
};

/**
 * Temporary bypass for specific routes
 * Returns mock user context if route matches bypass list
 */
export function getTemporaryAuthBypass(pathname: string) {
  const bypassRoutes = ['/intake', '/case'];
  
  const shouldBypass = bypassRoutes.some(route => 
    pathname.startsWith(route)
  );

  if (shouldBypass) {
    return {
      user: MOCK_USER,
      isTemporaryBypass: true,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    };
  }

  return null;
}

/**
 * Check if current deployment has bypass enabled
 * This is environment-based to prevent accidental production use
 */
export function isTemporaryBypassEnabled(): boolean {
  // Only enable in development or when explicitly flagged
  return process.env.NODE_ENV === 'development' || 
         process.env.TEMP_AUTH_BYPASS === 'true';
}

/**
 * Create mock session context for bypass
 */
export function createMockSessionContext() {
  return {
    user: MOCK_USER,
    session: {
      id: `session-${Date.now()}`,
      userId: MOCK_USER.id,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      isTemporary: true,
    },
  };
}

/**
 * Middleware to inject mock user into request context
 */
export function withTemporaryAuthBypass(handler: Function) {
  return async (req: any, res: any) => {
    if (!isTemporaryBypassEnabled()) {
      return handler(req, res);
    }

    const bypass = getTemporaryAuthBypass(req.url);
    
    if (bypass) {
      // Inject mock user into request context
      req.user = bypass.user;
      req.session = createMockSessionContext().session;
      req.isTemporaryBypass = true;
      
      console.log('[TEMP_AUTH_BYPASS] Route:', req.url, 'User:', bypass.user.email);
    }

    return handler(req, res);
  };
}
