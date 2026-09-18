import { prisma, type Prisma, type ReleaseChangeType, type ReleaseChannel } from "@wizards/db";

import { lockPublication } from "./publication-service";
import { PublicationSchema } from "./publication-contract";
import { ApiError } from "@/lib/api";

const adminReleaseListSelect = {
  _count: { select: { changes: true } },
  channel: true,
  product: true,
  active: true,
  withdrawnAt: true,
  sourceSha: true,
  sourceRunId: true,
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
  publication: true,
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
  product?: "DESKTOP" | "MOBILE" | undefined;
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
    product: row.product,
    active: row.active,
    withdrawnAt: row.withdrawnAt?.toISOString() ?? null,
    sourceSha: row.sourceSha,
    sourceRunId: row.sourceRunId,
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
    managed: row.publication !== null,
    packages: PublicationSchema.safeParse(row.publication).data?.packages ?? [],
    sourceRunUrl:
      row.sourceRunId &&
      /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(process.env.WHISPR_RELEASE_GITHUB_REPOSITORY ?? "")
        ? `https://github.com/${process.env.WHISPR_RELEASE_GITHUB_REPOSITORY}/actions/runs/${row.sourceRunId}`
        : null,
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
    product: input.product ?? "MOBILE",
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
    ...(input.product === undefined ? {} : { product: input.product }),
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

export type AdminReleaseFilters = { product?: string; channel?: string; status?: string };

export async function listAdminReleases(page = 1, filters: AdminReleaseFilters = {}) {
  const currentPage = Math.max(1, Math.min(10000, Math.trunc(page) || 1));
  const rows = await prisma.release.findMany({
    where: {
      ...(["DESKTOP", "MOBILE"].includes(filters.product ?? "")
        ? { product: filters.product as "DESKTOP" | "MOBILE" }
        : {}),
      ...(["STABLE", "UAT"].includes(filters.channel ?? "")
        ? { channel: filters.channel as "STABLE" | "UAT" }
        : {}),
      ...(filters.status === "WITHDRAWN"
        ? { withdrawnAt: { not: null } }
        : filters.status === "DRAFT"
          ? { publishedAt: null, withdrawnAt: null }
          : filters.status === "PUBLISHED"
            ? { publishedAt: { not: null }, withdrawnAt: null }
            : {}),
    },
    orderBy: [{ releasedAt: "desc" }, { id: "desc" }],
    select: adminReleaseListSelect,
    take: 51,
    skip: (currentPage - 1) * 50,
  });

  return {
    releases: rows.slice(0, 50).map(toAdminReleaseListItem),
    page: currentPage,
    hasMore: rows.length > 50,
  };
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
  findReleaseForUpdate: (releaseId: string) => Promise<{
    publishedAt: Date | null;
    version: string;
    channel?: string;
    product?: string;
    publicationDigest?: string | null;
    releasedAt?: Date;
  } | null>;
  updateRelease: (
    releaseId: string,
    data: Prisma.ReleaseUpdateInput,
  ) => Promise<AdminReleaseDetailRow>;
};

const updateDependencies: UpdateAdminReleaseDependencies = {
  findReleaseForUpdate: (releaseId) =>
    prisma.release.findUnique({
      select: {
        publishedAt: true,
        version: true,
        channel: true,
        product: true,
        publicationDigest: true,
        releasedAt: true,
      },
      where: { id: releaseId },
    }),
  updateRelease: (releaseId, data) =>
    prisma.release.update({
      data,
      select: adminReleaseDetailSelect,
      // Re-check immutable fields in the write itself: publication may commit
      // between the earlier read and this update of a formerly draft release.
      where: {
        id: releaseId,
        OR: [
          { publishedAt: null },
          {
            publishedAt: { not: null },
            ...(typeof data.version === "string" ? { version: data.version } : {}),
            ...(typeof data.channel === "string" ? { channel: data.channel } : {}),
            ...(typeof data.product === "string" ? { product: data.product } : {}),
            ...(data.buildNumber !== undefined || data.sizeBytes !== undefined
              ? { publicationDigest: null }
              : {}),
            ...(data.releasedAt instanceof Date
              ? {
                  OR: [{ publicationDigest: null }, { releasedAt: data.releasedAt }],
                }
              : {}),
          },
        ],
      },
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

  if (
    existing.publishedAt &&
    ((input.channel !== undefined && input.channel !== existing.channel) ||
      (input.product !== undefined && input.product !== existing.product) ||
      (existing.publicationDigest &&
        ((input.releasedAt !== undefined &&
          new Date(input.releasedAt).getTime() !== existing.releasedAt?.getTime()) ||
          input.buildNumber !== undefined ||
          input.sizeBytes !== undefined)))
  ) {
    throw new ApiError(
      "Published package metadata cannot be changed",
      409,
      "PUBLICATION_IMMUTABLE",
    );
  }
  const row = await dependencies.updateRelease(releaseId, releasePatchData(input));

  return { release: toAdminReleaseDetail(row) };
}

export async function deleteAdminRelease(releaseId: string) {
  const existing = await prisma.release.findUnique({
    select: { id: true, publishedAt: true },
    where: { id: releaseId },
  });

  if (!existing) {
    throw new ApiError("Release not found", 404, "RELEASE_NOT_FOUND");
  }

  if (existing.publishedAt)
    throw new ApiError(
      "Withdraw published releases instead of deleting history",
      409,
      "PUBLISHED_RELEASE_IMMUTABLE",
    );
  await prisma.release.delete({ where: { id: releaseId, publishedAt: null } });

  return { deleted: true as const };
}

export async function publishAdminRelease(releaseId: string) {
  const row = await prisma.$transaction(async (transaction) => {
    const existing = await transaction.release.findUnique({
      select: {
        publishedAt: true,
        publicationDigest: true,
        withdrawnAt: true,
        product: true,
        channel: true,
      },
      where: { id: releaseId },
    });

    if (!existing) {
      throw new ApiError("Release not found", 404, "RELEASE_NOT_FOUND");
    }

    if (existing.withdrawnAt || existing.publicationDigest || existing.product === "DESKTOP")
      throw new ApiError(
        "Packages must be published by the verified release workflow",
        409,
        "PUBLICATION_WORKFLOW_REQUIRED",
      );
    await lockPublication(transaction, existing);
    const managed = await transaction.release.findFirst({
      where: {
        product: existing.product,
        channel: existing.channel,
        publicationDigest: { not: null },
        active: true,
      },
      select: { id: true },
    });
    return transaction.release.update({
      data: { publishedAt: existing.publishedAt ?? new Date(), active: !managed },
      select: adminReleaseDetailSelect,
      where: { id: releaseId, publicationDigest: null, withdrawnAt: null, product: "MOBILE" },
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
