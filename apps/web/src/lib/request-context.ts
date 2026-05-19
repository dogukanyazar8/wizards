export const WHISPR_REQUEST_PATHNAME_HEADER = "x-whispr-pathname";

export const DESKTOP_START_PATHNAME = "/desktop/start";

export function isDesktopStartPathname(pathname: string | null | undefined) {
  return pathname === DESKTOP_START_PATHNAME;
}
