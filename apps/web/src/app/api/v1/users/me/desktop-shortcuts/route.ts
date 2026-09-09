import { desktopShortcutsGetRoute, desktopShortcutsPatchRoute } from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(request: Request) {
  return desktopShortcutsGetRoute(request);
}

export function PATCH(request: Request) {
  return desktopShortcutsPatchRoute(request);
}
