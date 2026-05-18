import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WhisprChatPreview } from "@/components/design/whispr-chat-preview";

const isPreviewEnabled =
  process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_WHISPR_CHAT_PREVIEW === "true";

export const metadata: Metadata = {
  title: "Whispr Chat Preview",
  description: "Responsive Whispr channel layout design preview",
};

export default function WhisprChatPreviewPage() {
  if (!isPreviewEnabled) {
    notFound();
  }

  return <WhisprChatPreview />;
}
