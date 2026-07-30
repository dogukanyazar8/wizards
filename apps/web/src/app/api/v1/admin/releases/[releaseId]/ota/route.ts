import {
  adminOtaEnabledRoute,
  adminOtaRegisterRoute,
  type AdminOtaRouteContext,
} from "./route-logic";

export function PATCH(request: Request, context: AdminOtaRouteContext) {
  return adminOtaEnabledRoute(request, context);
}

export function POST(request: Request, context: AdminOtaRouteContext) {
  return adminOtaRegisterRoute(request, context);
}
