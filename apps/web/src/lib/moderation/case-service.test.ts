import assert from "node:assert/strict";
import test from "node:test";

import {
  createModerationCaseService,
  deriveCasePriority,
  type ModerationCaseStore,
} from "./case-service";

type CaseStoreTestClient = {
  $transaction(operation: (transaction: CaseStoreTestClient) => Promise<unknown>): Promise<unknown>;
  moderationCase: unknown;
  moderationCaseEvent: unknown;
  user: unknown;
  userReport: unknown;
};

function createCaseStore() {
  const cases: Array<{
    id: string;
    priority: "HIGH" | "NORMAL";
    reportCount: number;
    status: "CLOSED" | "OPEN";
    subjectId: string;
    subjectHandle: string;
  }> = [];
  const events: Array<{ caseId: string; kind: string }> = [];
  const reports = [
    { caseId: null as string | null, id: "report-1", reporterId: "reporter-1" },
    { caseId: null as string | null, id: "report-2", reporterId: "reporter-2" },
  ];
  const client: CaseStoreTestClient = {
    $transaction: async (operation: (transaction: typeof client) => Promise<unknown>) =>
      operation(client),
    moderationCase: {
      create: async ({ data }: { data: Omit<(typeof cases)[number], "id"> }) => {
        const created = { ...data, id: `case-${cases.length + 1}`, status: "OPEN" as const };
        cases.push(created);
        return created;
      },
      findFirst: async ({ where }: { where: { subjectId: string } }) =>
        cases.find((item) => item.subjectId === where.subjectId && item.status === "OPEN") ?? null,
      update: async ({
        data,
        where,
      }: {
        data: Partial<(typeof cases)[number]>;
        where: { id: string };
      }) => {
        const item = cases.find((candidate) => candidate.id === where.id);
        if (!item) throw new Error("case not found");
        Object.assign(item, data);
        return item;
      },
    },
    moderationCaseEvent: {
      create: async ({ data }: { data: { caseId: string; kind: string } }) => {
        events.push(data);
        return data;
      },
    },
    user: {
      findUnique: async () => ({ id: "subject-1", username: "reported-user" }),
    },
    userReport: {
      findMany: async ({ where }: { where: { caseId: string } }) =>
        reports.filter((report) => report.caseId === where.caseId),
      findUnique: async ({ where }: { where: { id: string } }) =>
        reports.find((report) => report.id === where.id) ?? null,
      update: async ({ data, where }: { data: { caseId: string }; where: { id: string } }) => {
        const report = reports.find((candidate) => candidate.id === where.id);
        if (!report) throw new Error("report not found");
        report.caseId = data.caseId;
        return report;
      },
    },
  };

  return { cases, client: client as unknown as ModerationCaseStore, events, reports };
}

test("derives high priority from report volume, reporter diversity, or impersonation", () => {
  assert.equal(
    deriveCasePriority({
      distinctReporters: 1,
      overridden: false,
      reason: "HARASSMENT",
      reportCount: 5,
    }),
    "HIGH",
  );
  assert.equal(
    deriveCasePriority({
      distinctReporters: 3,
      overridden: false,
      reason: "SPAM",
      reportCount: 2,
    }),
    "HIGH",
  );
  assert.equal(
    deriveCasePriority({
      distinctReporters: 1,
      overridden: false,
      reason: "IMPERSONATION",
      reportCount: 1,
    }),
    "HIGH",
  );
});

test("preserves an operator priority override", () => {
  assert.equal(
    deriveCasePriority({
      distinctReporters: 4,
      overridden: true,
      reason: "IMPERSONATION",
      reportCount: 6,
    }),
    "NORMAL",
  );
});

test("attaches later reports to the subject's open case", async () => {
  const store = createCaseStore();

  const service = createModerationCaseService({ client: store.client });
  const first = await service.attachReportToCase({
    id: "report-1",
    reason: "HARASSMENT",
    subjectId: "subject-1",
  });
  const second = await service.attachReportToCase({
    id: "report-2",
    reason: "SPAM",
    subjectId: "subject-1",
  });

  assert.deepEqual(first, { caseId: "case-1", created: true });
  assert.deepEqual(second, { caseId: "case-1", created: false });
  assert.equal(store.cases.length, 1);
  assert.equal(store.cases[0]?.reportCount, 2);
  assert.deepEqual(
    store.reports.map((report) => report.caseId),
    ["case-1", "case-1"],
  );
  assert.deepEqual(
    store.events.map((event) => event.kind),
    ["REPORT_ADDED", "REPORT_ADDED"],
  );
});

test("opens a new case when the previous one is closed", async () => {
  const store = createCaseStore();

  const service = createModerationCaseService({ client: store.client });
  await service.attachReportToCase({
    id: "report-1",
    reason: "HARASSMENT",
    subjectId: "subject-1",
  });
  store.cases[0]!.status = "CLOSED";

  const result = await service.attachReportToCase({
    id: "report-2",
    reason: "SPAM",
    subjectId: "subject-1",
  });

  assert.deepEqual(result, { caseId: "case-2", created: true });
  assert.equal(store.cases.length, 2);
  assert.deepEqual(
    store.reports.map((report) => report.caseId),
    ["case-1", "case-2"],
  );
});
