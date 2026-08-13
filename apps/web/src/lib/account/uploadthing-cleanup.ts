import { UTApi } from "uploadthing/server";
import { ApiError } from "@/lib/api";

const UPLOADTHING_DELETE_BATCH_SIZE = 100;

export async function deleteUploadThingFileKeys(fileKeys: readonly string[]) {
  if (fileKeys.length === 0) return;
  if (!process.env.UPLOADTHING_TOKEN) {
    throw new ApiError(
      "Upload storage is temporarily unavailable",
      503,
      "UPLOAD_STORAGE_UNAVAILABLE",
    );
  }
  const utapi = new UTApi();
  for (let index = 0; index < fileKeys.length; index += UPLOADTHING_DELETE_BATCH_SIZE) {
    const result = await utapi.deleteFiles(
      fileKeys.slice(index, index + UPLOADTHING_DELETE_BATCH_SIZE),
    );
    if (!result.success) {
      throw new ApiError("Failed to delete uploaded files", 502, "UPLOAD_DELETE_FAILED");
    }
  }
}
