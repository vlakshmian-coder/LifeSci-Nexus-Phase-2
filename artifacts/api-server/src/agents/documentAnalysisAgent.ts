import type {
  AgentInput,
  FindingCandidate,
  SpecialistAgent,
} from "./types";

/**
 * Deterministic, rule-based analysis.
 *
 * This agent does not make clinical, regulatory, or safety decisions.
 * It checks project-scope completeness and records the external evidence
 * retrieved by the RAG layer as an auditable input to the analysis.
 */
function analyzeScope(input: AgentInput): FindingCandidate[] {
  const { scope, evidence = [] } = input;
  const findings: FindingCandidate[] = [];
  const missing: string[] = [];

  if (!scope.jurisdictionContext?.trim()) {
    missing.push("jurisdiction context");
  }

  if (!scope.scopeNotes?.trim()) {
    missing.push("scope notes");
  }

  if (missing.length === 0) {
    findings.push({
      title: "Project scope fields are complete",
      summary:
        "All optional scope fields (jurisdiction context, scope notes) are present " +
        "in addition to the required scope fields. No completeness gaps were detected " +
        "by this automated check.",
      confidence: "HIGH",
      provenance: [
        {
          sourceType: "PROJECT_MEMORY",
          label: "Project scope",
          locator: "ProjectScope (all fields)",
        },
      ],
    });
  } else {
    findings.push({
      title: "Project scope is missing optional context fields",
      summary:
        `The submitted project scope does not specify: ${missing.join(", ")}. ` +
        "This is a completeness observation about the data entered for this project, " +
        "not an assessment of regulatory applicability. A qualified reviewer should " +
        "confirm whether these fields are required before proceeding.",
      confidence: "HIGH",
      provenance: [
        {
          sourceType: "PROJECT_MEMORY",
          label: "Project scope",
          locator: `ProjectScope.${missing.join(", ProjectScope.")}`,
        },
      ],
    });
  }

  if (evidence.length > 0) {
    findings.push({
      title: "External evidence retrieved for project scope",
      summary:
        `The RAG layer retrieved ${evidence.length} external evidence item(s) ` +
        "relevant to the submitted project scope. These sources are provided as " +
        "evidence for human review and are not themselves a clinical, regulatory, " +
        "or safety conclusion.",
      confidence: "MEDIUM",
      provenance: evidence.map((chunk) => ({
        sourceType: chunk.sourceType,
        label: chunk.title,
        locator: chunk.locator ?? chunk.url,
      })),
    });
  }

  return findings;
}

export const documentAnalysisAgent: SpecialistAgent = {
  name: "Document/Evidence Analysis Agent (stub)",
  async run(input: AgentInput): Promise<FindingCandidate[]> {
    return analyzeScope(input);
  },
};