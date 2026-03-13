# Aitri Adopt Scan — Project Analysis

{{ROLE}}

## Constraints
{{CONSTRAINTS}}

## How to reason
{{REASONING}}

## Project: `{{PROJECT_DIR}}`

### File Structure
```
{{FILE_TREE}}
```

{{#IF_PKG_JSON}}
### package.json
```json
{{PKG_JSON}}
```
{{/IF_PKG_JSON}}

{{#IF_README}}
### README
{{README}}
{{/IF_README}}

{{#IF_TEST_SUMMARY}}
### Tests
{{TEST_SUMMARY}}
{{/IF_TEST_SUMMARY}}

## Output: `{{PROJECT_DIR}}/ADOPTION_PLAN.md`
Required sections (in order):

### 1. ## Project Summary
One to three paragraphs describing: what problem this project solves, who uses it, and what it does.
This becomes the project's IDEA.md — write it as the original author would have described the idea.

### 2. ## Stack
Single line: language, framework, test runner (e.g. "Node.js · Express · Jest")

### 3. ## Inferred Artifacts
For each Aitri artifact, mark [x] if you can produce it from existing code, [ ] if not:
```
- [x] 01_REQUIREMENTS.json      — <one-line reason>
- [x] 02_SYSTEM_DESIGN.md       — <one-line reason>
- [ ] 03_TEST_CASES.json         — <one-line reason it's missing>
- [ ] 04_IMPLEMENTATION_MANIFEST.json — <one-line reason>
```

### 4. ## Completed Phases
JSON array of phase keys that have inferrable artifacts (use numbers 1-5, or "discovery"/"ux"):
```json
["1", "2"]
```
Leave as `[]` if nothing is inferrable.

### 5. ## Gaps
Bullet list of what is missing, ambiguous, or would need manual work to complete. Be specific.
Example: "No user personas documented", "Test files exist but don't map to functional requirements"

### 6. ## Adoption Decision
Single line: `ready` or `blocked` — one-line reason.
Use `blocked` only if the Project Summary itself cannot be written from available information.

## Rules
- Every [x] artifact must be backed by evidence you actually read — not assumed
- Completed Phases must match the [x] items in Inferred Artifacts exactly
- Gaps must be honest — they guide the owner's next steps
- Do NOT create any other files — only ADOPTION_PLAN.md

## Instructions
1. Read the files listed in File Structure above (focus on entry points, routes, models, tests)
2. Generate complete ADOPTION_PLAN.md following the format above
3. Save to: {{PROJECT_DIR}}/ADOPTION_PLAN.md
4. Run: aitri adopt apply
