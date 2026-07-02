import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getMobileAttachmentUploadReadiness,
  validateMobileAttachmentUploadContract,
} from "../src/media/mobile-attachment-upload-contract";
import type { MobileMediaSelectedAssetSummary } from "../src/media/mobile-media-contract";

const selectedAsset: MobileMediaSelectedAssetSummary = {
  kind: "document",
  mimeType: "application/pdf",
  name: "release-notes.pdf",
  sizeBytes: 842_000,
};

describe("mobile attachment upload contract", () => {
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

  it("validates the attachment upload contract invariants", () => {
    assert.deepEqual(validateMobileAttachmentUploadContract(), []);
  });
});
