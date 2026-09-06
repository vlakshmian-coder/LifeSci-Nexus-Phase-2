import { createInsertSchema } from "drizzle-zod";
import { integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export type ProvenanceSpanData = {
  text: string;
  sourceType: "uploaded_document";
  locator: string;
  confidence: number;
};

export type ProvenanceFactData = ProvenanceSpanData & {
  statement: string;
  classification: "direct_extraction" | "interpretation" | "uncertainty" | "missing";
};

export const documentAnalysesTable = pgTable("document_analyses", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  documentId: integer("document_id").notNull(),
  version: integer("version").notNull().default(1),
  status: text("status").notNull().default("complete"),
  summary: text("summary").notNull(),
  headings: jsonb("headings").$type<string[]>().notNull().default([]),
  sections: jsonb("sections").$type<ProvenanceSpanData[]>().notNull().default([]),
  dates: jsonb("dates").$type<ProvenanceSpanData[]>().notNull().default([]),
  references: jsonb("references").$type<ProvenanceSpanData[]>().notNull().default([]),
  facts: jsonb("facts").$type<ProvenanceFactData[]>().notNull().default([]),
  uncertainties: jsonb("uncertainties").$type<ProvenanceSpanData[]>().notNull().default([]),
  missingInformation: jsonb("missing_information").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDocumentAnalysisSchema = createInsertSchema(documentAnalysesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertDocumentAnalysis = z.infer<typeof insertDocumentAnalysisSchema>;
export type DocumentAnalysis = typeof documentAnalysesTable.$inferSelect;