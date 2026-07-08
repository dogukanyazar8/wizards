import { MOBILE_PUSH_NOTIFICATIONS_ENDPOINT } from "./mobile-notification-client";
import { redactMobileNotificationError } from "./mobile-notification-contract";

export type MobileNotificationLifecycleStepId =
  | "local-session-clear"
  | "logout-revoke"
  | "native-token-read"
  | "server-registration"
  | "user-action-permission";

export type MobileNotificationLifecycleStep = {
  id: MobileNotificationLifecycleStepId;
  requiresUserAction: boolean;
  securityBoundary: string;
  serverEndpoint: string | null;
};

export type MobileNotificationDeliveryType = "direct-message" | "mention" | "voice-invite";

export type MobileNotificationDeliveryContractItem = {
  allowRawPushTokenInPayload: false;
  id: MobileNotificationDeliveryType;
  maxBodyLength: number;
  provider: "expo";
  requiredRoutePrefix: string;
  requiresRegisteredDevice: true;
};

export type MobileNotificationDeliveryPayload = {
  actionUrl?: string | null;
  body?: string | null;
  pushToken?: string | null;
  title?: string | null;
  type?: string | null;
};

export type RedactedMobileNotificationDeliveryPayload = {
  actionUrl: string | null;
  body: string | null;
  title: string | null;
  type: string | null;
};

const MOBILE_NOTIFICATION_SENSITIVE_DELIVERY_PATTERN =
  /(access[_-]?token|refresh[_-]?token|oauth[_-]?code|password|secret|bearer\s+[a-z0-9._-]|(?:Expo|Exponent)PushToken\[[^\]]+\])/i;

export const MOBILE_NOTIFICATION_LIFECYCLE_STEPS: MobileNotificationLifecycleStep[] = [
  {
    id: "user-action-permission",
    requiresUserAction: true,
    securityBoundary: "Native notification permission can only be requested from an explicit UI action.",
    serverEndpoint: null,
  },
  {
    id: "native-token-read",
    requiresUserAction: false,
    securityBoundary: "Expo push token is read only after native permission is granted.",
    serverEndpoint: null,
  },
  {
    id: "server-registration",
    requiresUserAction: false,
    securityBoundary: "Raw push tokens are sent only to the bounded mobile registration endpoint.",
    serverEndpoint: MOBILE_PUSH_NOTIFICATIONS_ENDPOINT,
  },
  {
    id: "logout-revoke",
    requiresUserAction: false,
    securityBoundary: "Logout revokes the server-side push token before local session storage is cleared.",
    serverEndpoint: MOBILE_PUSH_NOTIFICATIONS_ENDPOINT,
  },
  {
    id: "local-session-clear",
    requiresUserAction: false,
    securityBoundary: "Local session storage is cleared even if best-effort push revoke fails.",
    serverEndpoint: null,
  },
];

export const MOBILE_NOTIFICATION_DELIVERY_CONTRACT: MobileNotificationDeliveryContractItem[] = [
  {
    allowRawPushTokenInPayload: false,
    id: "direct-message",
    maxBodyLength: 120,
    provider: "expo",
    requiredRoutePrefix: "/channels/@me",
    requiresRegisteredDevice: true,
  },
  {
    allowRawPushTokenInPayload: false,
    id: "mention",
    maxBodyLength: 140,
    provider: "expo",
    requiredRoutePrefix: "/channels/",
    requiresRegisteredDevice: true,
  },
  {
    allowRawPushTokenInPayload: false,
    id: "voice-invite",
    maxBodyLength: 120,
    provider: "expo",
    requiredRoutePrefix: "/channels/",
    requiresRegisteredDevice: true,
  },
];

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function redactText(value: string | null | undefined, maxLength: number): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const trimmed = value.trim();
  if (MOBILE_NOTIFICATION_SENSITIVE_DELIVERY_PATTERN.test(trimmed)) {
    return "redacted";
  }

  return truncate(trimmed, maxLength);
}

function sanitizeActionUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  try {
    const url = new URL(value, "https://whispr.invalid");
    const path = url.pathname;

    if (!path.startsWith("/channels/") || path.includes("..") || path.includes("\\")) {
      return null;
    }

    return truncate(path, 160);
  } catch {
    return null;
  }
}

