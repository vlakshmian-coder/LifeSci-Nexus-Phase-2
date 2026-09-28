import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
const ProjectScopeSchema = z.object({
  productName: z.string(),
  intendedUse: z.string(),
  projectPhase: z.string(),
  assessmentFramework: z.string(),
  jurisdictionContext: z.string().nullable().optional(),
  scopeNotes: z.string().nullable().optional(),
});

const CreateProjectScopeBody = z.object({
  name: z.string(),
  scope: ProjectScopeSchema,
});
const CreateProjectNotebookBody = z.object({
  name: z.string().min(1),
  deviceName: z.string().min(1),
  description: z.string(),
}).transform(({ name, deviceName, description }) => ({
  name,
  scope: {
    productName: deviceName,
    intendedUse: description || "Not specified",
    projectPhase: "Not specified",
    assessmentFramework: "Not specified",
    jurisdictionContext: null,
    scopeNotes: description || null,
  },
}));
const CreateProjectBody = z.union([
  CreateProjectScopeBody,
  CreateProjectNotebookBody,
]);

const UpdateProjectParams = z.object({
  projectId: z.string(),
});

const UpdateProjectBody = z.object({
  name: z.string().optional(),
  status: z.string().optional(),
  scope: ProjectScopeSchema.optional(),
});

const GetProjectParams = z.object({
  projectId: z.string(),
});

const CreateProjectRunParams = z.object({
  projectId: z.string(),
});

const CreateProjectRunBody = z.object({
  label: z.string().optional(),
});

const ListProjectsQueryParams = z.object({
  status: z.string().optional(),
});

const ListProjectRunsParams = z.object({
  projectId: z.string(),
});

const ListProjectFindingsParams = z.object({
  projectId: z.string(),
});

const CreateProjectMemoryParams = z.object({
  projectId: z.string(),
});

const CreateProjectMemoryBody = z.object({
  memoryType: z.string().optional(),
  type: z.string().optional(),
  content: z.union([z.string(), z.record(z.unknown())]),
  source: z.string().optional(),
  sourceLabel: z.string().optional(),
  sourceLocator: z.string().nullable().optional(),
  attribution: z.string().optional(),
  confidence: z.union([z.string(), z.number()]).nullable().optional(),
  status: z.string().optional(),
  supersedesId: z.string().nullable().optional(),
}).refine(
  (value) => Boolean(value.memoryType ?? value.type),
  "memoryType or type is required",
);

const ListProjectMemoryParams = z.object({
  projectId: z.string(),
});

const ReviewFindingParams = z.object({
  projectId: z.string(),
  findingId: z.string(),
});

const ReviewFindingBody = z.object({
  decision: z.string(),
  memoryType: z.string().optional(),
  source: z.string().optional(),
  confidence: z.string().nullable().optional(),
});

const ListProjectReportsParams = z.object({
  projectId: z.string(),
});

const ListProjectAuditEventsParams = z.object({
  projectId: z.string(),
});

const CreateProjectResponse = z.any();
const GetDashboardResponse = z.any();
const GetProjectResponse = z.any();
const ListProjectsResponse = z.any();
const UpdateProjectResponse = z.any();
const CreateProjectRunResponse = z.any();
const ListProjectRunsResponse = z.any();
const ListProjectFindingsResponse = z.any();
const ListProjectMemoryResponse = z.any();
const CreateProjectMemoryResponse = z.any();
const ReviewFindingResponse = z.any();
const ListReviewQueueResponse = z.any();
const ListProjectReportsResponse = z.any();
const ListProjectAuditEventsResponse = z.any();
import {
  lifesciAuditEventsTable as auditEventsTable,
  db,
  lifesciFindingsTable as findingsTable,
  lifesciMemoryRecordsTable as memoryRecordsTable,
  lifesciProjectsTable as projectsTable,
  lifesciReportsTable as reportsTable,
  lifesciReviewItemsTable as reviewItemsTable,
  lifesciRunsTable as runsTable,
} from "@workspace/db";
import { runSupervisedAnalysis } from "../agents/supervisor";
import {
  persistApprovedMemory,
  retrieveProjectMemory,
} from "../agents/memory/lifesciMemory";

const router: IRouter = Router();

const getProjectId = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

