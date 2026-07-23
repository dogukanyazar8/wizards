import type { MobileFriendPresenceStatus } from "@wizards/types";

/**
 * Handoff 2c lists four rows, but the wire only has four presence values and
 * "Invisible" is not one of them: it is written as OFFLINE so that nothing
 * downstream — socket fanout, member lists, DM headers — can tell an invisible
 * user from a genuinely offline one. Keeping the mapping in a React-free module
 * lets the leak be proved by a plain node test.
 */
export const MOBILE_STATUS_PICKER_OPTIONS = ["ONLINE", "IDLE", "DND", "INVISIBLE"] as const;

export type MobileStatusPickerOption = (typeof MOBILE_STATUS_PICKER_OPTIONS)[number];

export function toMobilePresenceStatus(
  option: MobileStatusPickerOption,
): MobileFriendPresenceStatus {
  return option === "INVISIBLE" ? "OFFLINE" : option;
}

/**
 * OFFLINE round-trips to the invisible row: picking "Invisible" is the only way
 * a user reaches OFFLINE by hand, so an OFFLINE account shows that row checked
 * rather than showing nothing selected.
 */
export function toMobileStatusPickerOption(
  status: MobileFriendPresenceStatus | null | undefined,
): MobileStatusPickerOption | null {
  switch (status) {
    case "ONLINE":
    case "IDLE":
    case "DND":
      return status;
    case "OFFLINE":
      return "INVISIBLE";
    default:
      return null;
  }
}
