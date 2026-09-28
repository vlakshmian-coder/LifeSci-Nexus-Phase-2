import { createInsertSchema } from "drizzle-zod";
import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const lifesciProjectsTable = pgTable("lifesci_projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  productName: text("product_name").notNull(),
  intendedUse: text("intended_use").notNull(),
  projectPhase: text("project_phase").notNull(),
  assessmentFramework: text("assessment_framework").notNull(),
  jurisdictionContext: text("jurisdiction_context"),
  scopeNotes: text("scope_notes"),
  workflowState: text("workflow_state").notNull().default("CREATED"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const lifesciRunsTable = pgTable("lifesci_runs", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => lifesciProjectsTable.id),
  state: text("state").notNull().default("CREATED"),
  label: text("label"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const lifesciFindingsTable = pgTable("lifesci_findings", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => lifesciProjectsTable.id),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  status: text("status").notNull(),
  confidence: text("confidence").notNull(),
  provenance: jsonb("provenance")
    .$type<
      Array<{
        sourceType:
          | "EXTERNAL_EVIDENCE"
          | "PROJECT_MEMORY"
          | "PROJECT_DOCUMENT"
          | "HUMAN_DECISION";
        label: string;
        locator?: string;
        reviewerDecision?: string;
      }>
    >()
    .notNull(),
  reviewerDecision: text("reviewer_decision"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const lifesciReviewItemsTable = pgTable("lifesci_review_items", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => lifesciProjectsTable.id),
  title: text("title").notNull(),
  reason: text("reason").notNull(),
  priority: text("priority").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const lifesciReportsTable = pgTable("lifesci_reports", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
      .references(() => lifesciProjectsTable.id),
  title: text("title").notNull(),
  status: text("status").notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }),
  findingCount: text("finding_count").notNull().default("0"),
});

export const lifesciAuditEventsTable = pgTable("lifesci_audit_events", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => lifesciProjectsTable.id),
  eventType: text("event_type").notNull(),
  actor: text("actor").notNull(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const lifesciMemoryRecordsTable = pgTable("lifesci_memory_records", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => lifesciProjectsTable.id),
  memoryType: text("memory_type").notNull(),
  content: jsonb("content").$type<Record<string, unknown>>().notNull(),
  source: text("source").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  confidence: text("confidence"),
  version: text("version").notNull().default("1"),
  supersededAt: timestamp("superseded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const insertLifeSciProjectSchema =
  createInsertSchema(lifesciProjectsTable);

export const insertLifeSciRunSchema = createInsertSchema(lifesciRunsTable);

export const insertLifeSciFindingSchema =
  createInsertSchema(lifesciFindingsTable);

export const insertLifeSciReviewItemSchema =
  createInsertSchema(lifesciReviewItemsTable);

export const insertLifeSciReportSchema =
  createInsertSchema(lifesciReportsTable);

export const insertLifeSciAuditEventSchema =
  createInsertSchema(lifesciAuditEventsTable);

export const insertLifeSciMemoryRecordSchema =
  createInsertSchema(lifesciMemoryRecordsTable);

export type InsertLifeSciProject = z.infer<
  typeof insertLifeSciProjectSchema
>;
export type InsertLifeSciRun = z.infer<typeof insertLifeSciRunSchema>;
export type InsertLifeSciFinding = z.infer<
  typeof insertLifeSciFindingSchema
>;
export type InsertLifeSciReviewItem = z.infer<
  typeof insertLifeSciReviewItemSchema
>;
export type InsertLifeSciReport = z.infer<typeof insertLifeSciReportSchema>;
export type InsertLifeSciAuditEvent = z.infer<
  typeof insertLifeSciAuditEventSchema
>;
export type InsertLifeSciMemoryRecord = z.infer<
  typeof insertLifeSciMemoryRecordSchema
>;

export type LifeSciProject = typeof lifesciProjectsTable.$inferSelect;
export type LifeSciRun = typeof lifesciRunsTable.$inferSelect;
export type LifeSciFinding = typeof lifesciFindingsTable.$inferSelect;
export type LifeSciReviewItem =
  typeof lifesciReviewItemsTable.$inferSelect;
export type LifeSciReport = typeof lifesciReportsTable.$inferSelect;
export type LifeSciAuditEvent =
  typeof lifesciAuditEventsTable.$inferSelect;
export type LifeSciMemoryRecord =
  typeof lifesciMemoryRecordsTable.$inferSelect;