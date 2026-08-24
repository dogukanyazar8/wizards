import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { OUTBOX_JOB_TYPES } from "@/lib/outbox/service";
import { createPendingMessageAttachmentUpload } from "./upload-persistence";

describe("message attachment upload persistence", () => {
  it("creates pending attachment records and queues scan jobs in the same transaction", async () => {
    const operations: string[] = [];
    const tx = {
      attachment: {
        async create(args: { data: Record<string, unknown>; select: Record<string, boolean> }) {
          operations.push("attachment.create");
          assert.equal(args.data.scanStatus, "PENDING");
          assert.equal(args.data.userId, "user-1");
          assert.equal(args.data.filename, "invoice.pdf");

          return {
            contentType: "application/pdf",
            duration: null,
            filename: "invoice.pdf",
            height: null,
            id: "attachment-1",
            scanStatus: "PENDING",
            size: 4096,
            thumbnailUrl: null,
            url: "https://cdn.whispr.test/invoice.pdf",
            width: null,
          };
        },
      },
      outboxJob: {
        async upsert(args: {
          create: { idempotencyKey: string; payload: unknown; type: string };
          update: Record<string, never>;
          where: { idempotencyKey: string };
        }) {
          operations.push("outbox.upsert");
          assert.equal(args.create.type, OUTBOX_JOB_TYPES.attachmentScan);
          assert.equal(args.create.idempotencyKey, "attachment-scan:attachment-1");
          assert.deepEqual(args.create.payload, { attachmentId: "attachment-1" });
          assert.deepEqual(args.update, {});
          assert.deepEqual(args.where, { idempotencyKey: "attachment-scan:attachment-1" });
        },
      },
    };
    const client = {
      async $transaction<T>(callback: (transactionClient: typeof tx) => Promise<T>) {
        operations.push("transaction.start");
        const result = await callback(tx);
        operations.push("transaction.end");
        return result;
      },
    };

    const attachment = await createPendingMessageAttachmentUpload(
      client as never,
      {
        name: "invoice.pdf",
        size: 4096,
        type: "application/pdf",
        ufsUrl: "https://cdn.whispr.test/invoice.pdf",
      },
      { userId: "user-1" },
    );

    assert.deepEqual(operations, [
      "transaction.start",
      "attachment.create",
      "outbox.upsert",
      "transaction.end",
    ]);
    assert.equal(attachment.scanStatus, "PENDING");
  });
});
