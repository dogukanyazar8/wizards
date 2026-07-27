import { createRouteHandler } from "uploadthing/next";
import { resolveUploadCallbackUrl } from "@/lib/attachments/upload-callback-url";
import { uploadRouter } from "./core";

// Pinning the callback URL keeps UploadThing off the http:// origin a proxy
// deployment can hand the SDK, which this app answers with a redirect the
// ingest never follows. See resolveUploadCallbackUrl.
const callbackUrl = resolveUploadCallbackUrl();

export const { GET, POST } = createRouteHandler({
  router: uploadRouter,
  ...(callbackUrl ? { config: { callbackUrl } } : {}),
});
