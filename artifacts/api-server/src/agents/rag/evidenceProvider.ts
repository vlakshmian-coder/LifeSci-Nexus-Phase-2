import type { EvidenceChunk } from "../types";

export interface EvidenceProvider {
  readonly name: string;

  search(query: string, limit?: number): Promise<EvidenceChunk[]>;
}

export type EvidenceProviderSearchOptions = {
  limit?: number;
  timeoutMs?: number;
};
