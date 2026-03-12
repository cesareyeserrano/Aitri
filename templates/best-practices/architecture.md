## Engineering Standards

Apply these standards to every architectural decision in this phase:

- **Separation of concerns** — each module, service, or layer has one responsibility. A component that handles both business logic and persistence will fail in exactly one of those roles.
- **12-factor compliance** — config via environment variables (never hardcoded), stateless processes, explicit dependency declaration. Any deviation must be documented in the Risk Analysis.
- **Observability by design** — every service must have: structured logging (JSON, with request id), a `/health` or equivalent endpoint, and consistent error codes across the API surface.
- **No single point of failure** — for each critical component (database, auth, external API, queue), document what breaks on failure and what the recovery path is. "It won't fail" is not a recovery path.
- **ADR discipline** — every significant tech decision requires an ADR with ≥2 options evaluated. An ADR with a single option is a post-hoc justification, not a decision record.
