import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MOBILE_ATTACHMENT_MAX_COUNT,
  getMobileAttachmentMaxBytes,
  getMobileAttachmentUploadReadiness,
  isSupportedMobileAttachmentContentType,
  validateMobileAttachmentUploadContract,
} from "../src/media/mobile-attachment-upload-contract";
import type { MobileMediaSelectedAssetSummary } from "../src/media/mobile-media-contract";

const selectedAsset: MobileMediaSelectedAssetSummary = {
  kind: "document",
  mimeType: "application/pdf",
  name: "release-notes.pdf",
  sizeBytes: 842_000,
  source: "documentPicker",
};

describe("mobile attachment upload contract", () => {
  it("keeps mobile attachment limits aligned with the web message contract", () => {
    assert.equal(MOBILE_ATTACHMENT_MAX_COUNT, 5);
    assert.equal(getMobileAttachmentMaxBytes("image/png"), 8 * 1024 * 1024);
    assert.equal(getMobileAttachmentMaxBytes("image/gif"), 8 * 1024 * 1024);
    assert.equal(getMobileAttachmentMaxBytes("application/pdf"), 16 * 1024 * 1024);
    assert.equal(getMobileAttachmentMaxBytes("video/mp4"), 32 * 1024 * 1024);
    assert.equal(isSupportedMobileAttachmentContentType("application/x-msdownload"), false);
  });

  it("fails closed when attachment bootstrap metadata is missing", () => {
    assert.deepEqual(
      getMobileAttachmentUploadReadiness({
        attachmentsFeature: null,
        selectedAsset,
      }),
      {
        canUploadSelectedAsset: false,
        reason: "missing-feature",
        status: "unknown",
      },
    );
  });

  it("blocks selected assets until the mobile upload provider contract is ready", () => {
    assert.deepEqual(
      getMobileAttachmentUploadReadiness({
        attachmentsFeature: {
          label: "Attachments",
          status: "requires-server-contract",
        },
        selectedAsset,
      }),
      {
        canUploadSelectedAsset: false,
        reason: "server-contract-required",
        status: "requires-server-contract",
      },
    );
  });

  it("keeps native permission gating separate from server contract gating", () => {
    assert.deepEqual(
      getMobileAttachmentUploadReadiness({
        attachmentsFeature: {
          label: "Attachments",
          status: "requires-native-permission",
        },
        selectedAsset,
      }),
      {
        canUploadSelectedAsset: false,
        reason: "native-permission-required",
        status: "requires-native-permission",
      },
    );
  });

  it("reports readiness only when the selected file and feature are both available", () => {
    assert.equal(
      getMobileAttachmentUploadReadiness({
        attachmentsFeature: {
          label: "Attachments",
          status: "available",
        },
        selectedAsset: null,
      }).reason,
      "no-selected-asset",
    );
    assert.deepEqual(
      getMobileAttachmentUploadReadiness({
        attachmentsFeature: {
          label: "Attachments",
          status: "available",
        },
        selectedAsset,
      }),
      {
        canUploadSelectedAsset: true,
        reason: "ready",
        status: "available",
      },
    );
  });

  it("blocks unsupported or oversized local drafts before upload is attempted", () => {
    assert.deepEqual(
      getMobileAttachmentUploadReadiness({
        attachmentsFeature: {
          label: "Attachments",
          status: "available",
        },
        selectedAsset: {
          kind: "document",
          mimeType: "application/x-msdownload",
          name: "setup.exe",
          sizeBytes: 42,
          source: "documentPicker",
        },
      }),
      {
        canUploadSelectedAsset: false,
        reason: "unsupported-content-type",
        status: "available",
      },
    );

    assert.deepEqual(
      getMobileAttachmentUploadReadiness({
        attachmentsFeature: {
          label: "Attachments",
          status: "available",
        },
        selectedAsset: {
          kind: "document",
          mimeType: "application/pdf",
          name: "large.pdf",
          sizeBytes: 17 * 1024 * 1024,
          source: "documentPicker",
        },
      }),
      {
        canUploadSelectedAsset: false,
        reason: "file-too-large",
        status: "available",
      },
    );
  });

  it("validates the attachment upload contract invariants", () => {
    assert.deepEqual(validateMobileAttachmentUploadContract(), []);
  });
});
