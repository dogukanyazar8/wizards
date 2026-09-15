import { z } from "zod";

const nullableTrimmedText = (maximum: number) =>
  z.string().trim().max(maximum).nullable().optional();

export const AdminReleaseInputSchema = z
  .object({
    buildNumber: z.number().int().nonnegative().nullable().optional(),
    channel: z.enum(["STABLE", "UAT"]),
    codename: nullableTrimmedText(48),
    highlight: nullableTrimmedText(160),
    mandatory: z.boolean(),
    releasedAt: z.iso.datetime({ offset: true }),
    sizeBytes: z.number().int().nonnegative().safe().nullable().optional(),
    summary: nullableTrimmedText(600),
    version: z
      .string()
      .trim()
      .min(1)
      .max(32)
      .regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u, "Invalid semantic version"),
  })
  .strict();

/**
 * SPEC-INDIRME §B kataloğu. Bağlantı **yalnız** HTTPS: bu değer yönetim
 * konsolundan yazılıyor ve doğrudan kullanıcının tıkladığı bağlantı oluyor.
 *
 * `publishedAt` burada yok: yayınlama ayrı ve açık bir eylemdir (`publish`),
 * `Release` modelindeki sözleşmenin aynısı.
 */
export const AdminDownloadArtifactInputSchema = z
  .object({
    buildLabel: nullableTrimmedText(32),
    channel: z.enum(["STABLE", "UAT"]),
    delivery: z.enum(["DIRECT", "STORE", "TESTFLIGHT"]),
    extensionLabelEn: z.string().trim().min(1).max(120),
    extensionLabelTr: z.string().trim().min(1).max(120),
    metaLabelEn: z.string().trim().min(1).max(120),
    metaLabelTr: z.string().trim().min(1).max(120),
    platform: z.enum(["WINDOWS", "MACOS", "LINUX", "ANDROID", "IOS"]),
    releasedAt: z.iso.datetime({ offset: true }),
    sha256: z
      .string()
      .trim()
      .regex(/^[a-f0-9]{64}$/u, "Invalid SHA-256 digest")
      .nullable()
      .optional(),
    sizeBytes: z.number().int().positive().safe().nullable().optional(),
    url: z
      .string()
      .trim()
      .url()
      .max(2_048)
      .refine((value) => value.startsWith("https://"), "Download links must use HTTPS"),
    versionLabel: z.string().trim().min(1).max(32),
  })
  .strict();

export const AdminDownloadArtifactPatchSchema = AdminDownloadArtifactInputSchema.partial()
  .extend({ published: z.boolean().optional() })
  .refine((input) => Object.keys(input).length > 0, "At least one field is required");

export const AdminReleasePatchSchema = AdminReleaseInputSchema.partial().refine(
  (input) => Object.keys(input).length > 0,
  "At least one field is required",
);

export const AdminReleaseChangesSchema = z
  .object({
    changes: z
      .array(
        z
          .object({
            detail: nullableTrimmedText(600),
            title: z.string().trim().min(1).max(200),
            type: z.enum(["NEW", "IMPROVED", "FIXED"]),
          })
          .strict(),
      )
      .max(200),
  })
  .strict();

export const AdminDownloadArtifactIdParamsSchema = z
  .object({ artifactId: z.string().trim().min(1).max(128) })
  .strict();

export const AdminReleaseIdParamsSchema = z
  .object({ releaseId: z.string().trim().min(1).max(128) })
  .strict();

const OtaSignatureSchema = z
  .string()
  .min(1)
  .max(8_192)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/);

export const AdminOtaBundleInputSchema = z
  .object({
    bundleKey: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
    channel: z.enum(["STABLE", "UAT"]),
    enabled: z.boolean(),
    id: z.string().uuid(),
    manifestBody: z.string().min(2).max(900_000),
    manifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
    manifestSignature: OtaSignatureSchema,
    noUpdateDirectiveBody: z.string().min(2).max(2_048),
    noUpdateDirectiveSignature: OtaSignatureSchema,
    platform: z.enum(["ANDROID", "IOS"]),
    rollbackDirectiveBody: z.string().min(2).max(2_048),
    rollbackDirectiveSignature: OtaSignatureSchema,
    rolloutPercentage: z.number().int().min(0).max(100),
    runtimeVersion: z.string().trim().min(1).max(256),
    signingKeyId: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9._-]+$/),
  })
  .strict();

export const AdminOtaBundleEnabledSchema = z
  .object({
    bundleId: z.string().uuid(),
    enabled: z.boolean(),
  })
  .strict();

export const AdminReleaseArtifactInputSchema = z
  .object({
    kind: z.enum(["APK", "AAB", "IPA"]),
    platform: z.enum(["ANDROID", "IOS"]),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    signingCertSha256: z
      .string()
      .regex(/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/)
      .optional(),
    sizeBytes: z.number().int().positive().safe(),
    url: z.url().max(2_048),
    versionCode: z.number().int().positive(),
  })
  .strict();

export const AdminHelpArticleInputSchema = z
  .object({
    bodyMarkdown: z.string().max(200_000).nullable().optional(),
    category: z.enum(["ACCOUNT", "CHAT", "MEDIA", "SERVER"]),
    position: z.number().int().nonnegative(),
    published: z.boolean(),
    readMinutes: z.number().int().min(1).max(120),
    slug: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u, "Invalid slug"),
    title: z.string().trim().min(1).max(200),
    url: z.url().max(2048),
  })
  .strict();

export const AdminHelpArticlePatchSchema = AdminHelpArticleInputSchema.partial().refine(
  (input) => Object.keys(input).length > 0,
  "At least one field is required",
);

export const AdminHelpArticleIdParamsSchema = z
  .object({ articleId: z.string().trim().min(1).max(128) })
  .strict();

export const AdminBugReportIdParamsSchema = z
  .object({ reportId: z.string().trim().min(1).max(128) })
  .strict();

export const AdminBugReportStatusPatchSchema = z
  .object({ status: z.enum(["OPEN", "TRIAGED", "RESOLVED", "DISCARDED"]) })
  .strict();
