import { useCallback, useEffect, useRef, useState } from "react";

import { useMobileAuth } from "../auth/mobile-auth-context";
import { claimMobileMediaUpload } from "./mobile-media-claim-client";
import { pickMobileImage } from "./mobile-image-picker";
import {
  executeMobileImageUpload,
  MOBILE_UPLOAD_MESSAGES,
  type MobileImageUploadOutcome,
} from "./mobile-image-upload-service";
import type { MobileImageUploadTarget } from "./mobile-image-upload-contract";
import { uploadMobileImageToUploadThing } from "./mobile-uploadthing-client";

export function useMobileImageUpload(): {
  isBusy: boolean;
  selectAndUpload(
    target: MobileImageUploadTarget,
    onLocalPreview: (localUri: string) => void,
  ): Promise<MobileImageUploadOutcome>;
} {
  const { apiClient, getAccessToken } = useMobileAuth();
  const [isBusy, setIsBusy] = useState(false);
  const activeOperationRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      activeOperationRef.current?.abort();
    };
  }, []);

  const selectAndUpload = useCallback(
    async (
      target: MobileImageUploadTarget,
      onLocalPreview: (localUri: string) => void,
    ): Promise<MobileImageUploadOutcome> => {
      if (activeOperationRef.current) {
        return { message: MOBILE_UPLOAD_MESSAGES.busy, status: "error" };
      }

      const controller = new AbortController();
      activeOperationRef.current = controller;
      setIsBusy(true);

      try {
        return await executeMobileImageUpload({
          dependencies: {
            claimUpload: (claim) => claimMobileMediaUpload(apiClient, claim),
            getAccessToken,
            pickImage: pickMobileImage,
            uploadFile: uploadMobileImageToUploadThing,
          },
          onLocalPreview,
          signal: controller.signal,
          target,
        });
      } finally {
        if (activeOperationRef.current === controller) {
          activeOperationRef.current = null;
          if (isMountedRef.current) {
            setIsBusy(false);
          }
        }
      }
    },
    [apiClient, getAccessToken],
  );

  return { isBusy, selectAndUpload };
}
