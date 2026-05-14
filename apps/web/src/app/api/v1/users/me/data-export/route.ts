import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { requireApiUserId } from "@/lib/auth/api";
import {
  getAccountDataExport,
  serializeAccountDataExport,
} from "@/lib/account/privacy-service";

export async function GET() {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "user:data-export");

    const exportData = await getAccountDataExport(userId);
    const body = serializeAccountDataExport(exportData);

    return new Response(body, {
      headers: {
        "Content-Disposition": `attachment; filename="whispr-data-export-${userId}.json"`,
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
