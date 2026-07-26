import { useCallback, useEffect, useRef, useState } from "react";

import { useMobileAuth } from "../auth/mobile-auth-context";
import { pickMobileImage } from "../media/mobile-image-picker";
import { MOBILE_UPLOAD_MESSAGES } from "../media/mobile-image-upload-service";
import { uploadMobileImageToUploadThing } from "../media/mobile-uploadthing-client";
import type { MobileFeedbackAttachmentDraft } from "./mobile-feedback-model";

export type MobileFeedbackAttachmentUploadOutcome =
  | { readonly attachment: MobileFeedbackAttachmentDraft; readonly status: "uploaded" }
  | { readonly message: string; readonly status: "error" }
  | { readonly status: "cancelled" };

/**
 * The profile upload hook uploads *and* claims, because an avatar is live the
 * moment it lands. A feedback screenshot is not: it belongs to a form the user
 * may still abandon, so this stops at the claim id and lets the submission
 * consume it. An unclaimed upload expires and is swept by the same cleanup that
 * already collects abandoned avatars.
 */
export function useMobileFeedbackAttachmentUpload(): {
  isUploading: boolean;
  pickAndUpload(): Promise<MobileFeedbackAttachmentUploadOutcome>;
} {
  const { getAccessToken } = useMobileAuth();
  const [isUploading, setUploading] = useState(false);
  const activeRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      activeRef.current?.abort();
    };
  }, []);

  const pickAndUpload = useCallback(async (): Promise<MobileFeedbackAttachmentUploadOutcome> => {
    if (activeRef.current) {
      return { message: MOBILE_UPLOAD_MESSAGES.busy, status: "error" };
    }

    const controller = new AbortController();
    activeRef.current = controller;
    setUploading(true);

    try {
      const picked = await pickMobileImage();
      if (!picked || controller.signal.aborted) {
        return { status: "cancelled" };
      }

      const accessToken = await getAccessToken();
      if (!accessToken) {
        return { message: MOBILE_UPLOAD_MESSAGES.signedOut, status: "error" };
      }

      const completion = await uploadMobileImageToUploadThing({
        accessToken,
        file: picked.file,
        signal: controller.signal,
        target: { purpose: "feedback-attachment" },
      });

      return {
        attachment: { claimId: completion.claimId, localUri: picked.localUri },
        status: "uploaded",
      };
    } catch {
      return { message: MOBILE_UPLOAD_MESSAGES.failed, status: "error" };
    } finally {
      if (activeRef.current === controller) {
        activeRef.current = null;
        if (isMountedRef.current) {
          setUploading(false);
        }
      }
    }
  }, [getAccessToken]);

  return { isUploading, pickAndUpload };
}
