import type { Express } from "express";

// Enforce the high-value structural directives without pretending the current
// inline bootstrap and configurable third-party integrations are protected by
// a strict script allowlist. Script/style nonce hardening remains separate.
export const LIGHTHOUSE_CONTENT_SECURITY_POLICY = [
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

export function registerSecurityHeaders(app: Express) {
  app.disable("x-powered-by");

  app.use((_req, res, next) => {
    res.setHeader(
      "Content-Security-Policy",
      LIGHTHOUSE_CONTENT_SECURITY_POLICY,
    );
    if (process.env.NODE_ENV === "production") {
      res.setHeader(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains",
      );
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
    );
    res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
    next();
  });
}
