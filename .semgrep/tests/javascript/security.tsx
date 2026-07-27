import { exec, execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import https from "node:https";
import path from "node:path";

declare const prisma: {
  $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
  $queryRawUnsafe: (query: string) => Promise<unknown>;
};

export function dynamicCode(untrustedCode: string) {
  // ruleid: javascript.security.no-dynamic-code
  eval(untrustedCode);

  // ruleid: javascript.security.no-dynamic-code
  return new Function("value", untrustedCode);
}

export function parseData(payload: string) {
  // ok: javascript.security.no-dynamic-code
  return JSON.parse(payload);
}

export function runShell(untrustedCommand: string) {
  // ruleid: javascript.security.no-child-process-shell
  exec(untrustedCommand);
}

export function runExecutable() {
  // ok: javascript.security.no-child-process-shell
  execFile("/usr/bin/git", ["status", "--short"]);
}

export async function runUnsafeQuery(query: string) {
  // ruleid: typescript.security.no-unsafe-prisma-raw
  return prisma.$queryRawUnsafe(query);
}

export async function runParameterizedQuery(userId: string) {
  // ok: typescript.security.no-unsafe-prisma-raw
  return prisma.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}`;
}

export function weakDigest(value: string) {
  // ruleid: javascript.security.no-weak-digest
  return createHash("sha1").update(value).digest("hex");
}

export function strongDigest(value: string) {
  // ok: javascript.security.no-weak-digest
  return createHash("sha256").update(value).digest("hex");
}

export function unsafeHtml(html: string) {
  // ruleid: typescript.react.security.no-dangerously-set-inner-html
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

export function escapedHtml(html: string) {
  // ok: typescript.react.security.no-dangerously-set-inner-html
  return <div>{html}</div>;
}

export function disabledTlsVerification(url: string) {
  // ruleid: javascript.node.security.no-disabled-tls-verification
  return https.request(url, { rejectUnauthorized: false });
}

export function verifiedTls(url: string) {
  // ok: javascript.node.security.no-disabled-tls-verification
  return https.request(url, { rejectUnauthorized: true });
}

export async function directRequestUrlFetch(request: Request) {
  const target = new URL(request.url).searchParams.get("url");
  // ruleid: typescript.next.security.no-request-url-fetch
  return fetch(target!);
}

export async function fixedOriginFetch() {
  // ok: typescript.next.security.no-request-url-fetch
  return fetch("https://api.giphy.com/v1/gifs/search");
}

export async function directRequestPathRead(request: Request) {
  const filename = new URL(request.url).searchParams.get("filename");
  // ruleid: typescript.node.security.no-request-path-filesystem
  return readFile(path.join("/srv/whispr", filename!));
}

export async function fixedPathRead() {
  // ok: typescript.node.security.no-request-path-filesystem
  return readFile("/srv/whispr/package.json");
}
