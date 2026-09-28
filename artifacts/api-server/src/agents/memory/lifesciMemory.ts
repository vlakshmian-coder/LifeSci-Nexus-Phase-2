import { and, desc, eq } from "drizzle-orm";
import {
  db,
  lifesciMemoryRecordsTable,
  lifesciProjectsTable,
} from "@workspace/db";
import type { EvidenceChunk } from "../types";

export type LifeSciMemoryRecord =
  typeof lifesciMemoryRecordsTable.$inferSelect;

export async function retrieveProjectMemory(
  projectId: string,
  limit = 5,
): Promise<{
  records: LifeSciMemoryRecord[];
  evidence: EvidenceChunk[];
}> {
  const safeLimit = Math.min(20, Math.max(1, Math.floor(limit)));

  const records = await db
    .select()
    .from(lifesciMemoryRecordsTable)
    .where(
      and(
        eq(lifesciMemoryRecordsTable.projectId, projectId),
        eq(lifesciMemoryRecordsTable.status, "ACTIVE"),
      ),
    )
    .orderBy(desc(lifesciMemoryRecordsTable.createdAt))
    .limit(safeLimit);

  const evidence: EvidenceChunk[] = records.map((record) => ({
    id: `memory:${record.id}`,
    sourceType: "PROJECT_MEMORY",
    title: record.memoryType,
    content: JSON.stringify(record.content),
    locator: `lifesci_memory_records:${record.id}`,
    metadata: {
      projectId: record.projectId,
      memoryType: record.memoryType,
      source: record.source,
      confidence: record.confidence,
      version: record.version,
      createdAt: record.createdAt,
    },
    relevanceScore: 1,
  }));

  return {
    records,
    evidence,
  };
}

export async function persistApprovedMemory(input: {
  projectId: string;
  memoryType: string;
  content: Record<string, unknown>;
  source?: string;
  confidence?: string | null;
  supersedesId?: string | null;
}): Promise<LifeSciMemoryRecord> {
  const [project] = await db
    .select({ id: lifesciProjectsTable.id })
    .from(lifesciProjectsTable)
    .where(eq(lifesciProjectsTable.id, input.projectId));

  if (!project) {
    throw new Error("Project not found");
  }

  if (input.supersedesId) {
    await db
      .update(lifesciMemoryRecordsTable)
      .set({
        status: "SUPERSEDED",
        supersededAt: new Date(),
      })
      .where(
        and(
          eq(lifesciMemoryRecordsTable.id, input.supersedesId),
          eq(lifesciMemoryRecordsTable.projectId, input.projectId),
        ),
      );
  }

  const [record] = await db
    .insert(lifesciMemoryRecordsTable)
    .values({
      id: crypto.randomUUID(),
      projectId: input.projectId,
      memoryType: input.memoryType,
      content: input.content,
      source: input.source ?? "human_review",
      status: "ACTIVE",
      confidence: input.confidence ?? null,
      version: "1",
      supersededAt: null,
      createdAt: new Date(),
    })
    .returning();

  if (!record) {
    throw new Error("Failed to persist approved project memory");
  }

  return record;
}