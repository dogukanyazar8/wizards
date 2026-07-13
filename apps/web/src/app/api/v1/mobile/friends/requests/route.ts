import { mobileFriendRequestCreateRoute } from "../route-logic";

export function POST(request: Request) {
  return mobileFriendRequestCreateRoute(request);
}
