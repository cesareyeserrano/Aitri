# Personas — division rule (UPLAN-0703 C3)

A persona and its phase template render into **one prompt**. Anything stated in both WILL
drift apart (it already did: `qa.js` contradicted `tests.md` on multi-FR TCs and ac_id;
`devops.js` restated `deploy.md`'s compliance table minus one level; `pm.js` hardcoded a
root-scope floor that is wrong in feature scope).

**The rule:**

- **Personas carry:** the role, who consumes the output downstream, and *judgment heuristics
  a gate cannot check* ("could a developer fake this test?", "precision is a decision, not a
  suggestion", "never default to production_ready").
- **Templates carry:** all mechanics — field names and shapes, ID formats, floors/counts,
  enumerated mappings, gate conditions. Scope-dependent numbers are render placeholders
  (`{{MIN_FR}}`), never literals.
- **A rule never lives in both.** When a persona needs to reference a mechanic, it points at
  "the briefing's rules" generically — it does not restate the value.

When adding or editing a persona, check every constraint against this rule. A canary test
(`test/rendered-briefing.test.js`) greps for the known-drifted vocabulary as a regression
guard, but the rule is the protection — the canary only catches recurrences of past drift.
