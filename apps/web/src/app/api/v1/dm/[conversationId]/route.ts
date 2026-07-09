import {
  deleteDirectMessageConversationRoute,
  getDirectMessageConversationRoute,
} from "./route-logic";

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  return getDirectMessageConversationRoute(request, context);
}

export async function DELETE(_: Request, context: RouteContext) {
  return deleteDirectMessageConversationRoute(_, context);
}