export function getMobileNotificationLifecycleStepIds(): MobileNotificationLifecycleStepId[] {
  return MOBILE_NOTIFICATION_LIFECYCLE_STEPS.map((step) => step.id);
}

export function redactMobileNotificationDeliveryPayload(
  payload: MobileNotificationDeliveryPayload,
): RedactedMobileNotificationDeliveryPayload {
  return {
    actionUrl: sanitizeActionUrl(payload.actionUrl),
    body: redactText(payload.body, 160),
    title: redactText(payload.title, 80),
    type: redactText(payload.type, 40),
  };
}

export function validateMobileNotificationLifecycleContract(): string[] {
  const issues: string[] = [];
  const stepIds = getMobileNotificationLifecycleStepIds();
  const uniqueStepIds = new Set(stepIds);

  if (stepIds.length !== uniqueStepIds.size) {
    issues.push("Mobile notification lifecycle steps must not contain duplicate ids.");
  }

  const expectedStepIds: MobileNotificationLifecycleStepId[] = [
    "user-action-permission",
    "native-token-read",
    "server-registration",
    "logout-revoke",
    "local-session-clear",
  ];
  if (stepIds.join("|") !== expectedStepIds.join("|")) {
    issues.push("Mobile notification lifecycle steps must keep permission, registration, revoke, and local cleanup order.");
  }

  const permissionStep = MOBILE_NOTIFICATION_LIFECYCLE_STEPS.find(
    (step) => step.id === "user-action-permission",
  );
  if (!permissionStep?.requiresUserAction || permissionStep.serverEndpoint !== null) {
    issues.push("Mobile notification permission must be user-action scoped and local-only.");
  }

  const registrationStep = MOBILE_NOTIFICATION_LIFECYCLE_STEPS.find(
    (step) => step.id === "server-registration",
  );
  const revokeStep = MOBILE_NOTIFICATION_LIFECYCLE_STEPS.find((step) => step.id === "logout-revoke");
  if (
    registrationStep?.serverEndpoint !== MOBILE_PUSH_NOTIFICATIONS_ENDPOINT ||
    revokeStep?.serverEndpoint !== MOBILE_PUSH_NOTIFICATIONS_ENDPOINT
  ) {
    issues.push("Mobile push registration and revoke must use the bounded notification endpoint.");
  }

  const deliveryIds = MOBILE_NOTIFICATION_DELIVERY_CONTRACT.map((item) => item.id);
  if (deliveryIds.length !== new Set(deliveryIds).size) {
    issues.push("Mobile notification delivery contract must not contain duplicate categories.");
  }

  for (const item of MOBILE_NOTIFICATION_DELIVERY_CONTRACT) {
    if (item.provider !== "expo") {
      issues.push(`Mobile notification delivery ${item.id} must use the Expo provider contract.`);
    }

    if (item.allowRawPushTokenInPayload !== false) {
      issues.push(`Mobile notification delivery ${item.id} must not allow raw push tokens in payloads.`);
    }

    if (!item.requiresRegisteredDevice) {
      issues.push(`Mobile notification delivery ${item.id} must require a registered mobile device.`);
    }

    if (item.maxBodyLength > 160) {
      issues.push(`Mobile notification delivery ${item.id} body length must stay bounded.`);
    }

    if (!item.requiredRoutePrefix.startsWith("/channels/")) {
      issues.push(`Mobile notification delivery ${item.id} must route only into safe mobile channel surfaces.`);
    }
  }

  const redactedPayload = redactMobileNotificationDeliveryPayload({
    actionUrl: "/channels/@me?access_token=secret",
    body: "Bearer abc.def.ghi",
    pushToken: "ExpoPushToken[aaaaaaaaaaaaaaaaaaaa]",
    title: "push token ExpoPushToken[bbbbbbbbbbbbbbbbbbbb]",
    type: "mention",
  });
  if (/ExpoPushToken|access_token|abc\.def\.ghi|bearer/i.test(JSON.stringify(redactedPayload))) {
    issues.push("Mobile notification delivery redaction must remove tokens and credential-like query values.");
  }

  const redactedError = redactMobileNotificationError(
    "secret=abc should not be exposed during notification lifecycle validation",
  );
  if (/secret=abc/i.test(redactedError)) {
    issues.push("Mobile notification lifecycle errors must reuse notification redaction.");
  }

  return issues;
}
