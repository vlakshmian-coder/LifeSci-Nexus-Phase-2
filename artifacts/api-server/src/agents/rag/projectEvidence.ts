import type { EvidenceChunk, ProjectScope } from "../types";
import { retrieveEvidenceForProject } from "./evidenceRetriever";
import { pubMedProvider } from "./pubmedProvider";

export type ProjectEvidenceResult = {
  query: string;
  externalEvidence: EvidenceChunk[];
  rankedEvidence: EvidenceChunk[];
};

export async function retrieveProjectEvidence(
  scope: ProjectScope,
  topK = 5,
): Promise<ProjectEvidenceResult> {
  const query = [
    scope.productName,
    scope.intendedUse,
    scope.projectPhase,
    scope.assessmentFramework,
    scope.jurisdictionContext ?? "",
    scope.scopeNotes ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const externalEvidence = await pubMedProvider.search(query, Math.max(topK, 5));

  const ranked = retrieveEvidenceForProject(
    scope,
    externalEvidence,
    topK,
  );

  return {
    query,
    externalEvidence,
    rankedEvidence: ranked.chunks,
  };
}