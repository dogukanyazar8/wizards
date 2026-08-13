import { once } from "node:events";
import net from "node:net";
import { Readable } from "node:stream";
import { prisma } from "@wizards/db";
import { UTApi } from "uploadthing/server";
import { extractUploadThingFileKey } from "@/lib/account/privacy-service";
import { getSocketServer } from "@/lib/socket/runtime";
import { serializeNotification, type NotificationRecord } from "@/lib/socket/notification-payload";

export type AttachmentScanResult =
  | { status: "CLEAN" }
  | { signature?: string; status: "INFECTED" }
  | { error: string; status: "ERROR" };

type AttachmentScanJobPayload = {
  attachmentId: string;
};

type AttachmentRecord = {
  contentType: string;
  filename: string;
  id: string;
  scanStatus: string;
  size: number;
  url: string;
  userId: string;
};

type AttachmentScanClient = {
  attachment: {
    findUnique(args: unknown): Promise<AttachmentRecord | null>;
    update(args: unknown): Promise<unknown>;
  };
};

type ProcessAttachmentScanDeps = {
  client?: AttachmentScanClient;
  deleteUploadedFile?: (url: string) => Promise<void>;
  logger?: (message: string, payload: Record<string, unknown>) => void;
  notifyUploader?: (notification: {
    attachmentId: string;
    filename: string;
    userId: string;
  }) => Promise<void>;
  scanAttachmentUrl?: (url: string) => Promise<AttachmentScanResult>;
};

type ClamAvScanOptions = {
  host?: string;
  maxBytes?: number;
  port?: number;
  timeoutMs?: number;
};

export type ScanAttachmentFetchOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const DEFAULT_CLAMAV_HOST = "127.0.0.1";
const DEFAULT_CLAMAV_PORT = 3310;
const DEFAULT_SCAN_TIMEOUT_MS = 30_000;
const DEFAULT_SCAN_FETCH_TIMEOUT_MS = 120_000;
const DEFAULT_SCAN_MAX_BYTES = 32 * 1024 * 1024;
const CLAMAV_INSTREAM_COMMAND = Buffer.from("zINSTREAM\0");
const CLAMAV_ZERO_LENGTH_CHUNK = Buffer.alloc(4);

export class AttachmentScanRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttachmentScanRetryableError";
  }
}

function positiveIntFromEnv(name: string, fallback: number) {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getClamAvOptions(options: ClamAvScanOptions = {}): Required<ClamAvScanOptions> {
  return {
    host: options.host ?? process.env.CLAMAV_HOST?.trim() ?? DEFAULT_CLAMAV_HOST,
    maxBytes:
      options.maxBytes ?? positiveIntFromEnv("ATTACHMENT_SCAN_MAX_BYTES", DEFAULT_SCAN_MAX_BYTES),
    port: options.port ?? positiveIntFromEnv("CLAMAV_PORT", DEFAULT_CLAMAV_PORT),
    timeoutMs:
      options.timeoutMs ??
      positiveIntFromEnv("ATTACHMENT_SCAN_TIMEOUT_MS", DEFAULT_SCAN_TIMEOUT_MS),
  };
}

async function writeSocket(socket: net.Socket, chunk: Buffer) {
  if (!socket.write(chunk)) {
    await once(socket, "drain");
  }
}

function parseClamAvResponse(response: string): AttachmentScanResult {
  const normalized = response.replace(/\0/g, "").trim();

  if (/\bFOUND\b/i.test(normalized)) {
    const signature =
      normalized
        .replace(/^.*?:\s*/u, "")
        .replace(/\s+FOUND\b.*$/iu, "")
        .trim() || undefined;
    return signature ? { signature, status: "INFECTED" } : { status: "INFECTED" };
  }

  if (/\bOK\b/i.test(normalized)) {
    return { status: "CLEAN" };
  }

  return {
    error: normalized || "clamav returned an empty response",
    status: "ERROR",
  };
}

export async function scanReadableWithClamAv(
  readable: AsyncIterable<Buffer | Uint8Array | string>,
  options: ClamAvScanOptions = {},
): Promise<AttachmentScanResult> {
  const resolvedOptions = getClamAvOptions(options);
  const socket = net.createConnection({
    host: resolvedOptions.host,
    port: resolvedOptions.port,
  });
  let response = "";
  let totalBytes = 0;
  let socketErrorMessage: string | null = null;

  socket.setTimeout(resolvedOptions.timeoutMs);

  try {
    socket.on("error", (error) => {
      socketErrorMessage = error.message;
    });

    socket.on("timeout", () => {
      socket.destroy(new Error("clamav scan timed out"));
    });

    socket.on("data", (chunk) => {
      response += chunk.toString("utf8");
    });

    await once(socket, "connect");
    await writeSocket(socket, CLAMAV_INSTREAM_COMMAND);

    for await (const chunk of readable) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (buffer.length === 0) {
        continue;
      }

      totalBytes += buffer.length;
      if (totalBytes > resolvedOptions.maxBytes) {
        return {
          error: "attachment exceeded scanner byte limit",
          status: "ERROR",
        };
      }

      const size = Buffer.alloc(4);
      size.writeUInt32BE(buffer.length, 0);
      await writeSocket(socket, size);
      await writeSocket(socket, buffer);
    }

    await writeSocket(socket, CLAMAV_ZERO_LENGTH_CHUNK);
    socket.end();
    await once(socket, "close");

    if (socketErrorMessage !== null) {
      return {
        error: socketErrorMessage,
        status: "ERROR",
      };
    }

    return parseClamAvResponse(response);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      status: "ERROR",
    };
  } finally {
    socket.destroy();
  }
}

