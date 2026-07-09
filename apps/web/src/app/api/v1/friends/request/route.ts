import { postFriendRequestRoute } from "./route-logic";

export async function POST(request: Request) {
  return postFriendRequestRoute(request);
}
