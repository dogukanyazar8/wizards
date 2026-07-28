import { createMobileApiClient } from "../api/mobile-api-client";
import { getMobileRuntimeConfig } from "../config/environment";
import type { MobileBoundaryFaultKind } from "../app/mobile-error-boundary-model";
import type { MobileLocale } from "../locale/mobile-copy";
import { activeMobileCopy as copy } from "../locale/mobile-locale-preferences";
import { uploadMobileImageToUploadThing } from "../media/mobile-uploadthing-client";
import { submitMobileFeedback } from "./mobile-feedback-client";
import { getMobileCrashReportTokenReader } from "./mobile-crash-report-bridge";
import { captureMobileCrashScreenshot } from "./mobile-crash-screenshot";
import { buildMobileFeedbackDiagnostics } from "./mobile-feedback-diagnostics";

export type MobileCrashReportOutcome =
  | { readonly publicNumber: number; readonly screenshot: boolean; readonly status: "sent" }
  | { readonly reason: "failed" | "signed-out"; readonly status: "failed" };

export interface MobileCrashReportInput {
  readonly appVersion: string;
  readonly fault: { readonly kind: MobileBoundaryFaultKind; readonly reference: string };
  readonly locale: MobileLocale;
  readonly theme: "dark" | "light";
}

/**
 * A screenshot is evidence, not a requirement.
 *
 * A capture that fails, an upload that fails and a device without the native
 * module all resolve the same way: the report still goes, one attachment
 * lighter, and the screen says so rather than claiming a picture was sent.
 */
async function uploadCrashScreenshot(accessToken: string): Promise<string | null> {
  try {
    const screenshot = await captureMobileCrashScreenshot();

    if (!screenshot) {
      return null;
    }

    const completion = await uploadMobileImageToUploadThing({
      accessToken,
      file: screenshot.file,
      target: { purpose: "feedback-attachment" },
    });

    return completion.claimId;
  } catch {
    return null;
  }
}

/**
 * Files the crash the user is looking at as a real feedback record.
 *
 * The message is composed here rather than asked for: someone staring at a
 * broken screen should not have to describe it, and the parts that actually
 * identify the fault — the classified kind, the reference code, the device and
 * the app version — are already known. Everything that travels is what the
 * "Neler gönderilir?" sheet already promises, plus the screenshot the button
 * names; the raw error text never leaves the device.
 */
export async function sendMobileCrashReport(
  input: MobileCrashReportInput,
): Promise<MobileCrashReportOutcome> {
  const readAccessToken = getMobileCrashReportTokenReader();

  if (!readAccessToken) {
    return { reason: "signed-out", status: "failed" };
  }

  let accessToken: string | null = null;
  try {
    accessToken = await readAccessToken();
  } catch {
    accessToken = null;
  }

  if (!accessToken) {
    return { reason: "signed-out", status: "failed" };
  }

  const claimId = await uploadCrashScreenshot(accessToken);

  try {
    const response = await submitMobileFeedback(
      createMobileApiClient({
        baseUrl: getMobileRuntimeConfig().apiUrl,
        getAccessToken: readAccessToken,
      }),
      {
        attachmentClaimIds: claimId ? [claimId] : [],
        diagnostics: buildMobileFeedbackDiagnostics({
          appVersion: input.appVersion,
          locale: input.locale,
          theme: input.theme,
        }),
        message: copy.errorBoundaryFeedbackMessage
          .replace("{reference}", input.fault.reference)
          .replace("{kind}", input.fault.kind),
        rating: "BAD",
        topic: "BUG",
      },
    );

    return {
      publicNumber: response.feedback.publicNumber,
      screenshot: claimId !== null,
      status: "sent",
    };
  } catch {
    return { reason: "failed", status: "failed" };
  }
}
