import type { NextRequest } from "next/server";

import { notificationsRoute } from "./route-logic";

export function GET(request: NextRequest) {
  return notificationsRoute(request);
}
