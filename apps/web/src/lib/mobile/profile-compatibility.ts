/** Capability negotiation changes wire shape only; it never grants access. */
export function supportsMobileProfileDetails(request: Request): boolean {
  return (request.headers.get("x-whispr-capabilities") ?? "")
    .split(",")
    .some((value) => value.trim() === "profile-details-v2");
}

/** Old clients reject emoji strings over 16 code units. Do not split a ZWJ sequence. */
export function mobileProfileEmoji(request: Request, emoji: string | null): string | null {
  return supportsMobileProfileDetails(request) || (emoji?.length ?? 0) <= 16 ? emoji : null;
}
