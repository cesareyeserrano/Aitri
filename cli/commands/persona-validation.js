import { extractSection, extractSubsection } from "../lib.js";

export function hasMeaningfulContent(content) {
  const lines = String(content)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.some((line) => {
    if (/^###\s+/.test(line)) return false;
    const cleaned = line
      .replace(/^[-*]\s*/, "")
      .replace(/^\d+\)\s*/, "")
      .replace(/^\d+\.\s*/, "")
      .trim();
    if (!cleaned || cleaned === "-") return false;
    if (cleaned.length < 6) return false;
    if (/^<.*>$/.test(cleaned)) return false;
    if (/\b(TBD|Not specified|pending|to be refined|to be confirmed)\b/i.test(cleaned)) return false;
    return true;
  });
}

// EVO-088: accepts archContent and securityContent from .aitri/*.md as fallback
// when plan section parsing fails due to injected content breaking extractSection boundaries.
export function collectPersonaValidationIssues({ discoveryContent, planContent, specContent, archContent, securityContent }) {
  const issues = [];

  if (discoveryContent) {
    const discoveryInterview = extractSection(discoveryContent, "## 2. Discovery Interview Summary (Discovery Persona)");
    if (!discoveryInterview) {
      issues.push("Persona gate: Discovery section is missing `## 2. Discovery Interview Summary (Discovery Persona)`.");
    } else if (!hasMeaningfulContent(discoveryInterview)) {
      issues.push("Persona gate: Discovery interview summary is unresolved.");
    }

    const discoveryConfidence = extractSection(discoveryContent, "## 9. Discovery Confidence");
    if (!discoveryConfidence) {
      issues.push("Persona gate: Discovery section is missing `## 9. Discovery Confidence`.");
    } else if (/- Confidence:\s*\n-\s*Low\b/i.test(discoveryConfidence)) {
      issues.push("Persona gate: Discovery confidence is Low. Resolve evidence gaps before handoff.");
    }
  }

  if (planContent) {
    const product = extractSection(planContent, "## 4. Product Review (Product Persona)");
    if (!product) {
      issues.push("Persona gate: Plan is missing `## 4. Product Review (Product Persona)`.");
    } else {
      const businessValue = extractSubsection(product, "### Business value");
      const successMetric = extractSubsection(product, "### Success metric");
      const assumptions = extractSubsection(product, "### Assumptions to validate");
      if (!hasMeaningfulContent(businessValue)) issues.push("Persona gate: Product `Business value` is unresolved.");
      if (!hasMeaningfulContent(successMetric)) issues.push("Persona gate: Product `Success metric` is unresolved.");
      if (!hasMeaningfulContent(assumptions)) issues.push("Persona gate: Product `Assumptions to validate` is unresolved.");
    }

    // EVO-088: if .aitri/architecture-decision.md exists with meaningful content,
    // it satisfies the architecture gate — plan injection may have broken section boundaries.
    const archSatisfiedByPrePlanning = archContent && hasMeaningfulContent(archContent);
    const architecture = extractSection(planContent, "## 5. Architecture (Architect Persona)");
    if (!architecture && !archSatisfiedByPrePlanning) {
      issues.push("Persona gate: Plan is missing `## 5. Architecture (Architect Persona)`.");
    } else if (!archSatisfiedByPrePlanning) {
      const components = extractSubsection(architecture, "### Components");
      const dataFlow = extractSubsection(architecture, "### Data flow");
      const keyDecisions = extractSubsection(architecture, "### Key decisions");
      const risks = extractSubsection(architecture, "### Risks & mitigations");
      const observability = extractSubsection(architecture, "### Observability (logs/metrics/tracing)");
      if (!hasMeaningfulContent(components)) issues.push("Persona gate: Architect `Components` unresolved in plan `## 5. Architecture`. Add under `### Components`:\n    - <component>: <role/responsibility>\n    Or add content to `.aitri/architecture-decision.md` and re-run `aitri plan`.");
      if (!hasMeaningfulContent(dataFlow)) issues.push("Persona gate: Architect `Data flow` unresolved in plan `## 5. Architecture`. Add under `### Data flow`:\n    - <step> → <next step>");
      if (!hasMeaningfulContent(keyDecisions)) issues.push("Persona gate: Architect `Key decisions` unresolved in plan `## 5. Architecture`. Add under `### Key decisions`:\n    - Decision: <what and why>");
      if (!hasMeaningfulContent(risks)) issues.push("Persona gate: Architect `Risks & mitigations` unresolved in plan `## 5. Architecture`. Add under `### Risks & mitigations`:\n    - Risk: <description> → Mitigation: <approach>");
      if (!hasMeaningfulContent(observability)) issues.push("Persona gate: Architect `Observability` unresolved in plan `## 5. Architecture`. Add under `### Observability (logs/metrics/tracing)`:\n    - Logs: <what is logged>; Metrics: <key metrics>; Tracing: <strategy>");
    }

    // EVO-088: if .aitri/security-review.md exists with meaningful content, it satisfies the security gate.
    const securitySatisfiedByPrePlanning = securityContent && hasMeaningfulContent(securityContent);
    const security = extractSection(planContent, "## 6. Security (Security Persona)");
    if (security && !securitySatisfiedByPrePlanning) {
      const threats = extractSubsection(security, "### Threats");
      const controls = extractSubsection(security, "### Required controls");
      if (!hasMeaningfulContent(threats)) issues.push("Persona gate: Security `Threats` unresolved in plan `## 6. Security`. Add under `### Threats`:\n    - <attack scenario>: <attacker goal> → <impact>\n    Or add content to `.aitri/security-review.md` and re-run `aitri plan`.");
      if (!hasMeaningfulContent(controls)) issues.push("Persona gate: Security `Required controls` unresolved in plan `## 6. Security`. Add under `### Required controls`:\n    - <control>: <implementation approach>");
    }

    if (specContent && /screen|form|button|page|dashboard|component|layout|view|modal|dialog/i.test(specContent)) {
      const uxui = extractSection(planContent, "## 7. UX/UI Review (UX/UI Persona, if user-facing)");
      if (!uxui) {
        issues.push("Persona gate: Plan is missing `## 7. UX/UI Review` (spec mentions UI elements).");
      } else if (!hasMeaningfulContent(uxui)) {
        issues.push("Persona gate: UX/UI Review has no meaningful content.");
      }
    }
  }

  return issues;
}
