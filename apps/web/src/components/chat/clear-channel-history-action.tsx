"use client";

import { useCallback, useMemo, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@wizards/ui";
import { useI18n } from "@/components/providers/locale-provider";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { clearChannelMessagesRequest, workspaceQueryKeys } from "@/lib/workspace/client";
import { getMessagesQueryKey, resetMessagePages, type MessagePages } from "@/hooks/use-messages";

type ClearChannelHistoryActionProps = {
  channelId: string;
  channelName: string;
  serverId: string;
};

export function ClearChannelHistoryAction({
  channelId,
  channelName,
  serverId,
}: ClearChannelHistoryActionProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [confirmationValue, setConfirmationValue] = useState("");
  const expectedConfirmationValue = useMemo(() => `#${channelName}`, [channelName]);

  const queryKey = useMemo(() => getMessagesQueryKey("channel", channelId), [channelId]);
  const confirmationMatches = confirmationValue === expectedConfirmationValue;

  const mutation = useMutation<
    { deletedCount: number; success: true },
    Error,
    void,
    { previousMessages: MessagePages | undefined }
  >({
    mutationFn: async () => clearChannelMessagesRequest(channelId),
    onMutate: async () => {
      await queryClient.cancelQueries({
        queryKey,
      });

      const previousMessages = queryClient.getQueryData<MessagePages>(queryKey);

      queryClient.setQueryData<MessagePages>(queryKey, resetMessagePages());

      return { previousMessages };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData<MessagePages>(queryKey, context.previousMessages);
        return;
      }

      queryClient.removeQueries({
        queryKey,
      });
    },
    onSuccess: async () => {
      setOpen(false);
      setConfirmationValue("");

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: workspaceQueryKeys.server(serverId),
        }),
        queryClient.invalidateQueries({
          queryKey: workspaceQueryKeys.servers,
        }),
      ]);
    },
  });

  const closeModal = useCallback(() => {
    if (mutation.isPending) {
      return;
    }

    setOpen(false);
    setConfirmationValue("");
    mutation.reset();
  }, [mutation]);

  const openModal = () => {
    setConfirmationValue("");
    mutation.reset();
    setOpen(true);
  };

  return (
    <>
      <button
        className="inline-flex items-center gap-2 rounded-2xl border border-[hsl(var(--danger)/0.22)] bg-[hsl(var(--danger)/0.08)] px-3 py-2 text-xs font-semibold text-[hsl(var(--danger))] transition hover:bg-[hsl(var(--danger)/0.12)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--danger)/0.28)]"
        onClick={openModal}
        type="button"
      >
        <Trash2 className="h-3.5 w-3.5" />
        <span>{t("chat.channel.clearHistory")}</span>
      </button>

      <Modal
        description={t("chat.channel.clearHistoryDescription", {
          name: expectedConfirmationValue,
        })}
        onClose={closeModal}
        open={open}
        title={t("chat.channel.clearHistoryTitle")}
      >
        <div className="space-y-4">
          <div className="rounded-[1.375rem] border border-[hsl(var(--danger)/0.18)] bg-[hsl(var(--danger)/0.06)] p-4">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--danger))]">
              {t("chat.channel.clearHistory")}
            </p>
            <p
              className="mt-2 select-none text-sm text-app-foreground"
              onCopy={(event) => event.preventDefault()}
            >
              {expectedConfirmationValue}
            </p>
            <p className="mt-2 text-xs leading-6 text-app-muted">
              {t("chat.channel.clearHistoryHelp")}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">
              {t("chat.channel.clearHistoryConfirmLabel", {
                name: expectedConfirmationValue,
              })}
            </label>
            <Input
              autoComplete="off"
              autoCorrect="off"
              onCopy={(event) => event.preventDefault()}
              onChange={(event) => setConfirmationValue(event.target.value)}
              onCut={(event) => event.preventDefault()}
              onDrop={(event) => event.preventDefault()}
              onPaste={(event) => event.preventDefault()}
              placeholder={t("chat.channel.clearHistoryPlaceholder", {
                name: expectedConfirmationValue,
              })}
              spellCheck={false}
              value={confirmationValue}
            />
            <p className="text-xs text-app-muted">
              {t("chat.channel.clearHistoryInputHint", {
                name: expectedConfirmationValue,
              })}
            </p>
          </div>

          {mutation.error ? (
            <p className="text-sm text-app-danger">{mutation.error.message}</p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              disabled={mutation.isPending}
              onClick={closeModal}
              type="button"
              variant="outline"
            >
              {t("common.cancel")}
            </Button>
            <Button
              className="app-danger"
              disabled={!confirmationMatches || mutation.isPending}
              onClick={() => mutation.mutate()}
              type="button"
            >
              {mutation.isPending ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("chat.channel.clearHistoryClearing")}
                </span>
              ) : (
                t("chat.channel.clearHistoryAction")
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
