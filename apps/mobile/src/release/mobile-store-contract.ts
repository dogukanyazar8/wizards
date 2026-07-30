import storeContractData from "./mobile-store-contract-data.json";

export type MobileStorePermissionId =
  | "app-updates"
  | "biometrics"
  | "camera"
  | "microphone"
  | "notifications"
  | "photoLibrary"
  | "screenCapture";

export type MobileStorePermissionDisclosure = {
  androidPermission?: string;
  id: MobileStorePermissionId;
  iosInfoPlistKey?: string;
  storeBlocker?: true;
  userActionRequired: true;
  usageDescription: string;
};

export type MobileStoreReadinessResult = {
  blockers: string[];
  checklist: string[];
  permissionCount: number;
  privacyRequirementCount: number;
  warnings: string[];
};

type MobileStoreContractData = {
  appIdentity: {
    androidPackage: string;
    iosBundleIdentifier: string;
    name: string;
    scheme: string;
    slug: string;
  };
  forbiddenAndroidPermissions: string[];
  icon: {
    adaptiveBackgroundColor: string;
    adaptiveForegroundImage: string;
    icon: string;
    webFavicon: string;
  };
  permissionDisclosures: MobileStorePermissionDisclosure[];
  privacyRequirements: string[];
};

const STORE_CONTRACT = storeContractData as MobileStoreContractData;

export const WHISPR_MOBILE_APP_IDENTITY = STORE_CONTRACT.appIdentity;

export const WHISPR_MOBILE_ICON = STORE_CONTRACT.icon;

export const WHISPR_MOBILE_PERMISSION_DISCLOSURES = STORE_CONTRACT.permissionDisclosures;

export const WHISPR_MOBILE_PRIVACY_REQUIREMENTS = STORE_CONTRACT.privacyRequirements;

const FORBIDDEN_ANDROID_PERMISSIONS = new Set(STORE_CONTRACT.forbiddenAndroidPermissions);

export function getWhisprMobileAndroidPermissions(
  options: { includeStoreBlockers?: boolean } = {},
): string[] {
  return WHISPR_MOBILE_PERMISSION_DISCLOSURES.flatMap((disclosure) =>
    disclosure.androidPermission &&
    (options.includeStoreBlockers === true || disclosure.storeBlocker !== true)
      ? [disclosure.androidPermission]
      : [],
  );
}

export function getWhisprMobileIosInfoPlistUsageDescriptions(): Record<string, string> {
  return Object.fromEntries(
    WHISPR_MOBILE_PERMISSION_DISCLOSURES.flatMap((disclosure) =>
      disclosure.iosInfoPlistKey ? [[disclosure.iosInfoPlistKey, disclosure.usageDescription]] : [],
    ),
  );
}

export function validateMobileStoreReadiness(): MobileStoreReadinessResult {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const identity = WHISPR_MOBILE_APP_IDENTITY;

  if (identity.name !== "Whispr") {
    blockers.push("Mobile app name must remain Whispr.");
  }

  if (!/^[a-z][a-z0-9-]+$/.test(identity.slug)) {
    blockers.push("Mobile app slug must stay lowercase and URL-safe.");
  }

  if (!/^[a-z][a-z0-9+.-]*$/.test(identity.scheme)) {
    blockers.push("Mobile app scheme must be a safe lowercase URL scheme.");
  }

  for (const nativeId of [identity.androidPackage, identity.iosBundleIdentifier]) {
    if (!/^team\.whispr\.mobile$/.test(nativeId)) {
      blockers.push(`Unexpected mobile native identifier '${nativeId}'.`);
    }
  }

  const androidPermissions = getWhisprMobileAndroidPermissions();
  for (const permission of androidPermissions) {
    if (FORBIDDEN_ANDROID_PERMISSIONS.has(permission)) {
      blockers.push(`Forbidden broad Android permission requested: ${permission}.`);
    }
  }

  const permissionIds = new Set<MobileStorePermissionId>();
  for (const disclosure of WHISPR_MOBILE_PERMISSION_DISCLOSURES) {
    if (permissionIds.has(disclosure.id)) {
      blockers.push(`Duplicate mobile permission disclosure: ${disclosure.id}.`);
    }
    permissionIds.add(disclosure.id);

    if (!disclosure.userActionRequired) {
      blockers.push(`${disclosure.id} permission must require a user action.`);
    }

    if (!/only when|you choose|you can control/i.test(disclosure.usageDescription)) {
      warnings.push(`${disclosure.id} permission disclosure should make user control explicit.`);
    }
  }

  for (const requiredPermission of ["camera", "microphone", "notifications"] as const) {
    if (!permissionIds.has(requiredPermission)) {
      blockers.push(`Missing mobile permission disclosure: ${requiredPermission}.`);
    }
  }

  return {
    blockers,
    checklist: [
      "Verify App Store and Play Store listing text matches the permission disclosures.",
      "Confirm store privacy answers do not claim hidden data collection.",
      "Run Android internal and iOS TestFlight smoke builds before production submission.",
      "Attach startup, resume, idle memory, and auth handoff evidence to the release notes.",
    ],
    permissionCount: WHISPR_MOBILE_PERMISSION_DISCLOSURES.length,
    privacyRequirementCount: WHISPR_MOBILE_PRIVACY_REQUIREMENTS.length,
    warnings,
  };
}