const toScope = (project: typeof projectsTable.$inferSelect) => ({
  productName: project.productName,
  intendedUse: project.intendedUse,
  projectPhase: project.projectPhase,
  assessmentFramework: project.assessmentFramework,
  jurisdictionContext: project.jurisdictionContext,
  scopeNotes: project.scopeNotes,
});

const toRun = (run: typeof runsTable.$inferSelect) => ({
  id: run.id,
  projectId: run.projectId,
  state: run.state,
  label: run.label,
  startedAt: run.startedAt,
  updatedAt: run.updatedAt,
});

const toFinding = (finding: typeof findingsTable.$inferSelect) => ({
  id: finding.id,
  projectId: finding.projectId,
  title: finding.title,
  summary: finding.summary,
  status: finding.status,
  confidence: finding.confidence,
  provenance: finding.provenance,
  reviewerDecision: finding.reviewerDecision,
  updatedAt: finding.updatedAt,
});

const toMemoryRecord = (
  record: typeof memoryRecordsTable.$inferSelect,
) => ({
  id: record.id,
  projectId: record.projectId,
  memoryType: record.memoryType,
  type: record.memoryType,
  content: record.content,
  source: record.source,
  sourceLabel: record.source,
  sourceLocator: null,
  attribution: record.source,
  status: record.status,
  confidence: record.confidence,
  version: record.version,
  supersededAt: record.supersededAt,
  createdAt: record.createdAt,
});

const toReport = (report: typeof reportsTable.$inferSelect) => ({
  id: report.id,
  projectId: report.projectId,
  title: report.title,
  status: report.status,
  generatedAt: report.generatedAt,
  findingCount: Number(report.findingCount),
});

const toAuditEvent = (event: typeof auditEventsTable.$inferSelect) => ({
  id: event.id,
  projectId: event.projectId,
  eventType: event.eventType,
  actor: event.actor,
  description: event.description,
  createdAt: event.createdAt,
});

async function countFindings(projectId: string): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(findingsTable)
    .where(eq(findingsTable.projectId, projectId));
  return Number(result?.count ?? 0);
}

async function toProject(project: typeof projectsTable.$inferSelect) {
  return {
    id: project.id,
    name: project.name,
    deviceName: project.productName,
    description: project.scopeNotes ?? project.intendedUse,
    status: project.status,
    scope: toScope(project),
    workflowState: project.workflowState,
    findingCount: await countFindings(project.id),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

router.get("/dashboard", async (_req, res): Promise<void> => {
  const [activeProjects, reviewQueueCount, verifiedFindingCount, recentActivity] =
    await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(projectsTable)
        .where(eq(projectsTable.status, "ACTIVE")),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(reviewItemsTable),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(findingsTable)
        .where(eq(findingsTable.status, "SUPPORTED")),
      db
        .select()
        .from(auditEventsTable)
        .orderBy(desc(auditEventsTable.createdAt))
        .limit(6),
    ]);

  res.json(
    GetDashboardResponse.parse({
      activeProjects: Number(activeProjects[0]?.count ?? 0),
      reviewQueueCount: Number(reviewQueueCount[0]?.count ?? 0),
      verifiedFindingCount: Number(verifiedFindingCount[0]?.count ?? 0),
      recentActivity: recentActivity.map(toAuditEvent),
    }),
  );
});

router.get("/projects", async (req, res): Promise<void> => {
  const parsedQuery = ListProjectsQueryParams.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({ error: parsedQuery.error.message });
    return;
  }

  const projects = await db
    .select()
    .from(projectsTable)
    .where(
      parsedQuery.data.status
        ? eq(projectsTable.status, parsedQuery.data.status)
        : undefined,
    )
    .orderBy(desc(projectsTable.updatedAt));

  res.json(ListProjectsResponse.parse(await Promise.all(projects.map(toProject))));
});

