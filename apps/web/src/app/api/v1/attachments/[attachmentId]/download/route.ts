import { prisma } from "@wizards/db";
import { ApiError, jsonError } from "@/lib/api";
import { requireApiUserId } from "@/lib/auth/api";
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

function assertDownloadableUrl(url: string) {
  try {
    const parsed = new URL(url);

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new ApiError("Attachment URL is not downloadable.", 400, "INVALID_ATTACHMENT_URL");
    }

    return parsed.toString();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError("Attachment URL is not downloadable.", 400, "INVALID_ATTACHMENT_URL");
  }
}

async function assertAttachmentAccess(userId: string, attachment: {
  dmMessage: { conversationId: string } | null;
  message: { channelId: string } | null;
  userId: string;
}) {
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
        url: true,
        userId: true,
      },
    });

    if (!attachment) {
      throw new ApiError("Attachment not found.", 404, "ATTACHMENT_NOT_FOUND");
    }

    await assertAttachmentAccess(userId, attachment);

    const upstream = await fetch(assertDownloadableUrl(attachment.url), {
      cache: "no-store",
      redirect: "follow",
    });

    if (!upstream.ok || !upstream.body) {
      throw new ApiError("Attachment could not be downloaded.", 502, "ATTACHMENT_DOWNLOAD_FAILED");
    }

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
