// Runs BEFORE tests/setup.ts and before src/env.ts is imported.
//
// src/env.ts parses process.env once at module import time, so the production-like
// cookie config cannot be swapped in at runtime (resetAuth() does not re-parse env).
// See Muraki/knowledge/gotcha/env-module-import-time-parse-defeats-runtime-env-swap.md
//
// An https BETTER_AUTH_URL is what makes better-auth emit the __Secure- cookie prefix,
// which is the exact production condition the default (http) test suite is blind to.
process.env.BETTER_AUTH_URL = "https://atender-api.appily.run";
process.env.BETTER_AUTH_COOKIE_DOMAIN = ".appily.run";
