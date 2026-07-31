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

export function getTrustedClientIp(headers: ClientIpHeaderSource) {
  return normalizeIpAddress(headers.get("x-real-ip"));
}

export function createClientRateLimitIdentity(input: {
  fallbackNamespace: string;
  fallbackValue: string;
  headers: ClientIpHeaderSource;
}) {
  const trustedIp = getTrustedClientIp(input.headers);
  if (trustedIp) {
    return `ip:${hashIdentity("ip", trustedIp)}`;
  }

  return `fallback:${hashIdentity(input.fallbackNamespace, input.fallbackValue)}`;
}

export function createSubjectRateLimitIdentity(namespace: string, value: string) {
  return `subject:${hashIdentity(namespace, value)}`;
}
