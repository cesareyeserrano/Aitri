## Coding Standards

Apply these standards to every file produced in this phase:

- **No hardcoded secrets or environment-specific values** — API keys, URLs, ports, and credentials must come from environment variables. Any literal that changes between environments is a hardcoded value.
- **Explicit error handling** — no silent catch blocks. Every caught error must be logged, re-thrown, or returned as a structured error. `catch (e) {}` is a defect.
- **No magic numbers** — extract numeric and string literals to named constants. `if (status === 429)` → `if (status === HTTP_TOO_MANY_REQUESTS)`.
- **Input validation at boundaries** — validate all external input at entry points: HTTP request bodies, query params, file reads, environment variables. Never trust data that crossed a process boundary.
- **No commented-out code in deliverables** — dead code in comments is noise and a sign the implementation is not complete. Delete it.
- **Functions that can fail must say so** — throw an error or return a typed error result. Returning `null` on failure without documentation is a silent bug waiting to surface in production.
