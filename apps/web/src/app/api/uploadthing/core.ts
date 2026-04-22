import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { auth } from "@/auth";

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

      return { userId };
    })
    .onUploadComplete(async ({ file }) => {
      return {
        url: file.ufsUrl,
      };
    }),
};

export type WizardsUploadRouter = typeof uploadRouter;
