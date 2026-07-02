import type { MobileBootstrapFeature } from "@wizards/types";
import type { MobileMediaSelectedAssetSummary } from "./mobile-media-contract";

export type MobileAttachmentUploadReadinessReason =
  | "disabled"
  | "missing-feature"
  | "native-permission-required"
  | "no-selected-asset"
  | "ready"
  | "server-contract-required";

export type MobileAttachmentUploadReadinessStatus =
  | "available"
  | "disabled"
  | "requires-native-permission"
  | "requires-server-contract"
  | "unknown";

export type MobileAttachmentUploadReadiness = {
  canUploadSelectedAsset: boolean;
  reason: MobileAttachmentUploadReadinessReason;
  status: MobileAttachmentUploadReadinessStatus;
};

export function getMobileAttachmentUploadReadiness({
  attachmentsFeature,
  selectedAsset,
}: {
  attachmentsFeature?: MobileBootstrapFeature | null;
  selectedAsset: MobileMediaSelectedAssetSummary | null;
}): MobileAttachmentUploadReadiness {
  if (!selectedAsset) {
    return {
      canUploadSelectedAsset: false,
      reason: "no-selected-asset",
      status: attachmentsFeature?.status ?? "unknown",
    };
  }

  if (!attachmentsFeature) {
    return {
      canUploadSelectedAsset: false,
      reason: "missing-feature",
      status: "unknown",
    };
  }

  switch (attachmentsFeature.status) {
    case "available":
      return {
        canUploadSelectedAsset: true,
        reason: "ready",
        status: "available",
      };
    case "disabled":
      return {
        canUploadSelectedAsset: false,
        reason: "disabled",
        status: "disabled",
      };
    case "requires-native-permission":
      return {
        canUploadSelectedAsset: false,
        reason: "native-permission-required",
        status: "requires-native-permission",
      };
    case "requires-server-contract":
      return {
        canUploadSelectedAsset: false,
        reason: "server-contract-required",
        status: "requires-server-contract",
      };
    default:
      return {
        canUploadSelectedAsset: false,
        reason: "missing-feature",
        status: "unknown",
      };
  }
}

export function validateMobileAttachmentUploadContract(): string[] {
  const issues: string[] = [];
  const selectedAsset: MobileMediaSelectedAssetSummary = {
    kind: "document",
    mimeType: "application/pdf",
    name: "contract.pdf",
    sizeBytes: 1024,
  };

  const pending = getMobileAttachmentUploadReadiness({
    attachmentsFeature: {
      label: "Attachments",
      status: "requires-server-contract",
    },
    selectedAsset,
  });
  if (pending.canUploadSelectedAsset || pending.reason !== "server-contract-required") {
    issues.push("Mobile attachment upload must stay blocked until the server contract is ready.");
  }

  const missing = getMobileAttachmentUploadReadiness({
    attachmentsFeature: null,
    selectedAsset,
  });
  if (missing.canUploadSelectedAsset || missing.reason !== "missing-feature") {
    issues.push("Missing attachment feature metadata must fail closed.");
  }

  const available = getMobileAttachmentUploadReadiness({
    attachmentsFeature: {
      label: "Attachments",
      status: "available",
    },
    selectedAsset,
  });
  if (!available.canUploadSelectedAsset || available.reason !== "ready") {
    issues.push("Available attachment feature metadata should allow upload-capable callers.");
  }

  return issues;
}
