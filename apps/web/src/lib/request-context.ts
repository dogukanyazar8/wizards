export const WHISPR_REQUEST_PATHNAME_HEADER = "x-whispr-pathname";

/**
 * Per-request CSP nonce minted by the proxy. Server components read it back to
 * mark their own inline scripts; under `strict-dynamic` the browser drops any
 * inline script that does not carry it.
 */
export const CSP_NONCE_HEADER = "x-nonce";

export const DESKTOP_START_PATHNAME = "/desktop/start";

export function isDesktopStartPathname(pathname: string | null | undefined) {
  return pathname === DESKTOP_START_PATHNAME;
}
