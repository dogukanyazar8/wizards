"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { SERVER_TAG_LIMIT, ServerTagSchema } from "@wizards/types";
import { Button } from "@wizards/ui";

import { useI18n } from "@/components/providers/locale-provider";
import { Input } from "@/components/ui/input";

type ServerTagsEditorProps = {
  disabled?: boolean;
  onChange: (tags: string[]) => void;
  tags: string[];
};

/**
 * 6d discovery labels. The slug rule and the five-tag ceiling are not
 * re-implemented here: `ServerTagSchema` is the single validator both clients
 * call (Faz 1 §C3), and this only decides what to show when it rejects.
 */
export function ServerTagsEditor({ disabled = false, onChange, tags }: ServerTagsEditorProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const addTag = () => {
    if (tags.length >= SERVER_TAG_LIMIT) {
      setError(t("serverSettings.tags.limitReached"));
      return;
    }

    const parsed = ServerTagSchema.safeParse(draft);
    if (!parsed.success) {
      setError(t("serverSettings.tags.invalid"));
      return;
    }

    setError(null);
    setDraft("");

    if (!tags.includes(parsed.data)) {
      onChange([...tags, parsed.data]);
    }
  };

  return (
    <div className="app-panel rounded-[28px] border p-4 sm:p-5" data-testid="server-tags-editor">
      <p className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">
        {t("serverSettings.tags.title")}
      </p>
      <p className="mt-2 text-sm leading-6 text-app-muted">
        {t("serverSettings.tags.description")}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {tags.length === 0 ? (
          <span className="text-sm text-app-muted">{t("serverSettings.tags.empty")}</span>
        ) : (
          tags.map((tag) => (
            <span
              className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm"
              data-testid={`server-tag-${tag}`}
              key={tag}
            >
              {tag}
              <button
                aria-label={t("serverSettings.tags.remove", { tag })}
                className="text-app-muted hover:text-app"
                disabled={disabled}
                onClick={() => onChange(tags.filter((current) => current !== tag))}
                type="button"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <Input
          aria-label={t("serverSettings.tags.add")}
          data-testid="server-tag-input"
          disabled={disabled || tags.length >= SERVER_TAG_LIMIT}
          maxLength={24}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addTag();
            }
          }}
          placeholder={t("serverSettings.tags.placeholder")}
          value={draft}
        />
        <Button
          data-testid="server-tag-add"
          disabled={disabled || draft.trim().length === 0 || tags.length >= SERVER_TAG_LIMIT}
          onClick={addTag}
          type="button"
          variant="outline"
        >
          {t("serverSettings.tags.add")}
        </Button>
      </div>

      {error ? (
        <p className="mt-2 text-sm text-[hsl(var(--danger))]" data-testid="server-tag-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
