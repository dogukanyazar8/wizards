import { patchServerMemberRolesRoute } from "./route-logic";

type RouteContext = {
  params: Promise<{
    memberId: string;
    serverId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  return patchServerMemberRolesRoute(request, context);
}
