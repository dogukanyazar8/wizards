import { prisma } from "@wizards/db";
import { MobileMediaUploadIntentSchema } from "@wizards/types";
import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";

import { auth } from "@/auth";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { createPendingMessageAttachmentUpload } from "@/lib/attachments/upload-persistence";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRedisRate } from "@/lib/redis";
import { logError } from "@/lib/logger";
import {
  assertGroupIconUploadAllowed,
  GroupIconUploadInputSchema,
} from "@/lib/dm/group-icon-upload";
import { getBearerTokenFromRequest } from "@/lib/mobile/auth";
import {
  authorizeMobileMediaUpload,
  authorizeProfileBannerUpload,
  completeMobileMediaUpload,
} from "@/lib/mobile/mobile-media-uploadthing";

const f = createUploadthing();

export function isUploadUserAllowed(
  user: {
    deletedAt?: Date | null;
    emailVerified: boolean;
    id: string;
    isBanned: boolean;
  } | null,
): user is {
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

export async function resolveMessageUploadUserId({
  dependencies = {
    requireMobileApiUserId,
    requireWebUploadUser: async () => (await requireUploadUser()).userId,
  },
  request,
}: {
  dependencies?: {
    requireMobileApiUserId(request: Request): Promise<string>;
    requireWebUploadUser(): Promise<string>;
  };
  request: Request;
}): Promise<string> {
  // A malformed or expired Bearer token must never silently fall back to a
  // cookie session. That would turn one caller's explicit mobile credential
  // into another principal's upload authorization.
  if (getBearerTokenFromRequest(request)) {
    return dependencies.requireMobileApiUserId(request);
  }

  return dependencies.requireWebUploadUser();
}

async function requireMessageUploadUser({ req }: { req: Request }) {
  let userId: string;

  try {
    userId = await resolveMessageUploadUserId({ request: req });
  } catch {
    throw new UploadThingError("Unauthorized");
  }

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
    throw new UploadThingError(
      "Upload checks are temporarily unavailable. Please try again shortly.",
    );
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
    throw new UploadThingError(
      "Upload checks are temporarily unavailable. Please try again shortly.",
    );
  }

  return { userId };
}

async function requireGroupIconUploadUser({ req }: { req: Request }) {
  let userId: string;

  // Web and mobile share this uploader, so the identity resolves the same way a
  // message attachment does: a bearer token never falls back to a cookie session.
  try {
    userId = await resolveMessageUploadUserId({ request: req });
  } catch {
    throw new UploadThingError("Unauthorized");
  }

  try {
    const allowed = await checkRateLimit(
      getRedisRate(),
      `rate:upload:group-icon:${userId}`,
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
    logError("[upload] Group icon rate limit unavailable", error);
    throw new UploadThingError(
      "Upload checks are temporarily unavailable. Please try again shortly.",
    );
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
  return createPendingMessageAttachmentUpload(prisma, file, metadata);
}

export const uploadRouter: FileRouter = {
  groupIconUploader: f({
    image: {
      maxFileCount: 1,
      maxFileSize: "4MB",
    },
  })
    .input(GroupIconUploadInputSchema)
    .middleware(async ({ input, req }) => {
      const { userId } = await requireGroupIconUploadUser({ req });
      await assertGroupIconUploadAllowed({ conversationId: input.conversationId, userId });

      return { userId };
    })
    .onUploadComplete(async ({ file }) => {
      return {
        url: file.ufsUrl,
      };
    }),
  mobileMediaUploader: f({
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
    .input(MobileMediaUploadIntentSchema)
    .middleware(({ input, req }) => authorizeMobileMediaUpload({ intent: input, request: req }))
    .onUploadComplete(completeMobileMediaUpload),
  profileBannerUploader: f({
    "image/jpeg": { maxFileCount: 1, maxFileSize: "4MB" },
    "image/png": { maxFileCount: 1, maxFileSize: "4MB" },
    "image/webp": { maxFileCount: 1, maxFileSize: "4MB" },
  })
    .middleware(() => authorizeProfileBannerUpload())
    .onUploadComplete(completeMobileMediaUpload),
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
        throw new UploadThingError(
          "Upload checks are temporarily unavailable. Please try again shortly.",
        );
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
    .middleware(({ req }) => requireMessageUploadUser({ req }))
    .onUploadComplete(createMessageAttachment),
  messageAttachmentUploader: f({
    // karar #5. Üç ses tipi: Safari `audio/mp4`, Chrome/Firefox `audio/webm`,
    // bazı Firefox sürümleri `audio/ogg`. `MESSAGE_AUDIO_CONTENT_TYPES` ile
    // aynı küme; biri eksik kalsaydı kayıt alınır ama yüklenemezdi.
    "audio/mp4": {
      maxFileCount: 5,
      maxFileSize: "16MB",
    },
    "audio/ogg": {
      maxFileCount: 5,
      maxFileSize: "16MB",
    },
    "audio/webm": {
      maxFileCount: 5,
      maxFileSize: "16MB",
    },
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
    .middleware(({ req }) => requireMessageUploadUser({ req }))
    .onUploadComplete(createMessageAttachment),
};

export type WizardsUploadRouter = typeof uploadRouter;
