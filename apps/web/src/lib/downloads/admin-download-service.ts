import { prisma, type Prisma } from "@wizards/db";
import type { z } from "zod";

import { ApiError } from "@/lib/api";
import type {
  AdminDownloadArtifactInputSchema,
  AdminDownloadArtifactPatchSchema,
} from "@/lib/admin/content-schemas";

/**
 * SPEC-INDIRME §B kataloğunun yönetim tarafı.
 *
 * Katalog DB kaynaklı (K1), yani pencerenin dolu olması bu konsolun
 * beslenmesine bağlı. `publishedAt` yalnız açık bir yayınlama eylemiyle dolar:
 * taslak bir satır hiçbir kullanıcı ucunda görünmez.
 */

export type AdminDownloadArtifactInput = z.infer<typeof AdminDownloadArtifactInputSchema>;
export type AdminDownloadArtifactPatch = z.infer<typeof AdminDownloadArtifactPatchSchema>;

const adminDownloadSelect = {
  buildLabel: true,
  channel: true,
  createdAt: true,
  delivery: true,
  extensionLabelEn: true,
  extensionLabelTr: true,
  id: true,
  metaLabelEn: true,
  metaLabelTr: true,
  platform: true,
  publishedAt: true,
  releasedAt: true,
  sha256: true,
  sizeBytes: true,
  updatedAt: true,
  url: true,
  versionLabel: true,
} satisfies Prisma.DownloadArtifactSelect;

type AdminDownloadRow = Prisma.DownloadArtifactGetPayload<{ select: typeof adminDownloadSelect }>;

export type AdminDownloadArtifact = Omit<
  AdminDownloadRow,
  "createdAt" | "publishedAt" | "releasedAt" | "sizeBytes" | "updatedAt"
> & {
  createdAt: string;
  publishedAt: string | null;
  releasedAt: string;
  sizeBytes: number | null;
  updatedAt: string;
};

function toAdminArtifact(row: AdminDownloadRow): AdminDownloadArtifact {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    releasedAt: row.releasedAt.toISOString(),
    // `BigInt` tele çıkmaz; sütun büyük, değer küçük.
    sizeBytes: row.sizeBytes === null ? null : Number(row.sizeBytes),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type AdminDownloadServiceDependencies = {
  create(data: Prisma.DownloadArtifactUncheckedCreateInput): Promise<AdminDownloadRow>;
  findMany(): Promise<AdminDownloadRow[]>;
  isUniqueViolation(error: unknown): boolean;
  now(): Date;
  remove(id: string): Promise<void>;
  update(
    id: string,
    data: Prisma.DownloadArtifactUncheckedUpdateInput,
  ): Promise<AdminDownloadRow | null>;
};

/** `P2002` = aynı ortam ve platform için ikinci bir satır. */
export function isDownloadUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

const defaultDependencies: AdminDownloadServiceDependencies = {
  create: (data) => prisma.downloadArtifact.create({ data, select: adminDownloadSelect }),
  findMany: () =>
    prisma.downloadArtifact.findMany({
      orderBy: [{ channel: "asc" }, { platform: "asc" }],
      select: adminDownloadSelect,
    }),
  isUniqueViolation: isDownloadUniqueViolation,
  now: () => new Date(),
  remove: async (id) => {
    await prisma.downloadArtifact.delete({ where: { id } });
  },
  update: (id, data) =>
    prisma.downloadArtifact.update({ data, select: adminDownloadSelect, where: { id } }),
};

export async function listAdminDownloadArtifacts(
  dependencies: AdminDownloadServiceDependencies = defaultDependencies,
): Promise<{ artifacts: AdminDownloadArtifact[] }> {
  const rows = await dependencies.findMany();
  return { artifacts: rows.map(toAdminArtifact) };
}

function toCreateData(
  input: AdminDownloadArtifactInput,
): Prisma.DownloadArtifactUncheckedCreateInput {
  return {
    buildLabel: input.buildLabel ?? null,
    channel: input.channel,
    delivery: input.delivery,
    extensionLabelEn: input.extensionLabelEn,
    extensionLabelTr: input.extensionLabelTr,
    metaLabelEn: input.metaLabelEn,
    metaLabelTr: input.metaLabelTr,
    platform: input.platform,
    releasedAt: new Date(input.releasedAt),
    sha256: input.sha256 ?? null,
    sizeBytes: input.sizeBytes == null ? null : BigInt(input.sizeBytes),
    url: input.url,
    versionLabel: input.versionLabel,
  };
}

export async function createAdminDownloadArtifact(
  input: AdminDownloadArtifactInput,
  dependencies: AdminDownloadServiceDependencies = defaultDependencies,
): Promise<{ artifact: AdminDownloadArtifact }> {
  try {
    return { artifact: toAdminArtifact(await dependencies.create(toCreateData(input))) };
  } catch (error) {
    if (dependencies.isUniqueViolation(error)) {
      throw new ApiError(
        "This environment already has a package for that platform.",
        409,
        "DOWNLOAD_ARTIFACT_EXISTS",
      );
    }

    throw error;
  }
}

export async function updateAdminDownloadArtifact(
  id: string,
  patch: AdminDownloadArtifactPatch,
  dependencies: AdminDownloadServiceDependencies = defaultDependencies,
): Promise<{ artifact: AdminDownloadArtifact }> {
  const { buildLabel, published, releasedAt, sha256, sizeBytes, ...rest } = patch;
  // `exactOptionalPropertyTypes` altında `...rest` yayılımı `undefined`
  // taşıyabilir; Prisma bunu "alanı sıfırla" diye okuyamaz. Bu yüzden her alan
  // açıkça, yalnız gönderilmişse konur.
  const data: Prisma.DownloadArtifactUncheckedUpdateInput = {
    ...Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined)),
    ...(buildLabel === undefined ? {} : { buildLabel: buildLabel ?? null }),
    ...(published === undefined ? {} : { publishedAt: published ? dependencies.now() : null }),
    ...(releasedAt === undefined ? {} : { releasedAt: new Date(releasedAt) }),
    ...(sha256 === undefined ? {} : { sha256: sha256 ?? null }),
    ...(sizeBytes === undefined ? {} : { sizeBytes: sizeBytes == null ? null : BigInt(sizeBytes) }),
  };

  try {
    const row = await dependencies.update(id, data);

    if (row === null) {
      throw new ApiError("Download package was not found.", 404, "DOWNLOAD_ARTIFACT_NOT_FOUND");
    }

    return { artifact: toAdminArtifact(row) };
  } catch (error) {
    if (dependencies.isUniqueViolation(error)) {
      throw new ApiError(
        "This environment already has a package for that platform.",
        409,
        "DOWNLOAD_ARTIFACT_EXISTS",
      );
    }

    throw error;
  }
}

export async function deleteAdminDownloadArtifact(
  id: string,
  dependencies: AdminDownloadServiceDependencies = defaultDependencies,
): Promise<{ deleted: true }> {
  await dependencies.remove(id);
  return { deleted: true };
}
