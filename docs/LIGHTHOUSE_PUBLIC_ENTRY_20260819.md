# Lighthouse public entry repair — 2026-08-19

Purpose: make Lighthouse inspectable by unauthenticated browsers and automated site analysis without disabling backend/admin authentication.

- `/lighthouse`, `/civic-map`, and `/viewfinder` are already public routes.
- unauthenticated root navigation currently lands on `/login` through `HomeOrWelcome()`.
- this repair makes the default login route forward to `/lighthouse` unless interactive login was explicitly requested.
- Lighthouse sign-in CTAs request interactive login explicitly.
- authenticated case, admin, upload, mutation, and other protected backend surfaces remain governed by their existing auth/authorization contracts.

This is a presentation/routing boundary change only; it does not grant anonymous write authority or anonymous admin access.
