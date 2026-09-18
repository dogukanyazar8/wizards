import { createHash } from "node:crypto";
import { z } from "zod";

const numeric = "(?:0|[1-9][0-9]*)";
const identifier = "(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)";
export const publicationVersionPattern = new RegExp(
  `^${numeric}\\.${numeric}\\.${numeric}(?:-${identifier}(?:\\.${identifier})*)?$`,
  "u",
);
const PackageSchema = z
  .object({
    platform: z.enum(["WINDOWS", "MACOS", "LINUX", "ANDROID", "IOS"]),
    arch: z.enum(["x86_64", "aarch64", "universal"]),
    url: z.string().url().max(2048),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
    sizeBytes: z.number().int().positive().max(2_147_483_647),
    signature: z
      .string()
      .regex(/^[A-Za-z0-9+/=\r\n]+$/u)
      .min(8)
      .max(4096)
      .optional(),
    versionCode: z.number().int().positive().max(2_100_000_000).optional(),
    signingCertSha256: z
      .string()
      .regex(/^(?:[a-fA-F0-9]{64}|(?:[a-fA-F0-9]{2}:){31}[a-fA-F0-9]{2})$/u)
      .transform((value) => value.replaceAll(":", "").toUpperCase().match(/.{2}/gu)!.join(":"))
      .optional(),
  })
  .strict();

export const PublicationSchema = z
  .object({
    product: z.enum(["DESKTOP", "MOBILE"]),
    channel: z.enum(["STABLE", "UAT"]),
    version: z.string().max(32).regex(publicationVersionPattern),
    sourceSha: z.string().regex(/^[a-f0-9]{40}$/u),
    sourceRunId: z.string().regex(/^[1-9][0-9]{0,19}$/u),
    baselineSha: z
      .string()
      .regex(/^[a-f0-9]{40}$/u)
      .nullable(),
    changes: z
      .array(
        z
          .object({
            type: z.enum(["NEW", "IMPROVED", "FIXED"]),
            title: z.string().trim().min(1).max(200),
            detail: z.string().max(600).optional(),
          })
          .strict(),
      )
      .max(200),
    packages: z.array(PackageSchema).min(1).max(5),
  })
  .strict()
  .superRefine((value, ctx) => {
    const platforms = new Set<string>();
    for (const item of value.packages) {
      const desktop = value.product === "DESKTOP";
      const ring = value.channel === "UAT" ? "uat" : desktop ? "stable" : "production";
      const url = new URL(item.url);
      const prefix = `/${desktop ? "desktop" : "mobile"}/${ring}/releases/`;
      const path = url.pathname.slice(prefix.length);
      const validPath =
        url.pathname.startsWith(prefix) && /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/u.test(path);
      if (
        url.origin !== "https://updates.whispr.team" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        !validPath
      ) {
        ctx.addIssue({ code: "custom", message: "Package must use an immutable release URL" });
      }
      if (platforms.has(item.platform))
        ctx.addIssue({ code: "custom", message: "One package per platform is supported" });
      platforms.add(item.platform);
      if (desktop) {
        if (
          !["WINDOWS", "MACOS", "LINUX"].includes(item.platform) ||
          !item.signature ||
          item.versionCode !== undefined ||
          item.signingCertSha256 !== undefined
        ) {
          ctx.addIssue({
            code: "custom",
            message: "Desktop package requires an updater signature",
          });
        }
      } else if (
        item.platform !== "ANDROID" ||
        value.channel !== "UAT" ||
        !item.versionCode ||
        !item.signingCertSha256 ||
        item.signature ||
        !url.pathname.endsWith(".apk")
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Only signed Android UAT APK publication is supported",
        });
      }
    }
  });

export type Publication = z.infer<typeof PublicationSchema>;
export type PublicationScope = Pick<Publication, "product" | "channel">;

/** Notes, baseline and run can differ on a replay. Artifact identity cannot. */
export function publicationDigest(input: Publication): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        product: input.product,
        channel: input.channel,
        version: input.version,
        sourceSha: input.sourceSha,
        packages: [...input.packages].sort((a, b) => a.platform.localeCompare(b.platform)),
      }),
    )
    .digest("hex");
}

export function comparePublicationVersions(left: string, right: string): number {
  if (!publicationVersionPattern.test(left) || !publicationVersionPattern.test(right))
    throw new Error("Invalid semantic version");
  const [lc, lp] = left.split(/-(.*)/su);
  const [rc, rp] = right.split(/-(.*)/su);
  const l = lc!.split(".").map(BigInt),
    r = rc!.split(".").map(BigInt);
  for (let i = 0; i < 3; i++) if (l[i] !== r[i]) return l[i]! > r[i]! ? 1 : -1;
  if (lp === rp) return 0;
  if (lp === undefined) return 1;
  if (rp === undefined) return -1;
  const a = lp.split("."),
    b = rp.split(".");
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === b[i]) continue;
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    const an = /^\d+$/u.test(a[i]!),
      bn = /^\d+$/u.test(b[i]!);
    if (an && bn) return BigInt(a[i]!) > BigInt(b[i]!) ? 1 : -1;
    if (an !== bn) return an ? -1 : 1;
    return a[i]! > b[i]! ? 1 : -1;
  }
  return 0;
}