router.post("/projects", async (req, res): Promise<void> => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const now = new Date();
  const projectId = crypto.randomUUID();
  const [project] = await db
    .insert(projectsTable)
    .values({
      id: projectId,
      name: parsed.data.name,
      productName: parsed.data.scope.productName,
      intendedUse: parsed.data.scope.intendedUse,
      projectPhase: parsed.data.scope.projectPhase,
      assessmentFramework: parsed.data.scope.assessmentFramework,
      jurisdictionContext: parsed.data.scope.jurisdictionContext ?? null,
      scopeNotes: parsed.data.scope.scopeNotes ?? null,
      status: "ACTIVE",
      workflowState: "SCOPED",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await db.insert(auditEventsTable).values({
    id: crypto.randomUUID(),
    projectId,
    eventType: "PROJECT_CREATED",
    actor: "Workspace user",
    description: `Created project ${parsed.data.name}`,
    createdAt: now,
  });

  res.status(201).json(
    CreateProjectResponse.parse(await toProject(project)),
  );
});

router.get("/projects/:projectId", async (req, res): Promise<void> => {
  const params = GetProjectParams.safeParse({
    projectId: getProjectId(req.params.projectId),
  });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, params.data.projectId));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const [runs, findings, reports, recentAuditEvents] = await Promise.all([
    db
      .select()
      .from(runsTable)
      .where(eq(runsTable.projectId, project.id))
      .orderBy(desc(runsTable.updatedAt)),
    db
      .select()
      .from(findingsTable)
      .where(eq(findingsTable.projectId, project.id))
      .orderBy(desc(findingsTable.updatedAt)),
    db
      .select()
      .from(reportsTable)
      .where(eq(reportsTable.projectId, project.id))
      .orderBy(desc(reportsTable.generatedAt)),
    db
      .select()
      .from(auditEventsTable)
      .where(eq(auditEventsTable.projectId, project.id))
      .orderBy(desc(auditEventsTable.createdAt))
      .limit(10),
  ]);

  res.json(
    GetProjectResponse.parse({
      project: await toProject(project),
      runs: runs.map(toRun),
      findings: findings.map(toFinding),
      reports: reports.map(toReport),
      recentAuditEvents: recentAuditEvents.map(toAuditEvent),
    }),
  );
});

router.patch("/projects/:projectId", async (req, res): Promise<void> => {
  const params = UpdateProjectParams.safeParse({
    projectId: getProjectId(req.params.projectId),
  });
  const parsed = UpdateProjectBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, params.data.projectId));
  if (!existing) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const [project] = await db
    .update(projectsTable)
    .set({
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.status !== undefined
        ? { status: parsed.data.status }
        : {}),
      ...(parsed.data.scope
        ? {
            productName: parsed.data.scope.productName,
            intendedUse: parsed.data.scope.intendedUse,
            projectPhase: parsed.data.scope.projectPhase,
            assessmentFramework: parsed.data.scope.assessmentFramework,
            jurisdictionContext:
              parsed.data.scope.jurisdictionContext ?? null,
            scopeNotes: parsed.data.scope.scopeNotes ?? null,
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(projectsTable.id, params.data.projectId))
    .returning();

  await db.insert(auditEventsTable).values({
    id: crypto.randomUUID(),
    projectId: existing.id,
    eventType: "PROJECT_UPDATED",
    actor: "Workspace user",
    description: "Updated project scope or status",
    createdAt: new Date(),
  });

  res.json(UpdateProjectResponse.parse(await toProject(project)));
});

router.get("/projects/:projectId/runs", async (req, res): Promise<void> => {
  const params = ListProjectRunsParams.safeParse({
    projectId: getProjectId(req.params.projectId),
  });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const runs = await db
    .select()
    .from(runsTable)
    .where(eq(runsTable.projectId, params.data.projectId))
    .orderBy(desc(runsTable.updatedAt));
  res.json(ListProjectRunsResponse.parse(runs.map(toRun)));
});

