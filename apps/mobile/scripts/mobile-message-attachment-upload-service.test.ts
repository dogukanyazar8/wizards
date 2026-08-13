import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { executeMobileMessageAttachmentUpload } from "../src/media/mobile-message-attachment-upload-service";
import {
  MobileMessageAttachmentUploadError,
  parseMobileMessageAttachmentUploadCompletion,
} from "../src/media/mobile-message-attachment-contract";
import type { MobilePickedMessageAttachment } from "../src/media/mobile-message-attachment-contract";

const picked: MobilePickedMessageAttachment = {
  file: {
    lastModified: 1,
    name: "notes.pdf",
    size: 1024,
    type: "application/pdf",
    uri: "file:///cache/notes.pdf",
  } as unknown as File,
  kind: "file",
  localUri: "file:///cache/notes.pdf",
};

describe("mobile message attachment upload service", () => {
  it("aborts a stalled upload and reports an error that lets the composer retry", async () => {
    let receivedSignal: AbortSignal | undefined;
    const outcome = await executeMobileMessageAttachmentUpload({
      dependencies: {
        createWatchdog: (options) => {
          queueMicrotask(() => options.onExpire("preparing"));
          return { progress: () => undefined, stage: "preparing", stop: () => undefined };
        },
        getAccessToken: async () => "mobile-access-token",
        pickAttachment: async () => picked,
        uploadAttachment: async ({ signal }) => {
          receivedSignal = signal;
          return await new Promise((_, reject) => {
            signal?.addEventListener(
              "abort",
              () => reject(Object.assign(new Error("watchdog"), { name: "AbortError" })),
              { once: true },
            );
          });
        },
      },
    });

    assert.equal(receivedSignal?.aborted, true);
    assert.deepEqual(outcome, { code: "upload-failed", status: "error" });
  });

  it("accepts the pending attachment response returned by UploadThing", () => {
    const draft = parseMobileMessageAttachmentUploadCompletion(
      [
        {
          serverData: {
            contentType: "application/pdf",
            duration: null,
            filename: "notes.pdf",
            height: null,
            id: "c1b852d2-816e-4bc2-9137-0d38c46f0a18",
            scanStatus: "PENDING",
            size: 1024,
            thumbnailUrl: null,
            url: "https://ufs.example.test/notes.pdf",
            width: null,
          },
        },
      ],
      picked,
    );

    assert.equal(draft.attachment.id, "c1b852d2-816e-4bc2-9137-0d38c46f0a18");
  });

  it("uploads a user-picked file with the current mobile access token", async () => {
    let receivedToken: string | null = null;
    const outcome = await executeMobileMessageAttachmentUpload({
      dependencies: {
        getAccessToken: async () => "mobile-access-token",
        pickAttachment: async () => picked,
        uploadAttachment: async ({ accessToken, picked: selected }) => {
          receivedToken = accessToken;
          assert.equal(selected, picked);
          return {
            attachment: {
              contentType: "application/pdf",
              filename: "notes.pdf",
              id: "c1b852d2-816e-4bc2-9137-0d38c46f0a18",
              scanStatus: "PENDING",
              size: 1024,
              url: "https://ufs.example.test/notes.pdf",
            },
            input: { id: "c1b852d2-816e-4bc2-9137-0d38c46f0a18" },
            kind: "file",
            localUri: picked.localUri,
          };
        },
      },
    });

    assert.equal(receivedToken, "mobile-access-token");
    assert.equal(outcome.status, "ready");
    if (outcome.status === "ready") {
      assert.equal(outcome.draft.input.id, "c1b852d2-816e-4bc2-9137-0d38c46f0a18");
    }
  });

  it("deletes an owned voice-note file after the upload becomes ready", async () => {
    const removed: string[] = [];
    const outcome = await executeMobileMessageAttachmentUpload({
      dependencies: {
        getAccessToken: async () => "mobile-access-token",
        pickAttachment: async () => picked,
        removeLocalFile: async (uri) => {
          removed.push(uri);
        },
        uploadAttachment: async () => ({
          attachment: {
            contentType: "application/pdf",
            filename: "notes.pdf",
            id: "c1b852d2-816e-4bc2-9137-0d38c46f0a18",
            scanStatus: "PENDING",
            size: 1024,
            url: "https://ufs.example.test/notes.pdf",
          },
          input: { id: "c1b852d2-816e-4bc2-9137-0d38c46f0a18" },
          kind: "file",
          localUri: picked.localUri,
        }),
      },
      removePickedFileOnReady: true,
    });

    assert.equal(outcome.status, "ready");
    assert.deepEqual(removed, [picked.localUri]);
  });

  it("does not upload when there is no active mobile session", async () => {
    let uploadCalled = false;
    const outcome = await executeMobileMessageAttachmentUpload({
      dependencies: {
        getAccessToken: async () => null,
        pickAttachment: async () => picked,
        uploadAttachment: async () => {
          uploadCalled = true;
          throw new Error("must not upload");
        },
      },
    });

    assert.equal(outcome.status, "error");
    assert.equal(uploadCalled, false);
    if (outcome.status === "error") {
      assert.equal(outcome.code, "missing-access-token");
    }
  });

  it("reports the contract failure code so the composer can explain the rejection", async () => {
    const outcome = await executeMobileMessageAttachmentUpload({
      dependencies: {
        getAccessToken: async () => "mobile-access-token",
        pickAttachment: async () => picked,
        uploadAttachment: async () => {
          throw new MobileMessageAttachmentUploadError("selected-file-too-large");
        },
      },
    });

    assert.equal(outcome.status, "error");
    if (outcome.status === "error") {
      assert.equal(outcome.code, "selected-file-too-large");
    }
  });

  it("falls back to a generic failure code for transport errors", async () => {
    const outcome = await executeMobileMessageAttachmentUpload({
      dependencies: {
        getAccessToken: async () => "mobile-access-token",
        pickAttachment: async () => picked,
        uploadAttachment: async () => {
          throw new Error("network down");
        },
      },
    });

    assert.equal(outcome.status, "error");
    if (outcome.status === "error") {
      assert.equal(outcome.code, "upload-failed");
    }
  });
});