export async function scanAttachmentUrl(
  url: string,
  options: ScanAttachmentFetchOptions = {},
): Promise<AttachmentScanResult> {
  // The outbox drains serially with one job in flight, so a hung download here
  // stalls every DM notification, campaign and analytics job behind it. undici's
  // default is 300s — exactly `OUTBOX_STALE_PROCESSING_MS`, long enough for a
  // second replica to claim the same job — so this ceiling stays well under it.
  const timeoutMs =
    options.timeoutMs ??
    positiveIntFromEnv("ATTACHMENT_SCAN_FETCH_TIMEOUT_MS", DEFAULT_SCAN_FETCH_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await (options.fetchImpl ?? fetch)(url, {
      cache: "no-store",
      headers: { Accept: "application/octet-stream" },
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      return {
        error: `attachment fetch failed with status ${response.status}`,
        status: "ERROR",
      };
    }

    // Awaited rather than returned: `finally` aborts the controller, and doing
    // that while the body is still streaming would kill the scan it is meant
    // to clean up after.
    return await scanReadableWithClamAv(
      Readable.fromWeb(response.body as unknown as Parameters<typeof Readable.fromWeb>[0]),
    );
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      status: "ERROR",
    };
  } finally {
    clearTimeout(timer);
    // ClamAV can answer on a partially read body (the byte ceiling), which
    // would otherwise leave the connection open until the peer gives up.
    controller.abort();
  }
}

async function deleteUploadedFile(url: string) {
  const fileKey = extractUploadThingFileKey(url);

  if (!fileKey) {
    return;
  }

  const result = await new UTApi().deleteFiles(fileKey);
  if (!result.success) {
    throw new Error("UploadThing quarantine delete failed");
  }
}

async function notifyUploader(args: { attachmentId: string; filename: string; userId: string }) {
  const notification = await prisma.notification.upsert({
    where: { dedupeKey: `attachment-scan:${args.attachmentId}:infected` },
    create: {
      actionUrl: null,
      body: `${args.filename} was removed because malware was detected.`,
      dedupeKey: `attachment-scan:${args.attachmentId}:infected`,
      metadata: {
        attachmentId: args.attachmentId,
        reason: "malware_detected",
      },
      title: "Attachment removed",
      type: "SYSTEM",
      userId: args.userId,
    },
    update: {},
  });

  getSocketServer()
    ?.to(`user:${args.userId}`)
    .emit("notification:new", serializeNotification(notification as NotificationRecord));
}

export async function processAttachmentScanJob(
  payload: AttachmentScanJobPayload,
  deps: ProcessAttachmentScanDeps = {},
) {
  const client = deps.client ?? prisma;
  const attachment = await client.attachment.findUnique({
    where: { id: payload.attachmentId },
    select: {
      contentType: true,
      filename: true,
      id: true,
      scanStatus: true,
      size: true,
      url: true,
      userId: true,
    },
  });

  if (!attachment || attachment.scanStatus === "CLEAN" || attachment.scanStatus === "INFECTED") {
    return;
  }

  const result = await (deps.scanAttachmentUrl ?? scanAttachmentUrl)(attachment.url);

  if (result.status === "CLEAN") {
    await client.attachment.update({
      where: { id: attachment.id },
      data: { scanStatus: "CLEAN" },
    });
    return;
  }

  if (result.status === "INFECTED") {
    // INFECTED is terminal at the entry gate. Persist it only after quarantine
    // succeeds, otherwise a transient delete failure makes the public file
    // permanently unclaimable by retries.
    await (deps.deleteUploadedFile ?? deleteUploadedFile)(attachment.url);
    await (deps.notifyUploader ?? notifyUploader)({
      attachmentId: attachment.id,
      filename: attachment.filename,
      userId: attachment.userId,
    });
    await client.attachment.update({
      where: { id: attachment.id },
      data: { scanStatus: "INFECTED" },
    });
    (deps.logger ?? console.warn)("[attachment-scan]", {
      attachmentId: attachment.id,
      result: "INFECTED",
      signature: result.signature,
      type: "attachment_scan",
    });
    return;
  }

  await client.attachment.update({
    where: { id: attachment.id },
    data: { scanStatus: "ERROR" },
  });

  throw new AttachmentScanRetryableError(result.error);
}
