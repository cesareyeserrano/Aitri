## Coding Standards

Apply these standards to every file produced in this phase:

- **No hardcoded secrets or environment-specific values** — API keys, URLs, ports, and credentials must come from environment variables. Any literal that changes between environments is a hardcoded value.
- **Explicit error handling** — no silent catch blocks. Every caught error must be logged, re-thrown, or returned as a structured error. `catch (e) {}` is a defect.
- **Input validation at boundaries** — validate all external input at entry points: HTTP request bodies, query params, file reads, environment variables. Never trust data that crossed a process boundary.
- **Injection prevention** — wherever untrusted input meets an interpreter, neutralize it, applying the cases your stack actually has: IF it runs database queries, parameterize them (never string-concatenate); IF it renders HTML, encode user-supplied data before output; IF it builds file paths or shell commands from input, validate against traversal/injection. Non-negotiable for any code that handles external input.
- **Authentication and authorization are separate concerns** — authn (who are you?) and authz (what can you do?) must be enforced at every protected endpoint independently. A valid session does not imply permission.
- **Structured logging** — log at entry/exit of every external call (HTTP, DB, queue) with: timestamp, request id, duration, and outcome. Log levels: ERROR for actionable failures, WARN for degraded behavior, INFO for lifecycle events.
- **Database discipline** — use transactions for multi-step writes. Avoid N+1 queries (use joins or batching). Every query touching more than one table needs an index review. Migrations must be reversible.
- **No magic numbers** — extract numeric and string literals to named constants. `if (status === 429)` → `if (status === HTTP_TOO_MANY_REQUESTS)`.
- **No commented-out code in deliverables** — dead code in comments is noise and signals the implementation is not complete. Delete it.
- **Functions that can fail must say so** — throw an error or return a typed error result. Returning `null` on failure without documentation is a silent bug waiting to surface in production.
- **Dependency hygiene** — only add a dependency when the alternative is significantly more complex. Pin versions. Run a security audit (npm audit, pip-audit, govulncheck, or equivalent) before completing the phase — zero high/critical vulnerabilities.
