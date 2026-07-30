import type { MobileBugReportRequest } from "@wizards/types";
import { useEffect, useRef } from "react";

import { useMobileAuth } from "../auth/mobile-auth-context";
import { useToast } from "../app/components/kit/toast";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useMobileNetworkStatus } from "../app/providers/mobile-network-provider";
import { useMobileFeedbackAttachmentUpload } from "../feedback/use-mobile-feedback-attachment-upload";
import { mobileCopy } from "../locale/mobile-copy";
import { submitMobileBugReport } from "./mobile-about-client";
import { restoreQueuedMobileBugReportScreenshot } from "./mobile-bug-report-diagnostics";
import {
  readQueuedMobileBugReports,
  writeQueuedMobileBugReports,
  type MobileBugReportQueuedDraft,
} from "./mobile-bug-report-model";

function reportReceivedCopy(template: string, ticket: string): string {
  return template.replace("{ticket}", ticket);
}

function withoutScreenshot(request: MobileBugReportRequest): MobileBugReportRequest {
  const { screenshotUploadKey: _screenshotUploadKey, ...rest } = request;
  return { ...rest, includesScreenshot: false };
}

async function prepareQueuedRequest(
  draft: MobileBugReportQueuedDraft,
  uploadImage: ReturnType<typeof useMobileFeedbackAttachmentUpload>["uploadImage"],
): Promise<MobileBugReportRequest | null> {
  if (!draft.request.includesScreenshot || draft.request.screenshotUploadKey) {
    return draft.request;
  }
  if (!draft.screenshotLocalUri) {
    return withoutScreenshot(draft.request);
  }

  const screenshot = restoreQueuedMobileBugReportScreenshot(draft.screenshotLocalUri);
  if (screenshot === null) {
    return withoutScreenshot(draft.request);
  }

  const upload = await uploadImage(screenshot.file);
  if (upload.status === "failed") {
    return null;
  }

  return {
    ...draft.request,
    includesScreenshot: true,
    screenshotUploadKey: upload.claimId,
  };
}

/**
 * Lives above the navigator so a queued form keeps its reconnect listener after
 * the report screen closes. It consumes the existing feedback upload hook but
 * owns a separate queue and support endpoint.
 */
export function MobileBugReportQueueBridge() {
  const auth = useMobileAuth();
  const networkStatus = useMobileNetworkStatus();
  const { uploadImage } = useMobileFeedbackAttachmentUpload();
  const { showToast } = useToast();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const flushingRef = useRef(false);

  useEffect(() => {
    if (networkStatus !== "online" || auth.status !== "signed-in" || flushingRef.current) {
      return;
    }

    let active = true;
    flushingRef.current = true;
    void (async () => {
      let pending = [...(await readQueuedMobileBugReports())];

      while (active && pending.length > 0) {
        const draft = pending[0]!;
        try {
          const request = await prepareQueuedRequest(draft, uploadImage);
          if (request === null) {
            return;
          }

          const response = await submitMobileBugReport(auth.apiClient, request);
          pending = pending.slice(1);
          await writeQueuedMobileBugReports(pending);
          showToast({
            title: reportReceivedCopy(copy.reportReceived, response.ticket),
            variant: "success",
          });
        } catch {
          // Keep this and all later drafts in order. A future connectivity
          // transition (or app start) retries them.
          return;
        }
      }
    })().finally(() => {
      flushingRef.current = false;
    });

    return () => {
      active = false;
    };
  }, [auth.apiClient, auth.status, copy.reportReceived, networkStatus, showToast, uploadImage]);

  return null;
}
