import { prisma, type Prisma, type ReleaseChangeType, type ReleaseChannel } from "@wizards/db";

import { ApiError } from "@/lib/api";

const adminReleaseListSelect = {
  _count: { select: { changes: true } },
  channel: true,
  codename: true,
  createdAt: true,
  id: true,
  publishedAt: true,
  releasedAt: true,
  updatedAt: true,
  version: true,
} satisfies Prisma.ReleaseSelect;

const adminReleaseDetailSelect = {
  ...adminReleaseListSelect,
  buildNumber: true,
  changes: {
    orderBy: [{ position: "asc" }, { id: "asc" }],
    select: { detail: true, id: true, position: true, title: true, type: true },
  },
  highlight: true,
  mandatory: true,
  sizeBytes: true,
  summary: true,
} satisfies Prisma.ReleaseSelect;

type AdminReleaseListRow = Prisma.ReleaseGetPayload<{ select: typeof adminReleaseListSelect }>;
type AdminReleaseDetailRow = Prisma.ReleaseGetPayload<{ select: typeof adminReleaseDetailSelect }>;

export type AdminReleaseInput = {
  buildNumber?: number | null | undefined;
  channel: ReleaseChannel;
  codename?: string | null | undefined;
  highlight?: string | null | undefined;
  mandatory: boolean;
  releasedAt: string;
  sizeBytes?: number | null | undefined;
  summary?: string | null | undefined;
  version: string;
};

export type AdminReleasePatchInput = {
  [Key in keyof AdminReleaseInput]?: AdminReleaseInput[Key] | undefined;
};

export type AdminReleaseChangeInput = {
  detail?: string | null | undefined;
  title: string;
  type: ReleaseChangeType;
};

function toAdminReleaseListItem(row: AdminReleaseListRow) {
  return {
    changeCount: row._count.changes,
    channel: row.channel,
    codename: row.codename,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    releasedAt: row.releasedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
  };
}

function toAdminReleaseDetail(row: AdminReleaseDetailRow) {
  return {
    ...toAdminReleaseListItem(row),
    buildNumber: row.buildNumber,
    changes: row.changes,
    highlight: row.highlight,
    mandatory: row.mandatory,
    sizeBytes: row.sizeBytes === null ? null : Number(row.sizeBytes),
    summary: row.summary,
  };
}

function releaseData(input: AdminReleaseInput): Prisma.ReleaseUncheckedCreateInput {
  return {
    buildNumber: input.buildNumber ?? null,
    channel: input.channel,
    codename: input.codename ?? null,
    highlight: input.highlight ?? null,
    mandatory: input.mandatory,
    releasedAt: new Date(input.releasedAt),
    sizeBytes: input.sizeBytes === null || input.sizeBytes === undefined ? null : input.sizeBytes,
    summary: input.summary ?? null,
    version: input.version,
  };
}

function releasePatchData(input: AdminReleasePatchInput): Prisma.ReleaseUpdateInput {
  return {
    ...(input.buildNumber === undefined ? {} : { buildNumber: input.buildNumber }),
    ...(input.channel === undefined ? {} : { channel: input.channel }),
    ...(input.codename === undefined ? {} : { codename: input.codename }),
    ...(input.highlight === undefined ? {} : { highlight: input.highlight }),
    ...(input.mandatory === undefined ? {} : { mandatory: input.mandatory }),
    ...(input.releasedAt === undefined ? {} : { releasedAt: new Date(input.releasedAt) }),
    ...(input.sizeBytes === undefined ? {} : { sizeBytes: input.sizeBytes }),
    ...(input.summary === undefined ? {} : { summary: input.summary }),
    ...(input.version === undefined ? {} : { version: input.version }),
  };
}

export async function listAdminReleases() {
  const rows = await prisma.release.findMany({
    orderBy: [{ releasedAt: "desc" }, { id: "desc" }],
    select: adminReleaseListSelect,
  });

  return { releases: rows.map(toAdminReleaseListItem) };
}

export async function getAdminRelease(releaseId: string) {
  const row = await prisma.release.findUnique({
    select: adminReleaseDetailSelect,
    where: { id: releaseId },
  });

  if (!row) {
    throw new ApiError("Release not found", 404, "RELEASE_NOT_FOUND");
  }

  return { release: toAdminReleaseDetail(row) };
}

