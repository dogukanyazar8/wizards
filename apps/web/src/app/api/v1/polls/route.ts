import { pollCreateRoute } from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  return pollCreateRoute(request);
}
