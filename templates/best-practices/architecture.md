## Engineering Standards

Apply these standards to every architectural decision in this phase:

- **Separation of concerns** — each module, service, or layer has one responsibility. A component that handles both business logic and persistence will fail in exactly one of those roles.
- **Security by design** — security is a Phase 2 decision, not a Phase 4 patch. Define auth boundaries, data trust levels, and encryption at rest/in-transit now. Retrofitting security breaks architecture.
- **12-factor compliance** — config via environment variables (never hardcoded), stateless processes, explicit dependency declaration. Any deviation must be documented in the Risk Analysis.
- **Observability by design** — any long-running process needs structured logging (with a correlation/request id and severity). For a networked service, ALSO expose a `/health` (or equivalent) endpoint and consistent error codes across the API surface. A CLI, library, or batch tool has no endpoint — apply the logging principle and skip the service-only parts.
- **No single point of failure** — for each critical component (database, auth, external API, queue), document what breaks on failure and what the recovery path is. "It won't fail" is not a recovery path.
- **API design contract** — define the contract before the implementation, whatever the surface is: HTTP endpoints, a library's exported functions/types, or a CLI's commands and flags. For a network API specifically: REST resource-oriented with consistent status codes and versioned from day one, GraphQL schema-first, gRPC proto-first. The contract is a public commitment regardless of form.
- **Data consistency model** — decide upfront: strong consistency (ACID) or eventual consistency (BASE). Mismatched expectations between design and implementation cause data corruption bugs in production.
- **Dependency selection criteria** — prefer libraries with active maintenance (commit in last 6 months), clear license, and minimal transitive dependencies. Every new dependency is a long-term maintenance commitment.
- **ADR discipline** — every significant tech decision requires an ADR with ≥2 options evaluated. An ADR with a single option is a post-hoc justification, not a decision record.
