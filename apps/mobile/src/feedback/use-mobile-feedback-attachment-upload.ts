import { useCallback, useEffect, useRef } from "react";

import { useMobileAuth } from "../auth/mobile-auth-context";
import { pickMobileImages } from "../media/mobile-image-picker";
import {
  createMobileUploadWatchdog,
  type MobileUploadStage,
} from "../media/mobile-upload-watchdog";
import { uploadMobileImageToUploadThing } from "../media/mobile-uploadthing-client";
import type { MobileImageUploadErrorCode } from "../media/mobile-image-upload-contract";
import {
  classifyMobileFeedbackUploadFailure,
  type MobileFeedbackUploadFailureReason,
} from "./mobile-feedback-model";

export type MobileFeedbackPickedImage = {
  readonly file: File;
  readonly localUri: string;
};

export type MobileFeedbackPickResult = {
  readonly failures: readonly MobileImageUploadErrorCode[];
  readonly picked: readonly MobileFeedbackPickedImage[];
};

export type MobileFeedbackUploadResult =
  | { readonly claimId: string; readonly status: "uploaded" }
  | { readonly reason: MobileFeedbackUploadFailureReason; readonly status: "failed" };

export type MobileFeedbackUploadOptions = {
  onProgress?: (progress: number) => void;
};

/**
 * Picking and uploading are two steps, deliberately.
 *
 * The screen shows the chosen images the moment the picker returns and lets the
 * uploads finish underneath them — the same shape the profile avatar flow
 * already used. Doing both in one call meant nothing appeared until the round
 * trip was over, which is exactly what an upload that never answered looked
 * like.
 *
 * The deadline is per stage rather than per attempt: the transfer is judged on
 * whether bytes are still moving, and the silent tail after the last byte — the
 * part where UploadThing is waiting on this app's own completion callback —
 * gets its own, longer budget. A single flat timer over both is what reported
 * "zaman aşımına uğradı" for uploads that were merely slow.
 */
export function useMobileFeedbackAttachmentUpload(): {
  pickImages(limit: number): Promise<MobileFeedbackPickResult>;
  uploadImage(
    file: File,
    options?: MobileFeedbackUploadOptions,
  ): Promise<MobileFeedbackUploadResult>;
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

  const pickImages = useCallback(async (limit: number): Promise<MobileFeedbackPickResult> => {
    const batch = await pickMobileImages(limit);

    return {
      failures: batch.failures,
      picked: batch.picked.map((image) => ({ file: image.file, localUri: image.localUri })),
    };
  }, []);

  const uploadImage = useCallback(
    async (
      file: File,
      options?: MobileFeedbackUploadOptions,
    ): Promise<MobileFeedbackUploadResult> => {
      const controller = new AbortController();
      controllersRef.current.add(controller);

      let abortedStage: MobileUploadStage | null = null;
      const watchdog = createMobileUploadWatchdog({
        onExpire: (stage) => {
          abortedStage = stage;
          controller.abort();
        },
      });

      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          return { reason: "signed-out", status: "failed" };
        }

        const completion = await uploadMobileImageToUploadThing({
          accessToken,
          file,
          onProgress: ({ loaded, total }) => {
            watchdog.progress({ loaded, total });
            options?.onProgress?.(total > 0 ? Math.min(1, loaded / total) : 0);
          },
          signal: controller.signal,
          target: { purpose: "feedback-attachment" },
        });

        return { claimId: completion.claimId, status: "uploaded" };
      } catch (error) {
        return {
          reason: classifyMobileFeedbackUploadFailure(error, abortedStage),
          status: "failed",
        };
      } finally {
        watchdog.stop();
        controllersRef.current.delete(controller);
      }
    },
    [getAccessToken],
  );

  return { pickImages, uploadImage };
}
