import { useCallback, useEffect, useRef } from "react";

import { useMobileAuth } from "../auth/mobile-auth-context";
import { pickMobileImage } from "../media/mobile-image-picker";
import { uploadMobileImageToUploadThing } from "../media/mobile-uploadthing-client";
import {
  classifyMobileFeedbackUploadFailure,
  type MobileFeedbackUploadFailureReason,
} from "./mobile-feedback-model";

/**
 * A stalled upload used to hold the form hostage: the card showed a spinner with
 * no close button and no clock, so a request that never answered spun forever.
 * The tile now gives up and offers a retry instead.
 */
export const MOBILE_FEEDBACK_UPLOAD_TIMEOUT_MS = 45_000;

export type MobileFeedbackPickedImage = {
  readonly file: File;
  readonly localUri: string;
};

export type MobileFeedbackUploadResult =
  | { readonly claimId: string; readonly status: "uploaded" }
  | { readonly reason: MobileFeedbackUploadFailureReason; readonly status: "failed" };

/**
 * Picking and uploading are two steps, deliberately.
 *
 * The screen shows the chosen image the moment the picker returns and lets the
 * upload finish underneath it — the same shape the profile avatar flow already
 * used. Doing both in one call meant nothing appeared until the round trip was
 * over, which is exactly what an upload that never answered looked like.
 */
export function useMobileFeedbackAttachmentUpload(): {
  pickImage(): Promise<MobileFeedbackPickedImage | null>;
  uploadImage(file: File): Promise<MobileFeedbackUploadResult>;
} {
  const { getAccessToken } = useMobileAuth();
  const controllersRef = useRef(new Set<AbortController>());

  useEffect(() => {
    const controllers = controllersRef.current;

    return () => {
      for (const controller of controllers) {
        controller.abort();
      }
      controllers.clear();
    };
  }, []);

  const pickImage = useCallback(async (): Promise<MobileFeedbackPickedImage | null> => {
    const picked = await pickMobileImage();
    return picked ? { file: picked.file, localUri: picked.localUri } : null;
  }, []);

  const uploadImage = useCallback(
    async (file: File): Promise<MobileFeedbackUploadResult> => {
      const controller = new AbortController();
      controllersRef.current.add(controller);
      const timeout = setTimeout(() => controller.abort(), MOBILE_FEEDBACK_UPLOAD_TIMEOUT_MS);

      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          return { reason: "signed-out", status: "failed" };
        }

        const completion = await uploadMobileImageToUploadThing({
          accessToken,
          file,
          signal: controller.signal,
          target: { purpose: "feedback-attachment" },
        });

        return { claimId: completion.claimId, status: "uploaded" };
      } catch (error) {
        return {
          reason: classifyMobileFeedbackUploadFailure(error, controller.signal.aborted),
          status: "failed",
        };
      } finally {
        clearTimeout(timeout);
        controllersRef.current.delete(controller);
      }
    },
    [getAccessToken],
  );

  return { pickImage, uploadImage };
}
