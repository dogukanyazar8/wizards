"use client";

import { useI18n } from "@/components/providers/locale-provider";

interface TypingIndicatorProps {
  typingUsers: string[];
}

export function TypingIndicator({ typingUsers }: TypingIndicatorProps) {
  const { t } = useI18n();

  if (typingUsers.length === 0) {
    return <div className="h-6" />;
  }

  let text = "";
  if (typingUsers.length === 1) {
    text = t("chat.typing.one", { name: typingUsers[0] ?? "" });
  } else if (typingUsers.length === 2) {
    text = t("chat.typing.two", {
      first: typingUsers[0] ?? "",
      second: typingUsers[1] ?? "",
    });
  } else {
    text = t("chat.typing.many");
  }

  return (
    <div className="px-4 py-2 text-xs text-app-muted h-6 flex items-center">
      <span>{text}</span>
      <span className="ml-1 inline-flex gap-0.5">
        <span
          className="w-1 h-1 bg-app-muted rounded-full animate-bounce"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="w-1 h-1 bg-app-muted rounded-full animate-bounce"
          style={{ animationDelay: "150ms" }}
        />
        <span
          className="w-1 h-1 bg-app-muted rounded-full animate-bounce"
          style={{ animationDelay: "300ms" }}
        />
      </span>
    </div>
  );
}
