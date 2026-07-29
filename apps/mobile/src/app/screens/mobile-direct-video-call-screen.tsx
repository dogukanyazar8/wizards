import {
  MobileDirectCallSurface,
  type MobileDirectCallScreenProps,
} from "./mobile-direct-call-screen";

/**
 * 5f — DM video call. Same room surface as the answered voice call: the cameras and
 * any screen share become stage tiles, so the two entry points differ only in the
 * header identity. There is no separate full-bleed remote feed and no self PiP —
 * the stage already gives every live surface an equal tile, exactly as a server
 * voice room does.
 */
export function MobileDirectVideoCallScreen({
  testID = "mobile-direct-video-call-screen",
  ...props
}: MobileDirectCallScreenProps) {
  return (
    <MobileDirectCallSurface
      {...props}
      testID={testID}
      testIDPrefix="mobile-direct-video-call"
      variant="video"
    />
  );
}
