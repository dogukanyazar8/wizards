import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AttachmentScanRetryableError,
  processAttachmentScanJob,
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
