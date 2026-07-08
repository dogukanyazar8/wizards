import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clearMobileMediaSelectedAsset,
  createInitialMobileMediaRuntimeState,
  createMobileMediaRuntimeStateFromDocumentPickerResult,
  createMobileMediaRuntimeStateFromPhotoLibraryResult,
  createMobileMediaRuntimeStateFromPermission,
  createSafeMobileMediaAssetSummary,
  getMobileAttachmentDraftSendGuard,
  mapExpoImagePickerPermissionStatus,
  redactMobileMediaError,
  summarizeMobileMediaRuntimeState,
  validateMobileMediaContract,
} from "../src/media/mobile-media-contract";

describe("mobile media contract", () => {
  it("starts without claiming camera or photo library readiness", () => {
    const state = createInitialMobileMediaRuntimeState();
    const summary = summarizeMobileMediaRuntimeState(state);

    assert.equal(state.cameraStatus, "unknown");
    assert.equal(state.photoLibraryStatus, "unknown");
    assert.equal(state.hasCameraPermission, false);
    assert.equal(state.hasDocumentPickerAccess, false);
    assert.equal(state.hasPhotoLibraryPermission, false);
    assert.equal(state.selectedAsset, null);
    assert.equal(state.status, "not-requested");
    assert.equal(summary.canAskCameraAfterUserAction, true);
    assert.equal(summary.canOpenDocumentPickerAfterUserAction, true);
    assert.equal(summary.canAskPhotoLibraryAfterUserAction, true);
  });

  it("maps native media permission responses without widening scope", () => {
    assert.equal(mapExpoImagePickerPermissionStatus("granted", true), "granted");
    assert.equal(mapExpoImagePickerPermissionStatus("limited", true), "granted");
    assert.equal(mapExpoImagePickerPermissionStatus("denied", true), "denied");
    assert.equal(mapExpoImagePickerPermissionStatus("denied", false), "blocked");
    assert.equal(mapExpoImagePickerPermissionStatus("undetermined", true), "not-requested");
    assert.equal(mapExpoImagePickerPermissionStatus("unexpected", true), "unknown");
  });

  it("tracks camera and photo permissions independently", () => {
    const initial = createInitialMobileMediaRuntimeState();
    const photoReady = createMobileMediaRuntimeStateFromPermission(
      initial,
      "photoLibrary",
      "granted",
      1_000,
    );
    const cameraDenied = createMobileMediaRuntimeStateFromPermission(
      photoReady,
      "camera",
      "denied",
      1_001,
    );
    const summary = summarizeMobileMediaRuntimeState(cameraDenied);

    assert.equal(cameraDenied.hasPhotoLibraryPermission, true);
    assert.equal(cameraDenied.hasCameraPermission, false);
    assert.equal(cameraDenied.photoLibraryStatus, "granted");
    assert.equal(cameraDenied.cameraStatus, "denied");
    assert.equal(cameraDenied.status, "denied");
    assert.equal(summary.localPhotoLibraryReady, true);
    assert.equal(summary.localCameraReady, false);
  });

  it("tracks document picker access without storing raw file paths", () => {
    const initial = createInitialMobileMediaRuntimeState();
    const asset = createSafeMobileMediaAssetSummary({
      mimeType: "application/pdf",
      name: "notes/private/quarterly-plan.pdf",
      size: 1_500_100.9,
    });
    const documentReady = createMobileMediaRuntimeStateFromDocumentPickerResult(
      initial,
      asset,
      1_002,
    );
    const summary = summarizeMobileMediaRuntimeState(documentReady);

    assert.equal(documentReady.hasDocumentPickerAccess, true);
    assert.equal(documentReady.lastRequestedTarget, "documentPicker");
    assert.equal(documentReady.status, "ready-local");
    assert.equal(documentReady.selectedAsset?.name, "quarterly-plan.pdf");
    assert.equal(documentReady.selectedAsset?.name.includes("private"), false);
    assert.equal(documentReady.selectedAsset?.mimeType, "application/pdf");
    assert.equal(documentReady.selectedAsset?.sizeBytes, 1_500_100);
    assert.equal(summary.localDocumentPickerReady, true);
  });

  it("tracks photo library image drafts without storing raw file paths", () => {
    const initial = createInitialMobileMediaRuntimeState();
    const asset = createSafeMobileMediaAssetSummary({
      mimeType: "image/png",
      name: "content://media/external/images/avatar.png",
      size: 892_100,
      source: "photoLibrary",
    });
    const photoReady = createMobileMediaRuntimeStateFromPhotoLibraryResult(initial, asset, 1_003);
    const summary = summarizeMobileMediaRuntimeState(photoReady);

    assert.equal(photoReady.hasPhotoLibraryPermission, true);
    assert.equal(photoReady.photoLibraryStatus, "granted");
    assert.equal(photoReady.lastRequestedTarget, "photoLibrary");
    assert.equal(photoReady.status, "ready-local");
    assert.equal(photoReady.selectedAsset?.kind, "image");
    assert.equal(photoReady.selectedAsset?.name.includes("content:"), false);
    assert.equal(photoReady.selectedAsset?.source, "photoLibrary");
    assert.equal(summary.localPhotoLibraryReady, true);
  });

  it("clears local attachment drafts without revoking picker access", () => {
    const initial = createInitialMobileMediaRuntimeState();
    const asset = createSafeMobileMediaAssetSummary({
      mimeType: "application/pdf",
      name: "roadmap.pdf",
      size: 2_048,
    });
    const documentReady = createMobileMediaRuntimeStateFromDocumentPickerResult(initial, asset);
    const cleared = clearMobileMediaSelectedAsset(documentReady);
    const summary = summarizeMobileMediaRuntimeState(cleared);

    assert.equal(cleared.hasDocumentPickerAccess, true);
    assert.equal(cleared.selectedAsset, null);
    assert.equal(cleared.status, "ready-local");
    assert.equal(summary.localDocumentPickerReady, true);
  });

  it("does not allow local attachment drafts to be sent as uploaded attachments", () => {
    const asset = createSafeMobileMediaAssetSummary({
      mimeType: "application/pdf",
      name: "draft.pdf",
      size: 512,
    });

    assert.deepEqual(
      getMobileAttachmentDraftSendGuard({
        content: "Please review this",
        selectedAsset: asset,
      }),
      {
        canSend: false,
        reason: "upload-pending",
      },
    );
    assert.deepEqual(
      getMobileAttachmentDraftSendGuard({
        content: "   ",
        selectedAsset: null,
      }),
      {
        canSend: false,
        reason: "empty-message",
      },
    );
    assert.deepEqual(
      getMobileAttachmentDraftSendGuard({
        content: "Ready",
        selectedAsset: null,
      }),
      {
        canSend: true,
        reason: null,
      },
    );
  });

  it("bounds selected asset summaries before UI diagnostics can display them", () => {
    const asset = createSafeMobileMediaAssetSummary({
      mimeType: "image/png",
      name: "../".repeat(80) + "avatar.png",
      size: Number.NaN,
    });

    assert.equal(asset.kind, "image");
    assert.equal(asset.name.includes(".."), false);
    assert.equal(asset.name.length <= 96, true);
    assert.equal(asset.sizeBytes, null);
  });

  it("redacts sensitive media setup failures", () => {
    assert.equal(
      redactMobileMediaError("bearer abc.def.ghi failed during media setup"),
      "Media setup failed without exposing sensitive details.",
    );
    assert.match(redactMobileMediaError("Native module is unavailable"), /Native module/);
  });

  it("validates native media capability readiness", () => {
    assert.deepEqual(validateMobileMediaContract(), []);
  });
});
