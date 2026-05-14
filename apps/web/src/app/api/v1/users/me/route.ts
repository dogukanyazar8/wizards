import { z } from "zod";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { requireApiUserId } from "@/lib/auth/api";
import {
  ACCOUNT_DELETION_CONFIRMATION,
  anonymizeAccount,
} from "@/lib/account/privacy-service";

const DeleteAccountSchema = z.object({
  confirmation: z.literal(ACCOUNT_DELETION_CONFIRMATION),
});

export async function DELETE(request: Request) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "user:delete");
    await parseJsonBody(request, DeleteAccountSchema);

    const result = await anonymizeAccount(userId);

    return Response.json({
      deletedAt: result.deletedAt.toISOString(),
      success: true,
    });
  } catch (error) {
    return jsonError(error);
  }
}
