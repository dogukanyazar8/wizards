export function resolveMobileScreenShareSupport(input: {
  platform: string;
  hasBroadcastExtension: boolean;
}): "supported" | "unsupported-ios-no-extension" {
  return input.platform === "ios" && !input.hasBroadcastExtension
    ? "unsupported-ios-no-extension"
    : "supported";
}
