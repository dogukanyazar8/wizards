import { z } from "zod";
import { prisma } from "@wizards/db";
import { requireApiUserId } from "@/lib/auth/api";
import { ApiError, jsonError, parseJsonBody } from "@/lib/api";
import { assertE2EApiRouteEnabled } from "@/lib/e2e/route-guard";
import {
  getMessageAttachmentMaxBytes,
  isMessageAttachmentFilenameAllowed,
  isSupportedMessageAttachmentContentType,
  normalizeMessageAttachmentFilename,
} from "@/lib/messages/attachments";

const E2EUploadSchema = z.object({
  contentType: z.string().trim().min(1).max(120),
  dataUrl: z.string().trim().min(1).max(1_000_000),
  endpoint: z.enum(["messageAttachmentUploader", "profileAvatarUploader", "serverIconUploader"]),
  filename: z.string().trim().min(1).max(255),
  size: z.number().int().min(1).max(16 * 1024 * 1024),
});

function assertDataUrlMatchesContentType(dataUrl: string, contentType: string) {
  if (!dataUrl.startsWith(`data:${contentType};`)) {
    throw new ApiError("Invalid E2E upload payload.", 400, "INVALID_E2E_UPLOAD");
  }
}

export async function POST(request: Request) {
  try {
    assertE2EApiRouteEnabled(request.url);
    const userId = await requireApiUserId();
    const input = await parseJsonBody(request, E2EUploadSchema);

    assertDataUrlMatchesContentType(input.dataUrl, input.contentType);

    if (input.endpoint === "serverIconUploader" || input.endpoint === "profileAvatarUploader") {
      if (!input.contentType.startsWith("image/")) {
        throw new ApiError("Invalid E2E image upload.", 400, "INVALID_E2E_UPLOAD");
      }

      return Response.json({
        serverData: {
          url: input.dataUrl,
        },
        url: input.dataUrl,
      });
    }

    const maxBytes = getMessageAttachmentMaxBytes(input.contentType);
    if (
      !isSupportedMessageAttachmentContentType(input.contentType) ||
      !isMessageAttachmentFilenameAllowed(input.contentType, input.filename) ||
      input.size > maxBytes
    ) {
      throw new ApiError("Unsupported E2E attachment upload.", 400, "INVALID_E2E_UPLOAD");
    }

    const attachment = await prisma.attachment.create({
      data: {
        contentType: input.contentType,
        filename: normalizeMessageAttachmentFilename(input.filename),
        scanStatus: "CLEAN",
        size: input.size,
        url: input.dataUrl,
        userId,
      },
      select: {
        contentType: true,
        filename: true,
        height: true,
        id: true,
        scanStatus: true,
        size: true,
        url: true,
        width: true,
      },
    });

    return Response.json({
      serverData: attachment,
      url: attachment.url,
    });
  } catch (error) {
    return jsonError(error);
  }
}
