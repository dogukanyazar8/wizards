import { createHash } from "node:crypto";
import { isIP } from "node:net";

export type ClientIpHeaderSource = {
  get(name: string): string | null | undefined;
};

function hashIdentity(namespace: string, value: string) {
  return createHash("sha256").update(`${namespace}\0${value}`).digest("base64url");
}

function mappedIpv4Address(value: string) {
  const match = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/u.exec(value);
  if (!match) {
    return null;
  }

  const high = Number.parseInt(match[1] ?? "", 16);
  const low = Number.parseInt(match[2] ?? "", 16);
  return `${high >>> 8}.${high & 0xff}.${low >>> 8}.${low & 0xff}`;
}

export function normalizeIpAddress(value: string | null | undefined) {
  const candidate = value?.trim();
  if (!candidate || candidate.includes(",")) {
    return null;
  }

  const version = isIP(candidate);
  if (version === 4) {
    return candidate;
  }
  if (version !== 6) {
    return null;
  }

  try {
    const canonical = new URL(`http://[${candidate}]/`).hostname.slice(1, -1);
    return mappedIpv4Address(canonical) ?? canonical;
  } catch {
    return null;
  }
}

export function resolveTrustedProxyClientIp(
  headers: ClientIpHeaderSource,
  env: Record<string, string | undefined> = process.env,
) {
  const configuredHops = env.TRUSTED_PROXY_HOPS?.trim();
  if (!configuredHops || !/^[1-9]\d*$/u.test(configuredHops)) {
    return null;
  }

  const trustedProxyHops = Number.parseInt(configuredHops, 10);
  const forwardedFor = headers.get("x-forwarded-for");
  if (!forwardedFor || trustedProxyHops > 32) {
    return null;
  }

  const chain = forwardedFor.split(",").map((value) => value.trim());
  if (chain.length < trustedProxyHops || chain.length > 32) {
    return null;
  }

  return normalizeIpAddress(chain[chain.length - trustedProxyHops]);
}

export function createNetworkRateLimitIdentity(input: {
  env?: Record<string, string | undefined>;
  headers: ClientIpHeaderSource;
}) {
  const trustedIp = resolveTrustedProxyClientIp(input.headers, input.env);
  if (trustedIp) {
    return `ip:${hashIdentity("ip", trustedIp)}`;
  }

  // Fail closed: unresolved callers share one constrained bucket instead of
  // silently collapsing the network layer into an attacker-chosen subject.
  return "untrusted";
}

export function createSubjectRateLimitIdentity(namespace: string, value: string) {
  return `subject:${hashIdentity(namespace, value)}`;
}
