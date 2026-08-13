import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AttachmentScanRetryableError,
  processAttachmentScanJob,
  scanAttachmentUrl,
} from "./scanner";

function createAttachment(overrides: Record<string, unknown> = {}) {
  return {
    contentType: "application/pdf",
    filename: "invoice.pdf",
    id: "attachment-1",
    scanStatus: "PENDING",
    size: 4096,
    url: "https://cdn.whispr.test/invoice.pdf",
    userId: "user-1",
    ...overrides,
  };
}

describe("attachment scanner", () => {
  it("marks clean attachments as clean without quarantine side effects", async () => {
    const updates: unknown[] = [];
    const deletes: string[] = [];
    const notifications: unknown[] = [];

    await processAttachmentScanJob(
      { attachmentId: "attachment-1" },
      {
        client: {
          attachment: {
            async findUnique() {
              return createAttachment();
            },
            async update(args: unknown) {
              updates.push(args);
              return createAttachment({ scanStatus: "CLEAN" });
            },
          },
        },
        async deleteUploadedFile(url) {
          deletes.push(url);
        },
        async notifyUploader(notification) {
          notifications.push(notification);
        },
        async scanAttachmentUrl() {
          return { status: "CLEAN" };
        },
      },
    );

    assert.deepEqual(updates, [
      {
        data: { scanStatus: "CLEAN" },
        where: { id: "attachment-1" },
      },
    ]);
    assert.deepEqual(deletes, []);
    assert.deepEqual(notifications, []);
  });

  it("quarantines infected attachments, notifies the uploader, and logs a security signal", async () => {
    const updates: unknown[] = [];
    const deletes: string[] = [];
    const notifications: unknown[] = [];
    const logs: unknown[] = [];

    await processAttachmentScanJob(
      { attachmentId: "attachment-1" },
      {
        client: {
          attachment: {
            async findUnique() {
              return createAttachment();
            },
            async update(args: unknown) {
              updates.push(args);
              return createAttachment({ scanStatus: "INFECTED" });
            },
          },
        },
        async deleteUploadedFile(url) {
          deletes.push(url);
        },
        logger(message, payload) {
          logs.push([message, payload]);
        },
        async notifyUploader(notification) {
          notifications.push(notification);
        },
        async scanAttachmentUrl() {
          return { signature: "Eicar-Test-Signature", status: "INFECTED" };
        },
      },
    );

    assert.deepEqual(updates, [
      {
        data: { scanStatus: "INFECTED" },
        where: { id: "attachment-1" },
      },
    ]);
    assert.deepEqual(deletes, ["https://cdn.whispr.test/invoice.pdf"]);
    assert.deepEqual(notifications, [
      {
        attachmentId: "attachment-1",
        filename: "invoice.pdf",
        userId: "user-1",
      },
    ]);
    assert.deepEqual(logs, [
      [
        "[attachment-scan]",
        {
          attachmentId: "attachment-1",
          result: "INFECTED",
          signature: "Eicar-Test-Signature",
          type: "attachment_scan",
        },
      ],
    ]);
  });

  it("leaves an infected attachment retryable when quarantine deletion fails", async () => {
    const updates: unknown[] = [];
    const notifications: unknown[] = [];

    await assert.rejects(
      processAttachmentScanJob(
        { attachmentId: "attachment-1" },
        {
          client: {
            attachment: {
              async findUnique() {
                return createAttachment();
              },
              async update(args: unknown) {
                updates.push(args);
                return createAttachment({ scanStatus: "INFECTED" });
              },
            },
          },
          async deleteUploadedFile() {
            throw new Error("quarantine unavailable");
          },
          async notifyUploader(notification) {
            notifications.push(notification);
          },
          async scanAttachmentUrl() {
            return { signature: "Eicar-Test-Signature", status: "INFECTED" };
          },
        },
      ),
      /quarantine unavailable/,
    );

    assert.deepEqual(updates, []);
    assert.deepEqual(notifications, []);
  });

  it("marks scan errors fail-closed and throws for outbox retry", async () => {
    const updates: unknown[] = [];

    await assert.rejects(
      processAttachmentScanJob(
        { attachmentId: "attachment-1" },
        {
          client: {
            attachment: {
              async findUnique() {
                return createAttachment();
              },
              async update(args: unknown) {
                updates.push(args);
                return createAttachment({ scanStatus: "ERROR" });
              },
            },
          },
          async deleteUploadedFile() {
            throw new Error("should not quarantine scan errors");
          },
          async notifyUploader() {
            throw new Error("should not notify scan errors");
          },
          async scanAttachmentUrl() {
            return { error: "clamav unavailable", status: "ERROR" };
          },
        },
      ),
      AttachmentScanRetryableError,
    );

    assert.deepEqual(updates, [
      {
        data: { scanStatus: "ERROR" },
        where: { id: "attachment-1" },
      },
    ]);
  });
});

/**
 * The outbox drains one job at a time, so an attachment download that never
 * answers is not a slow scan — it is every DM notification, campaign send and
 * analytics rollup behind it stopping too. undici's default is 300s, the same
 * window after which a second replica reclaims the job.
 */
describe("attachment scan download deadline", () => {
  it("aborts a download that never answers instead of stalling the outbox", async () => {
    let observedSignal: AbortSignal | null = null;

    const result = await scanAttachmentUrl("https://cdn.whispr.test/hangs.bin", {
      fetchImpl: (_input, init) => {
        const signal = (init?.signal ?? null) as AbortSignal | null;
        observedSignal = signal;

        return new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            reject(new Error("aborted by deadline"));
          });
        });
      },
      timeoutMs: 20,
    });

    assert.ok(observedSignal, "the download must be given an abort signal");
    assert.equal(result.status, "ERROR");
  });

  it("passes an unaborted signal through while the download is answering", async () => {
    let abortedDuringFetch: boolean | null = null;

    const result = await scanAttachmentUrl("https://cdn.whispr.test/missing.bin", {
      fetchImpl: (_input, init) => {
        // Sampled here, not after the call: the deadline is released on the way
        // out, so a live reference would always read back as aborted.
        abortedDuringFetch = ((init?.signal ?? null) as AbortSignal | null)?.aborted ?? null;

        return Promise.resolve({ body: null, ok: false, status: 404 } as unknown as Response);
      },
      timeoutMs: 60_000,
    });

    assert.equal(abortedDuringFetch, false);
    assert.deepEqual(result, {
      error: "attachment fetch failed with status 404",
      status: "ERROR",
    });
  });
});
