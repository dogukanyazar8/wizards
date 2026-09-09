import { mobileBackupCodeRoute } from "../two-factor/route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  return mobileBackupCodeRoute(request);
}
