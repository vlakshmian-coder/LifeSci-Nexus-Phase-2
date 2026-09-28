export type FindingConfidence =
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "UNKNOWN";

export type Provenance = Array<{
  sourceType:
    | "EXTERNAL_EVIDENCE"
    | "PROJECT_MEMORY"
    | "PROJECT_DOCUMENT"
    | "HUMAN_DECISION";
  label: string;
  locator?: string;
  reviewerDecision?: string;
}>;

export type ProjectScope = {
  productName: string;
  intendedUse: string;
  projectPhase: string;
  assessmentFramework: string;
  jurisdictionContext: string | null;
  scopeNotes: string | null;
};

export type EvidenceChunk = {
  id: string;
  sourceType: "EXTERNAL_EVIDENCE" | "PROJECT_DOCUMENT" | "PROJECT_MEMORY";
  title: string;
  content: string;
  locator?: string;
  url?: string;
  metadata?: Record<string, unknown>;
  relevanceScore?: number;
};

export type AgentInput = {
  projectId: string;
  runId: string;
  scope: ProjectScope;
  evidence?: EvidenceChunk[];
};

export type FindingCandidate = {
  title: string;
  summary: string;
  confidence: FindingConfidence;
  provenance: Provenance;
};

export type SpecialistAgent = {
  name: string;
  run(input: AgentInput): Promise<FindingCandidate[]>;
};
