import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { requireApiUserId } from "@/lib/auth/api";
import { createAccountDataExportStream } from "@/lib/account/account-data-export-stream";
import { createAccountDataExportResponse } from "./response";

export async function GET() {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "user:data-export");

    const now = new Date();
    const stream = await createAccountDataExportStream(userId, { exportedAt: now });
    return createAccountDataExportResponse(stream, now);
  } catch (error) {
    return jsonError(error);
  }
}
