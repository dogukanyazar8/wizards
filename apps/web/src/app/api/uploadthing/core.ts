import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { auth } from "@/auth";
import { prisma } from "@wizards/db";
import {
  MESSAGE_IMAGE_CONTENT_TYPES,
  MESSAGE_IMAGE_MAX_BYTES,
} from "@/lib/messages/attachments";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRedis } from "@/lib/redis";

const f = createUploadthing();

export const uploadRouter: FileRouter = {
  serverIconUploader: f({
    image: {
      maxFileCount: 1,
      maxFileSize: "4MB",
    },
  })
    .middleware(async () => {
      const session = await auth();
      const userId = session?.user?.id;

      if (!userId) {
        throw new UploadThingError("Unauthorized");
      }

      try {
        const allowed = await checkRateLimit(
          getRedis(),
          `rate:upload:message-image:${userId}`,
          30,
          300,
        );

        if (!allowed) {
          throw new UploadThingError("Too many image uploads. Please try again shortly.");
        }
      } catch (error) {
        if (error instanceof UploadThingError) {
          throw error;
        }
        // Uploads should not hard-fail because Redis is temporarily unavailable.
      }

      return { userId };
    })
    .onUploadComplete(async ({ file }) => {
      return {
        url: file.ufsUrl,
      };
    }),
  messageImageUploader: f({
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
    .middleware(async () => {
      const session = await auth();
      const userId = session?.user?.id;

      if (!userId) {
        throw new UploadThingError("Unauthorized");
      }

      return { userId };
    })
    .onUploadComplete(async ({ file, metadata }) => {
      if (
        !MESSAGE_IMAGE_CONTENT_TYPES.includes(
          file.type as (typeof MESSAGE_IMAGE_CONTENT_TYPES)[number],
        ) ||
        file.size <= 0 ||
        file.size > MESSAGE_IMAGE_MAX_BYTES
      ) {
        throw new UploadThingError("Unsupported image upload");
      }

      const attachment = await prisma.attachment.create({
        data: {
          userId: metadata.userId,
          url: file.ufsUrl,
          filename: file.name,
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
        },
      });

      return attachment;
    }),
};

export type WizardsUploadRouter = typeof uploadRouter;
