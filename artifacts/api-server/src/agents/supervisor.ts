import type { FindingConfidence, Provenance } from "./types";
import { documentAnalysisAgent } from "./documentAnalysisAgent";
import type { AgentInput } from "./types";
import { retrieveProjectEvidence } from "./rag/projectEvidence";
import { retrieveProjectMemory } from "./memory/lifesciMemory";

export interface SupervisedFinding {
  title: string;
  summary: string;
  status: "REQUIRES_HUMAN_REVIEW";
  confidence: FindingConfidence;
  provenance: Provenance;
}

export interface SupervisedRunResult {
  agentName: string;
  findings: SupervisedFinding[];
  memoryCount: number;
  externalEvidenceCount: number;
}

/**
 * Runs the specialist only after retrieving both:
 *
 * 1. Project-scoped MAG from Neon
 * 2. Existing external RAG evidence
 *
 * HARD CONSTRAINT:
 * Every Finding returned by the Supervisor remains
 * REQUIRES_HUMAN_REVIEW.
 *
 * MAG is contextual evidence, not automatic approval.
 */
export async function runSupervisedAnalysis(
  input: AgentInput,
): Promise<SupervisedRunResult> {
  const [memoryResult, evidenceResult] = await Promise.all([
    retrieveProjectMemory(input.projectId, 5),
    retrieveProjectEvidence(input.scope, 5),
  ]);

  const combinedEvidence = [
    ...memoryResult.evidence,
    ...evidenceResult.rankedEvidence,
  ];

  const enrichedInput: AgentInput = {
    ...input,
    evidence: combinedEvidence,
  };

  const candidates = await documentAnalysisAgent.run(enrichedInput);

  const findings: SupervisedFinding[] = candidates.map((candidate) => ({
    title: candidate.title,
    summary: candidate.summary,
    status: "REQUIRES_HUMAN_REVIEW",
    confidence: candidate.confidence,
    provenance: candidate.provenance,
  }));

  return {
    agentName: documentAnalysisAgent.name,
    findings,
    memoryCount: memoryResult.records.length,
    externalEvidenceCount: evidenceResult.rankedEvidence.length,
  };
}