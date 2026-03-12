## Testing Standards

Apply these standards to every test case produced in this phase:

- **Concrete values only** — Given/When/Then must use actual values: email addresses, status codes, field names, data structures. "a valid user" or "some input" is not a test case — it is a placeholder. Abstract language in a test case means the test can pass without the behavior being implemented.
- **One behavior per test case** — each TC must test exactly one observable outcome. A TC that checks login AND password reset in the same test will mask failures.
- **Negative tests assert the exact error** — for every failure path, specify the exact HTTP status code, error message, or exception type. `then: "returns error"` is not a negative test.
- **No trivially-passing tests** — a test that passes regardless of the implementation under test (e.g., `assert.ok(true)`, checking a constant, or not calling the function under test) is a compliance artifact, not a test. Every TC must be falsifiable: there must exist an incorrect implementation that would cause it to fail.
