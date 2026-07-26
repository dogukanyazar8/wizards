import { useState } from "react";
import type { MobileFeedbackSubmitResponse } from "@wizards/types";

import { MobileFeedbackScreen } from "./mobile-feedback-screen";
import { MobileFeedbackSubmittedScreen } from "./mobile-feedback-submitted-screen";

/**
 * 4a and 4b are one destination, not two.
 *
 * Sending replaces the form with its receipt and "Yeni geri bildirim gönder"
 * puts a blank form back — both without touching the stack, so Back always
 * means "leave feedback" and the navigator never has to unwind a route the user
 * has already finished with.
 */
export function MobileFeedbackFlowScreen({
  appVersion,
  onClose,
  onOpenRoadmap,
}: {
  readonly appVersion: string;
  onClose(): void;
  onOpenRoadmap(): void;
}) {
  const [submission, setSubmission] = useState<MobileFeedbackSubmitResponse | null>(null);

  if (submission === null) {
    return (
      <MobileFeedbackScreen
        appVersion={appVersion}
        onBack={onClose}
        onOpenRoadmap={onOpenRoadmap}
        onSubmitted={setSubmission}
      />
    );
  }

  return (
    <MobileFeedbackSubmittedScreen
      feedback={submission.feedback}
      onBack={onClose}
      onOpenRoadmap={onOpenRoadmap}
      onStartNewFeedback={() => setSubmission(null)}
      roadmap={submission.roadmap}
    />
  );
}
