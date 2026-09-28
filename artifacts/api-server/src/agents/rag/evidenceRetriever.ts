import type { EvidenceChunk, ProjectScope } from "../types";

export type EvidenceRetrievalResult = {
  chunks: EvidenceChunk[];
  query: string;
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "with",
]);

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function termFrequency(tokens: string[]): Map<string, number> {
  const frequencies = new Map<string, number>();

  for (const token of tokens) {
    frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
  }

  return frequencies;
}

function scoreChunk(queryTokens: string[], chunk: EvidenceChunk): number {
  const contentTokens = tokenize(
    [
      chunk.title,
      chunk.content,
      chunk.locator ?? "",
      chunk.metadata ? JSON.stringify(chunk.metadata) : "",
    ].join(" "),
  );

  if (contentTokens.length === 0 || queryTokens.length === 0) {
    return 0;
  }

  const queryFrequency = termFrequency(queryTokens);
  const contentFrequency = termFrequency(contentTokens);

  let score = 0;

  for (const [term, queryCount] of queryFrequency) {
    const contentCount = contentFrequency.get(term) ?? 0;

    if (contentCount === 0) {
      continue;
    }

    // Log-scaled term frequency prevents repeated words from dominating.
    score += (1 + Math.log(queryCount)) * (1 + Math.log(contentCount));
  }

  // Preserve an upstream semantic/relevance score when a provider has one.
  if (typeof chunk.relevanceScore === "number") {
    score += Math.max(0, Math.min(1, chunk.relevanceScore));
  }

  return score;
}

export function buildEvidenceQuery(scope: ProjectScope): string {
  return [
    scope.productName,
    scope.intendedUse,
    scope.projectPhase,
    scope.assessmentFramework,
    scope.jurisdictionContext ?? "",
    scope.scopeNotes ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Retrieves the most relevant evidence chunks for a project query.
 *
 * This is the first deterministic RAG retrieval layer.
 * It deliberately does not call an LLM or an external service.
 * External evidence providers can later normalize their results into
 * EvidenceChunk[] and pass them through this same retrieval boundary.
 */
export function retrieveEvidence(
  query: string,
  evidence: EvidenceChunk[],
  topK = 5,
): EvidenceRetrievalResult {
  const safeTopK = Math.max(1, Math.floor(topK));
  const queryTokens = tokenize(query);

  const ranked = evidence
    .map((chunk) => ({
      chunk,
      score: scoreChunk(queryTokens, chunk),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, safeTopK);

  return {
    query,
    chunks: ranked.map(({ chunk, score }) => ({
      ...chunk,
      relevanceScore: score,
    })),
  };
}

export function retrieveEvidenceForProject(
  scope: ProjectScope,
  evidence: EvidenceChunk[],
  topK = 5,
): EvidenceRetrievalResult {
  const query = buildEvidenceQuery(scope);
  return retrieveEvidence(query, evidence, topK);
}
