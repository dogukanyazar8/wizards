import { adminReleaseArtifactRegisterRoute } from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function POST(request: Request, context: { params: Promise<Record<string, string>> }) {
  return adminReleaseArtifactRegisterRoute(request, context);
}
