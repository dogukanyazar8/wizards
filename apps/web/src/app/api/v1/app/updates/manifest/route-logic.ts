import { prisma } from "@wizards/db";
import { z } from "zod";

import { jsonError, ApiError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import {
  buildExpoMultipartResponse,
  resolveOtaManifest,
  type OtaBundleRecord,
  type OtaManifestPart,
  type OtaManifestRequest,
  type OtaManifestRepository,
} from "@/lib/app/ota-manifest-service";
import {
  createNetworkRateLimitIdentity,
  createSubjectRateLimitIdentity,
} from "@/lib/security/client-ip";

const OtaRequestHeadersSchema = z
  .object({
    channel: z.enum(["uat", "canary", "production"]),
    currentUpdateId: z.string().uuid().optional(),
    expectSignature: z.string().min(1).max(512).optional(),
    installationId: z.string().trim().min(1).max(256).optional(),
    platform: z.enum(["android", "ios"]),
    protocolVersion: z.literal("1"),
    runtimeVersion: z.string().trim().min(1).max(256),
  })
  .strict();

function toRecord(bundle: Awaited<ReturnType<typeof prisma.otaBundle.findFirst>>) {
  if (!bundle) {
    return null;
  }
  return bundle as OtaBundleRecord;
}

const prismaRepository: OtaManifestRepository = {
  async findLatestCompatible({ channel, platform, runtimeVersion }) {
    return toRecord(
      await prisma.otaBundle.findFirst({
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        where: {
          channel,
          platform,
          publishedAt: { not: null },
          runtimeVersion,
        },
      }),
    );
  },
  async findLatestSigningBundle({ channel, platform }) {
    return toRecord(
      await prisma.otaBundle.findFirst({
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        where: {
          channel,
          platform,
          publishedAt: { not: null },
        },
      }),
    );
  },
};

export type OtaManifestRouteDependencies = {
  enforceRateLimit(key: string, action: "app:updates:manifest"): Promise<void>;
  resolveManifest(request: OtaManifestRequest): Promise<OtaManifestPart | null>;
};

const defaultDependencies: OtaManifestRouteDependencies = {
  enforceRateLimit: enforceApiRateLimit,
  resolveManifest: (request) => resolveOtaManifest(request, prismaRepository),
};

const EXPO_RESPONSE_HEADERS = {
  "Cache-Control": "private, max-age=0",
  "Expo-Protocol-Version": "1",
  "Expo-SFV-Version": "0",
} as const;

function rateIdentities(request: Request, headers: z.infer<typeof OtaRequestHeadersSchema>) {
  const subject = headers.installationId
    ? { namespace: "installation", value: headers.installationId }
    : headers.currentUpdateId
      ? { namespace: "current-update", value: headers.currentUpdateId }
      : {
          namespace: "runtime",
          value: `${headers.channel}\0${headers.platform}\0${headers.runtimeVersion}`,
        };

  return {
    network: `ota:network:${createNetworkRateLimitIdentity({
      headers: request.headers,
    })}`,
    recipient: `ota:installation:${createSubjectRateLimitIdentity(
      subject.namespace,
      subject.value,
    )}`,
  };
}

function parseHeaders(request: Request) {
  return OtaRequestHeadersSchema.parse({
    channel: request.headers.get("expo-channel-name") ?? undefined,
    currentUpdateId: request.headers.get("expo-current-update-id") ?? undefined,
    expectSignature: request.headers.get("expo-expect-signature") ?? undefined,
    installationId: request.headers.get("expo-installation-id") ?? undefined,
    platform: request.headers.get("expo-platform") ?? undefined,
    protocolVersion: request.headers.get("expo-protocol-version") ?? undefined,
    runtimeVersion: request.headers.get("expo-runtime-version") ?? undefined,
  });
}

function assertExpectedSignature(expectSignature: string | undefined, part: OtaManifestPart) {
  if (!expectSignature) {
    return;
  }

  const keyId = /(?:^|,)\s*keyid="([^"]+)"/iu.exec(expectSignature)?.[1];
  const algorithm = /(?:^|,)\s*alg="([^"]+)"/iu.exec(expectSignature)?.[1];
  if (!/\bsig\b/iu.test(expectSignature)) {
    throw new ApiError("Unsupported Expo signature request", 406);
  }
  if (keyId && keyId !== part.signingKeyId) {
    throw new ApiError("Unsupported Expo signing key", 406);
  }
  if (algorithm && algorithm !== "rsa-v1_5-sha256") {
    throw new ApiError("Unsupported Expo signature algorithm", 406);
  }
}

export async function otaManifestRoute(
  request: Request,
  dependencies: OtaManifestRouteDependencies = defaultDependencies,
) {
  try {
    const headers = parseHeaders(request);
    const limiterKeys = rateIdentities(request, headers);
    await Promise.all([
      dependencies.enforceRateLimit(limiterKeys.network, "app:updates:manifest"),
      dependencies.enforceRateLimit(limiterKeys.recipient, "app:updates:manifest"),
    ]);
    const part = await dependencies.resolveManifest({
      channel: headers.channel,
      ...(headers.currentUpdateId ? { currentUpdateId: headers.currentUpdateId } : {}),
      installationId: headers.installationId ?? headers.currentUpdateId ?? limiterKeys.recipient,
      platform: headers.platform,
      runtimeVersion: headers.runtimeVersion,
    });

    if (!part) {
      return new Response(null, {
        headers: EXPO_RESPONSE_HEADERS,
        status: 204,
      });
    }

    assertExpectedSignature(headers.expectSignature, part);
    const multipart = buildExpoMultipartResponse(part);
    return new Response(multipart.body, {
      headers: {
        ...EXPO_RESPONSE_HEADERS,
        "Content-Type": multipart.contentType,
      },
      status: 200,
    });
  } catch (error) {
    return jsonError(error);
  }
}