router.post("/projects/:projectId/runs", async (req, res): Promise<void> => {
  const params = CreateProjectRunParams.safeParse({
    projectId: getProjectId(req.params.projectId),
  });
  const parsedBody = CreateProjectRunBody.safeParse(req.body ?? {})
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, params.data.projectId));
  if (!project) {
    res.status(409).json({ error: "Project not found" });
    return;
  }

  const now = new Date();
  const [run] = await db
    .insert(runsTable)
    .values({
      id: crypto.randomUUID(),
      projectId: project.id,
      state: "CREATED",
      label: parsedBody.data.label ?? "Readiness review run",
      startedAt: now,
      updatedAt: now,
    })
    .returning();

  await db
    .update(projectsTable)
    .set({ workflowState: "CREATED", updatedAt: now })
    .where(eq(projectsTable.id, project.id));
  await db.insert(auditEventsTable).values({
    id: crypto.randomUUID(),
    projectId: project.id,
    eventType: "RUN_CREATED",
    actor: "Supervisor",
    description: `Created controlled workflow run ${run.label}`,
    createdAt: now,
  });

  // --- Phase 2A: synchronous Supervisor -> specialist agent execution ---
  // Runs a single deterministic, rule-based specialist agent against the
  // project's scope fields plus project-scoped MAG and external evidence.
  // No queue/worker. Every Finding this produces is created with status
  // REQUIRES_HUMAN_REVIEW — enforced inside runSupervisedAnalysis, not here.
  const { agentName, findings } = await runSupervisedAnalysis({
    projectId: project.id,
    runId: run.id,
    scope: toScope(project),
  });

  const insertedFindings = findings.length
    ? await db
        .insert(findingsTable)
        .values(
          findings.map((finding) => ({
            id: crypto.randomUUID(),
            projectId: project.id,
            title: finding.title,
            summary: finding.summary,
            status: finding.status,
            confidence: finding.confidence,
            provenance: finding.provenance,
            reviewerDecision: null,
            updatedAt: new Date(),
          })),
        )
        .returning()
    : [];

  const analyzedAt = new Date();

  await db
    .update(projectsTable)
    .set({ workflowState: "DOCUMENTS_ANALYZED", updatedAt: analyzedAt })
    .where(eq(projectsTable.id, project.id));

  const [updatedRun] = await db
    .update(runsTable)
    .set({ state: "DOCUMENTS_ANALYZED", updatedAt: analyzedAt })
    .where(eq(runsTable.id, run.id))
    .returning();

  await db.insert(auditEventsTable).values({
    id: crypto.randomUUID(),
    projectId: project.id,
    eventType: "DOCUMENTS_ANALYZED",
    actor: agentName,
    description: `${agentName} produced ${insertedFindings.length} finding(s) requiring human review`,
    createdAt: analyzedAt,
  });
  // --- end Phase 2A block ---

  res.status(201).json(CreateProjectRunResponse.parse(toRun(updatedRun)));
});

router.get("/projects/:projectId/findings", async (req, res): Promise<void> => {
  const params = ListProjectFindingsParams.safeParse({
    projectId: getProjectId(req.params.projectId),
  });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const findings = await db
    .select()
    .from(findingsTable)
    .where(eq(findingsTable.projectId, params.data.projectId))
    .orderBy(desc(findingsTable.updatedAt));
  res.json(ListProjectFindingsResponse.parse(findings.map(toFinding)));
});

router.get(
  "/projects/:projectId/memory",
  async (req, res): Promise<void> => {
    const params = ListProjectMemoryParams.safeParse({
      projectId: getProjectId(req.params.projectId),
    });
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const project = await db
      .select({ id: projectsTable.id })
      .from(projectsTable)
      .where(eq(projectsTable.id, params.data.projectId));

    if (!project[0]) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const memory = await retrieveProjectMemory(params.data.projectId, 20);

    res.json(
      ListProjectMemoryResponse.parse(memory.records.map(toMemoryRecord)),
    );
  },
);

