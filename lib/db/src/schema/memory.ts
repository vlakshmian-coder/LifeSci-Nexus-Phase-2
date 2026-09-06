import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, serial, text, timestamp, real } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const memoryTable = pgTable("project_memory", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  type: text("type").notNull(),
  content: text("content").notNull(),
  attribution: text("attribution").notNull(),
  sourceLabel: text("source_label").notNull(),
  sourceLocator: text("source_locator"),
  confidence: real("confidence"),
  status: text("status").notNull().default("active"),
  version: integer("version").notNull().default(1),
  supersedesId: integer("supersedes_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertMemorySchema = createInsertSchema(memoryTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMemory = z.infer<typeof insertMemorySchema>;
export type Memory = typeof memoryTable.$inferSelect;