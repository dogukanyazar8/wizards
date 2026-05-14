import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { auth } from "@/auth";
import { prisma } from "@wizards/db";
import {
  getMessageAttachmentMaxBytes,
  isMessageAttachmentFilenameAllowed,
  isSupportedMessageAttachmentContentType,
  normalizeMessageAttachmentFilename,
} from "@/lib/messages/attachments";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRedisRate } from "@/lib/redis";
import { logError } from "@/lib/logger";

const f = createUploadthing();

export function isUploadUserAllowed(user: {
  deletedAt?: Date | null;
  emailVerified: boolean;
  id: string;
  isBanned: boolean;
} | null): user is {
  deletedAt?: null;
  emailVerified: true;
  id: string;
  isBanned: false;
} {
  return Boolean(user && user.emailVerified && !user.isBanned && !user.deletedAt);
}

async function requireUploadUser() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    throw new UploadThingError("Unauthorized");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      deletedAt: true,
      emailVerified: true,
      id: true,
      isBanned: true,
    },
  });

  if (!isUploadUserAllowed(user)) {
    throw new UploadThingError("Unauthorized");
  }

  return { userId: user.id };
}

async function requireMessageUploadUser() {
  const { userId } = await requireUploadUser();

  try {
    const allowed = await checkRateLimit(
      getRedisRate(),
      `rate:upload:message-attachment:${userId}`,
      30,
      300,
    );

    if (!allowed) {
      throw new UploadThingError("Too many uploads. Please try again shortly.");
    }
  } catch (error) {
    if (error instanceof UploadThingError) {
      throw error;
    }
    logError("[upload] Message attachment rate limit unavailable", error);
    throw new UploadThingError("Upload checks are temporarily unavailable. Please try again shortly.");
  }

  return { userId };
}

async function requireProfileAvatarUploadUser() {
  const { userId } = await requireUploadUser();

  try {
    const allowed = await checkRateLimit(
      getRedisRate(),
      `rate:upload:profile-avatar:${userId}`,
      10,
      300,
    );

    if (!allowed) {
      throw new UploadThingError("Too many avatar uploads. Please try again shortly.");
    }
  } catch (error) {
    if (error instanceof UploadThingError) {
      throw error;
    }
    logError("[upload] Profile avatar rate limit unavailable", error);
    throw new UploadThingError("Upload checks are temporarily unavailable. Please try again shortly.");
  }

  return { userId };
}

async function createMessageAttachment({
  file,
  metadata,
}: {
  file: {
    name: string;
    size: number;
    type: string;
    ufsUrl: string;
  };
  metadata: { userId: string };
}) {
  const maxBytes = getMessageAttachmentMaxBytes(file.type);

  if (
    !isSupportedMessageAttachmentContentType(file.type) ||
    !isMessageAttachmentFilenameAllowed(file.type, file.name) ||
    file.size <= 0 ||
    file.size > maxBytes
  ) {
    throw new UploadThingError("Unsupported attachment upload");
  }

  return prisma.attachment.create({
    data: {
      userId: metadata.userId,
      url: file.ufsUrl,
      filename: normalizeMessageAttachmentFilename(file.name),
      contentType: file.type,
      size: file.size,
    },
    select: {
      id: true,
      url: true,
      filename: true,
      contentType: true,
      size: true,
      width: true,
      height: true,
      duration: true,
      thumbnailUrl: true,
    },
  });
}

export const uploadRouter: FileRouter = {
  profileAvatarUploader: f({
    "image/jpeg": {
      maxFileCount: 1,
      maxFileSize: "4MB",
    },
    "image/png": {
      maxFileCount: 1,
      maxFileSize: "4MB",
    },
    "image/webp": {
      maxFileCount: 1,
      maxFileSize: "4MB",
    },
  })
    .middleware(requireProfileAvatarUploadUser)
    .onUploadComplete(async ({ file }) => {
      return {
        url: file.ufsUrl,
      };
    }),
  serverIconUploader: f({
    image: {
      maxFileCount: 1,
      maxFileSize: "4MB",
    },
  })
    .middleware(async () => {
      const { userId } = await requireUploadUser();

      try {
        const allowed = await checkRateLimit(
          getRedisRate(),
          `rate:upload:server-icon:${userId}`,
          10,
          300,
        );

        if (!allowed) {
          throw new UploadThingError("Too many image uploads. Please try again shortly.");
        }
      } catch (error) {
        if (error instanceof UploadThingError) {
          throw error;
        }
        logError("[upload] Server icon rate limit unavailable", error);
        throw new UploadThingError("Upload checks are temporarily unavailable. Please try again shortly.");
      }

      return { userId };
    })
    .onUploadComplete(async ({ file }) => {
      return {
        url: file.ufsUrl,
      };
    }),
  messageImageUploader: f({
    "image/gif": {
      maxFileCount: 5,
      maxFileSize: "8MB",
    },
    "image/png": {
      maxFileCount: 5,
      maxFileSize: "8MB",
    },
    "image/jpeg": {
      maxFileCount: 5,
      maxFileSize: "8MB",
    },
    "image/webp": {
      maxFileCount: 5,
      maxFileSize: "8MB",
    },
  })
    .middleware(requireMessageUploadUser)
    .onUploadComplete(createMessageAttachment),
  messageAttachmentUploader: f({
    "image/gif": {
      maxFileCount: 5,
      maxFileSize: "8MB",
    },
    "image/png": {
      maxFileCount: 5,
      maxFileSize: "8MB",
    },
    "image/jpeg": {
      maxFileCount: 5,
      maxFileSize: "8MB",
    },
    "image/webp": {
      maxFileCount: 5,
      maxFileSize: "8MB",
    },
    "application/pdf": {
      maxFileCount: 5,
      maxFileSize: "16MB",
    },
    "application/msword": {
      maxFileCount: 5,
      maxFileSize: "16MB",
    },
    "application/rtf": {
      maxFileCount: 5,
      maxFileSize: "16MB",
    },
    "application/vnd.ms-excel": {
      maxFileCount: 5,
      maxFileSize: "16MB",
    },
    "application/vnd.ms-powerpoint": {
      maxFileCount: 5,
      maxFileSize: "16MB",
    },
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
      maxFileCount: 5,
      maxFileSize: "16MB",
    },
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
      maxFileCount: 5,
      maxFileSize: "16MB",
    },
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
      maxFileCount: 5,
      maxFileSize: "16MB",
    },
    "text/csv": {
      maxFileCount: 5,
      maxFileSize: "16MB",
    },
    "text/markdown": {
      maxFileCount: 5,
      maxFileSize: "16MB",
    },
    "text/plain": {
      maxFileCount: 5,
      maxFileSize: "16MB",
    },
    "video/mp4": {
      maxFileCount: 5,
      maxFileSize: "32MB",
    },
    "video/quicktime": {
      maxFileCount: 5,
      maxFileSize: "32MB",
    },
    "video/webm": {
      maxFileCount: 5,
      maxFileSize: "32MB",
    },
  })
    .middleware(requireMessageUploadUser)
    .onUploadComplete(createMessageAttachment),
};

export type WizardsUploadRouter = typeof uploadRouter;