router.post(
  "/projects/:projectId/memory",
  async (req, res): Promise<void> => {
    const params = CreateProjectMemoryParams.safeParse({
      projectId: getProjectId(req.params.projectId),
    });
    const parsed = CreateProjectMemoryBody.safeParse(req.body);

    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    try {
      const rawContent = parsed.data.content;
      const content =
        typeof rawContent === "string" ? { text: rawContent } : rawContent;
      const rawConfidence = parsed.data.confidence;
      const confidence =
        rawConfidence === null || rawConfidence === undefined
          ? null
          : String(rawConfidence);

      const record = await persistApprovedMemory({
        projectId: params.data.projectId,
        memoryType: parsed.data.memoryType ?? parsed.data.type!,
        content,
        source:
          parsed.data.source ??
          parsed.data.sourceLabel ??
          parsed.data.attribution ??
          "human_review",
        confidence,
        supersedesId: parsed.data.supersedesId ?? null,
      });

      await db.insert(auditEventsTable).values({
        id: crypto.randomUUID(),
        projectId: params.data.projectId,
        eventType: "MEMORY_CREATED",
        actor: "Human reviewer",
        description: `Created approved project memory: ${record.memoryType}`,
        createdAt: new Date(),
      });

      res.status(201).json(
        CreateProjectMemoryResponse.parse(toMemoryRecord(record)),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create project memory";
      res.status(message === "Project not found" ? 404 : 500).json({
        error: message,
      });
    }
  },
);

router.patch(
  "/projects/:projectId/findings/:findingId/review",
  async (req, res): Promise<void> => {
    const params = ReviewFindingParams.safeParse({
      projectId: getProjectId(req.params.projectId),
      findingId: getProjectId(req.params.findingId),
    });
    const parsed = ReviewFindingBody.safeParse(req.body);

    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [finding] = await db
      .select()
      .from(findingsTable)
      .where(
        and(
          eq(findingsTable.id, params.data.findingId),
          eq(findingsTable.projectId, params.data.projectId),
        ),
      );

    if (!finding) {
      res.status(404).json({ error: "Finding not found" });
      return;
    }

    const reviewedAt = new Date();
    const [updatedFinding] = await db
      .update(findingsTable)
      .set({
        status: parsed.data.decision,
        reviewerDecision: parsed.data.decision,
        updatedAt: reviewedAt,
      })
      .where(eq(findingsTable.id, finding.id))
      .returning();

    const normalizedDecision = parsed.data.decision.toUpperCase();
    const isApproved =
      normalizedDecision === "SUPPORTED" ||
      normalizedDecision === "APPROVED";

    let memory = null;

    if (isApproved) {
      memory = await persistApprovedMemory({
        projectId: finding.projectId,
        memoryType: parsed.data.memoryType ?? "reviewed_finding",
        content: {
          findingId: finding.id,
          title: finding.title,
          summary: finding.summary,
          provenance: finding.provenance,
          reviewerDecision: parsed.data.decision,
        },
        source: parsed.data.source ?? "human_review",
        confidence: parsed.data.confidence ?? finding.confidence,
      });
    }

    await db.insert(auditEventsTable).values({
      id: crypto.randomUUID(),
      projectId: finding.projectId,
      eventType: isApproved ? "MEMORY_CREATED" : "FINDING_REVIEWED",
      actor: "Human reviewer",
      description: isApproved
        ? `Approved finding and persisted project memory: ${finding.title}`
        : `Reviewed finding ${finding.title} with decision ${parsed.data.decision}`,
      createdAt: reviewedAt,
    });

    res.json(
      ReviewFindingResponse.parse({
        finding: toFinding(updatedFinding),
        memory: memory ? toMemoryRecord(memory) : null,
      }),
    );
  },
);

router.get("/review-queue", async (_req, res): Promise<void> => {
  const items = await db
    .select()
    .from(reviewItemsTable)
    .orderBy(desc(reviewItemsTable.createdAt));
  res.json(
    ListReviewQueueResponse.parse(
      items.map((item) => ({
        id: item.id,
        projectId: item.projectId,
        title: item.title,
        reason: item.reason,
        priority: item.priority,
        createdAt: item.createdAt,
      })),
    ),
  );
});

router.get("/projects/:projectId/reports", async (req, res): Promise<void> => {
  const params = ListProjectReportsParams.safeParse({
    projectId: getProjectId(req.params.projectId),
  });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const reports = await db
    .select()
    .from(reportsTable)
    .where(eq(reportsTable.projectId, params.data.projectId))
    .orderBy(desc(reportsTable.generatedAt));
  res.json(ListProjectReportsResponse.parse(reports.map(toReport)));
});

router.get(
  "/projects/:projectId/audit-events",
  async (req, res): Promise<void> => {
    const params = ListProjectAuditEventsParams.safeParse({
      projectId: getProjectId(req.params.projectId),
    });
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const events = await db
      .select()
      .from(auditEventsTable)
      .where(eq(auditEventsTable.projectId, params.data.projectId))
      .orderBy(desc(auditEventsTable.createdAt));
    res.json(ListProjectAuditEventsResponse.parse(events.map(toAuditEvent)));
  },
);

export default router;
