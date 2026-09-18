import { parsePublishedReleaseChannel } from "@/lib/build-release-channel";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { ApiError } from "@/lib/api";
import type { PublicationScope } from "./publication-contract";

const issuer = "https://token.actions.githubusercontent.com";
const keys = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks`), { timeoutDuration: 5000 });
type Configuration = {
  repository: string;
  repositoryId: string;
  ownerId: string;
  audience: string;
  channel: "STABLE" | "UAT";
};

function configuration(): Configuration {
  const repository = process.env.WHISPR_RELEASE_GITHUB_REPOSITORY;
  const repositoryId = process.env.WHISPR_RELEASE_GITHUB_REPOSITORY_ID;
  const ownerId = process.env.WHISPR_RELEASE_GITHUB_OWNER_ID;
  const audience = process.env.WHISPR_RELEASE_OIDC_AUDIENCE;
  const channel = parsePublishedReleaseChannel(process.env.WHISPR_RELEASE_CHANNEL);
  if (
    !repository ||
    !repositoryId ||
    !ownerId ||
    !audience ||
    !["UAT", "STABLE"].includes(channel ?? "")
  ) {
    throw new ApiError(
      "Release publisher is not configured",
      503,
      "RELEASE_PUBLISH_NOT_CONFIGURED",
    );
  }
  return {
    repository,
    repositoryId,
    ownerId,
    audience,
    channel: channel as Configuration["channel"],
  };
}

export function assertPublicationClaims(
  claims: JWTPayload,
  scope: PublicationScope,
  config: Configuration,
) {
  const ref = `refs/heads/${scope.channel === "UAT" ? "uat" : "main"}`;
  const product = scope.product === "DESKTOP" ? "desktop" : "mobile";
  const environment = `${product}-${scope.channel === "UAT" ? "uat" : product === "desktop" ? "stable" : "production"}`;
  if (
    scope.channel !== config.channel ||
    claims.repository !== config.repository ||
    claims.repository_id !== config.repositoryId ||
    claims.repository_owner_id !== config.ownerId ||
    claims.ref !== ref ||
    claims.workflow_ref !==
      `${config.repository}/.github/workflows/${product}-release.yml@${ref}` ||
    claims.environment !== environment ||
    claims.event_name !== "workflow_dispatch" ||
    typeof claims.sha !== "string" ||
    !/^[a-f0-9]{40}$/u.test(claims.sha) ||
    typeof claims.run_id !== "string" ||
    !/^[1-9][0-9]{0,19}$/u.test(claims.run_id)
  ) {
    throw new ApiError(
      "Release publisher identity is not allowed",
      403,
      "RELEASE_PUBLISH_FORBIDDEN",
    );
  }
}

export async function requirePublicationIdentity(request: Request, scope: PublicationScope) {
  const config = configuration();
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/u)?.[1];
  if (!token || token.length > 16384) throw new ApiError("Release publisher token required", 401);
  let claims: JWTPayload;
  try {
    ({ payload: claims } = await jwtVerify(token, keys, {
      issuer,
      audience: config.audience,
      algorithms: ["RS256"],
      maxTokenAge: "10m",
      requiredClaims: ["exp", "iat", "nbf"],
    }));
  } catch {
    throw new ApiError("Release publisher token invalid", 401, "RELEASE_PUBLISH_UNAUTHORIZED");
  }
  assertPublicationClaims(claims, scope, config);
  return { sourceSha: claims.sha as string, sourceRunId: claims.run_id as string };
}
