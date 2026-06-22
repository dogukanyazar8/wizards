import { ApiError } from "@/lib/api";

export type InviteJoinErrorReason = "expired" | "fallback" | "invalid" | "limit" | "not-found";

export function normalizeInviteJoinErrorReason(value: string | string[] | undefined) {
  const normalized = Array.isArray(value) ? value[0] : value;

  switch (normalized) {
    case "expired":
    case "fallback":
    case "invalid":
    case "limit":
    case "not-found":
      return normalized satisfies InviteJoinErrorReason;
    default:
      return null;
  }
}

export function getInviteJoinErrorReason(error: unknown): InviteJoinErrorReason {
  if (error instanceof ApiError) {
    switch (error.message) {
      case "Invite not found":
        return "not-found";
      case "Invite has expired":
        return "expired";
      case "Invite has reached its usage limit":
        return "limit";
      default:
        return "fallback";
    }
  }

  return "fallback";
}

export function getInviteErrorMessageKey(reason: InviteJoinErrorReason) {
  switch (reason) {
    case "expired":
      return "invite.error.expired";
    case "invalid":
    case "not-found":
      return "invite.error.notFound";
    case "limit":
      return "invite.error.limit";
    case "fallback":
      return "invite.error.fallback";
  }
}
