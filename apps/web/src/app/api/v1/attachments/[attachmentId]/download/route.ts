import { prisma } from "@wizards/db";
import { ApiError, jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { openPublicAttachmentDownload } from "@/lib/attachments/download-proxy";
import { requireApiUserId } from "@/lib/auth/api";
import { canViewAttachmentUrl } from "@/lib/messages/attachment-visibility";
import { requireChannelPermissionForUser } from "@/lib/workspace/permission-service";
import { PermissionBits } from "@/lib/workspace/permissions";

type RouteContext = {
  params: Promise<{ attachmentId: string }>;
};

function contentDispositionFor(filename: string) {
  const normalized = filename.replace(/[\r\n]/g, " ").trim() || "whispr-attachment";
  const fallback = normalized.replace(/[^\x20-\x7E]|["\\]/g, "_").slice(0, 160);

  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(normalized)}`;
}

async function assertAttachmentAccess(
  userId: string,
  attachment: {
    dmMessage: { conversationId: string } | null;
    message: { channelId: string } | null;
    userId: string;
  },
) {
  if (attachment.message) {
    await requireChannelPermissionForUser(
      userId,
      attachment.message.channelId,
      PermissionBits.VIEW_CHANNEL,
    );
    return;
  }

  if (attachment.dmMessage) {
    const participant = await prisma.dMParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: attachment.dmMessage.conversationId,
          userId,
        },
      },
      select: { id: true },
    });

    if (!participant) {
      throw new ApiError("Attachment not found.", 404, "ATTACHMENT_NOT_FOUND");
    }

    return;
  }

  if (attachment.userId !== userId) {
    throw new ApiError("Attachment not found.", 404, "ATTACHMENT_NOT_FOUND");
  }
}

export async function GET(_: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "attachment:download");
    const { attachmentId } = await context.params;
    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      select: {
        contentType: true,
        dmMessage: {
          select: {
            conversationId: true,
          },
        },
        filename: true,
        message: {
          select: {
            channelId: true,
          },
        },
        size: true,
        scanStatus: true,
        url: true,
        userId: true,
      },
    });

    if (!attachment) {
      throw new ApiError("Attachment not found.", 404, "ATTACHMENT_NOT_FOUND");
    }

    await assertAttachmentAccess(userId, attachment);

    if (!canViewAttachmentUrl(attachment, userId)) {
      throw new ApiError("Attachment not found.", 404, "ATTACHMENT_NOT_FOUND");
    }

    const upstream = await openPublicAttachmentDownload(attachment.url);

    const headers = new Headers({
      "Cache-Control": "private, no-store",
      "Content-Disposition": contentDispositionFor(attachment.filename),
      "Content-Type": attachment.contentType || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });

    return new Response(upstream.body, {
      headers,
      status: 200,
    });
  } catch (error) {
    return jsonError(error);
  }
}