export async function createAdminRelease(input: AdminReleaseInput) {
  const row = await prisma.release.create({
    data: releaseData(input),
    select: adminReleaseDetailSelect,
  });

  return { release: toAdminReleaseDetail(row) };
}

export type UpdateAdminReleaseDependencies = {
  findReleaseForUpdate: (
    releaseId: string,
  ) => Promise<{ publishedAt: Date | null; version: string } | null>;
  updateRelease: (
    releaseId: string,
    data: Prisma.ReleaseUpdateInput,
  ) => Promise<AdminReleaseDetailRow>;
};

const updateDependencies: UpdateAdminReleaseDependencies = {
  findReleaseForUpdate: (releaseId) =>
    prisma.release.findUnique({
      select: { publishedAt: true, version: true },
      where: { id: releaseId },
    }),
  updateRelease: (releaseId, data) =>
    prisma.release.update({
      data,
      select: adminReleaseDetailSelect,
      where: { id: releaseId },
    }),
};

export async function updateAdminRelease(
  releaseId: string,
  input: AdminReleasePatchInput,
  dependencies: UpdateAdminReleaseDependencies = updateDependencies,
) {
  const existing = await dependencies.findReleaseForUpdate(releaseId);

  if (!existing) {
    throw new ApiError("Release not found", 404, "RELEASE_NOT_FOUND");
  }

  if (
    existing.publishedAt !== null &&
    input.version !== undefined &&
    input.version !== existing.version
  ) {
    throw new ApiError(
      "Published release version cannot be changed",
      409,
      "PUBLISHED_RELEASE_VERSION_IMMUTABLE",
    );
  }

  const row = await dependencies.updateRelease(releaseId, releasePatchData(input));

  return { release: toAdminReleaseDetail(row) };
}

export async function deleteAdminRelease(releaseId: string) {
  const existing = await prisma.release.findUnique({
    select: { id: true },
    where: { id: releaseId },
  });

  if (!existing) {
    throw new ApiError("Release not found", 404, "RELEASE_NOT_FOUND");
  }

  await prisma.release.delete({ where: { id: releaseId } });

  return { deleted: true as const };
}

export async function publishAdminRelease(releaseId: string) {
  const row = await prisma.$transaction(async (transaction) => {
    const existing = await transaction.release.findUnique({
      select: { publishedAt: true },
      where: { id: releaseId },
    });

    if (!existing) {
      throw new ApiError("Release not found", 404, "RELEASE_NOT_FOUND");
    }

    return transaction.release.update({
      data: { publishedAt: existing.publishedAt ?? new Date() },
      select: adminReleaseDetailSelect,
      where: { id: releaseId },
    });
  });

  return { release: toAdminReleaseDetail(row) };
}

export type AdminReleaseChangeTransaction = {
  createManyChanges(data: Prisma.ReleaseChangeCreateManyInput[]): Promise<unknown>;
  deleteChanges(releaseId: string): Promise<unknown>;
  findRelease(releaseId: string): Promise<{ id: string } | null>;
};

export type ReplaceAdminReleaseChangesDependencies = {
  transaction<T>(operation: (transaction: AdminReleaseChangeTransaction) => Promise<T>): Promise<T>;
};

const replaceChangesDependencies: ReplaceAdminReleaseChangesDependencies = {
  transaction: (operation) =>
    prisma.$transaction((transaction) =>
      operation({
        createManyChanges: (data) => transaction.releaseChange.createMany({ data }),
        deleteChanges: (releaseId) =>
          transaction.releaseChange.deleteMany({ where: { releaseId } }),
        findRelease: (releaseId) =>
          transaction.release.findUnique({ select: { id: true }, where: { id: releaseId } }),
      }),
    ),
};

export async function replaceAdminReleaseChanges(
  releaseId: string,
  changes: AdminReleaseChangeInput[],
  dependencies: ReplaceAdminReleaseChangesDependencies = replaceChangesDependencies,
) {
  return dependencies.transaction(async (transaction) => {
    const release = await transaction.findRelease(releaseId);

    if (!release) {
      throw new ApiError("Release not found", 404, "RELEASE_NOT_FOUND");
    }

    const rows: Prisma.ReleaseChangeCreateManyInput[] = changes.map((change, position) => ({
      detail: change.detail ?? null,
      position,
      releaseId,
      title: change.title,
      type: change.type,
    }));

    await transaction.deleteChanges(releaseId);

    if (rows.length > 0) {
      await transaction.createManyChanges(rows);
    }

    return { changes: rows };
  });
}
