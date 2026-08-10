"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ServerScheduledEvent, WorkspaceCategory, WorkspaceChannel } from "@wizards/types";
import { Button } from "@wizards/ui";

import { useI18n } from "@/components/providers/locale-provider";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  cancelServerEventRequest,
  createServerEventRequest,
  listServerEventsRequest,
  updateServerEventRequest,
  workspaceQueryKeys,
} from "@/lib/workspace/client";

type ServerEventsPanelProps = {
  canManage: boolean;
  categories: WorkspaceCategory[];
  serverId: string;
  ungroupedChannels: WorkspaceChannel[];
};

type EventDraft = {
  channelId: string;
  description: string;
  name: string;
  scheduledEndAt: string;
  scheduledStartAt: string;
};

const EMPTY_DRAFT: EventDraft = {
  channelId: "",
  description: "",
  name: "",
  scheduledEndAt: "",
  scheduledStartAt: "",
};

/** `datetime-local` has no zone; the API contract is ISO with one. */
function toIso(value: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function toLocalInputValue(iso: string | null): string {
  if (!iso) {
    return "";
  }

  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const offset = parsed.getTimezoneOffset() * 60_000;
  return new Date(parsed.getTime() - offset).toISOString().slice(0, 16);
}

function toDraft(event: ServerScheduledEvent): EventDraft {
  return {
    channelId: event.channelId ?? "",
    description: event.description ?? "",
    name: event.name,
    scheduledEndAt: toLocalInputValue(event.scheduledEndAt),
    scheduledStartAt: toLocalInputValue(event.scheduledStartAt),
  };
}

/**
 * The web admin surface for 6d events (Faz 1 §B7). The mobile create form
 * ships in Faz 5; both write the same `CreateServerScheduledEventSchema` body,
 * so nothing here invents a second contract.
 */
export function ServerEventsPanel({
  canManage,
  categories,
  serverId,
  ungroupedChannels,
}: ServerEventsPanelProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<EventDraft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);

  const voiceChannels = [
    ...categories.flatMap((category) => category.channels),
    ...ungroupedChannels,
  ].filter((channel) => channel.type === "VOICE");

  const eventsQuery = useQuery({
    queryFn: () => listServerEventsRequest(serverId),
    queryKey: workspaceQueryKeys.serverEvents(serverId),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.serverEvents(serverId) });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const startAt = toIso(draft.scheduledStartAt);
      const body = {
        ...(draft.channelId ? { channelId: draft.channelId } : { channelId: null }),
        description: draft.description.trim() ? draft.description.trim() : null,
        // A bound voice channel makes it a VOICE event; without one it is an
        // external gathering. `STAGE` is not offered: no surface creates one.
        entityType: draft.channelId ? ("VOICE" as const) : ("EXTERNAL" as const),
        name: draft.name.trim(),
        scheduledEndAt: toIso(draft.scheduledEndAt) ?? null,
      };

      if (editingId) {
        return updateServerEventRequest(serverId, editingId, {
          ...body,
          ...(startAt ? { scheduledStartAt: startAt } : {}),
        });
      }

      return createServerEventRequest(serverId, { ...body, scheduledStartAt: startAt ?? "" });
    },
    onSuccess: async () => {
      setDraft(EMPTY_DRAFT);
      setEditingId(null);
      await invalidate();
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (eventId: string) => cancelServerEventRequest(serverId, eventId),
    onSuccess: () => invalidate(),
  });

  const events = eventsQuery.data?.events ?? [];

  return (
    <div className="space-y-4" data-testid="server-events-panel">
      <div className="app-panel rounded-[28px] border p-4 sm:p-5">
        <p className="text-app-soft text-xs font-semibold uppercase tracking-[0.2em]">
          {t("serverSettings.events.title")}
        </p>
        <p className="mt-2 text-sm leading-6 text-app-muted">
          {t("serverSettings.events.description")}
        </p>

        {eventsQuery.isError ? (
          <p className="mt-4 text-sm text-[hsl(var(--danger))]" data-testid="server-events-error">
            {t("serverSettings.events.loadError")}
          </p>
        ) : null}

        <div className="mt-4 space-y-3">
          {!eventsQuery.isLoading && events.length === 0 ? (
            <p className="text-sm text-app-muted" data-testid="server-events-empty">
              {t("serverSettings.events.empty")}
            </p>
          ) : null}

          {events.map((event) => (
            <div
              className="flex flex-col gap-2 rounded-2xl border p-3 sm:flex-row sm:items-center sm:justify-between"
              data-testid={`server-event-${event.id}`}
              key={event.id}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{event.name}</p>
                <p className="mt-1 text-xs text-app-muted">
                  {new Date(event.scheduledStartAt).toLocaleString()}
                  {event.channelName ? ` · ${event.channelName}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge tone="muted">
                    {t("serverSettings.events.interested", { count: event.interestedCount })}
                  </Badge>
                  {event.status === "CANCELLED" ? (
                    <Badge tone="muted">{t("serverSettings.events.cancelled")}</Badge>
                  ) : null}
                </div>
              </div>

              {canManage && event.status !== "CANCELLED" ? (
                <div className="flex gap-2">
                  <Button
                    data-testid={`server-event-edit-${event.id}`}
                    onClick={() => {
                      setEditingId(event.id);
                      setDraft(toDraft(event));
                    }}
                    type="button"
                    variant="outline"
                  >
                    {t("serverSettings.events.edit")}
                  </Button>
                  <Button
                    data-testid={`server-event-cancel-${event.id}`}
                    disabled={cancelMutation.isPending}
                    onClick={() => cancelMutation.mutate(event.id)}
                    type="button"
                    variant="outline"
                  >
                    {t("serverSettings.events.cancel")}
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {canManage ? (
        <div className="app-panel rounded-[28px] border p-4 sm:p-5">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm">
              {t("serverSettings.events.name")}
              <Input
                className="mt-2"
                data-testid="server-event-name"
                maxLength={100}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                value={draft.name}
              />
            </label>
            <label className="text-sm">
              {t("serverSettings.events.channel")}
              <select
                className="app-panel mt-2 w-full rounded-2xl border px-3 py-2 text-sm"
                data-testid="server-event-channel"
                onChange={(event) => setDraft({ ...draft, channelId: event.target.value })}
                value={draft.channelId}
              >
                <option value="">{t("serverSettings.events.channelNone")}</option>
                {voiceChannels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              {t("serverSettings.events.startAt")}
              <Input
                className="mt-2"
                data-testid="server-event-start"
                onChange={(event) => setDraft({ ...draft, scheduledStartAt: event.target.value })}
                type="datetime-local"
                value={draft.scheduledStartAt}
              />
            </label>
            <label className="text-sm">
              {t("serverSettings.events.endAt")}
              <Input
                className="mt-2"
                data-testid="server-event-end"
                onChange={(event) => setDraft({ ...draft, scheduledEndAt: event.target.value })}
                type="datetime-local"
                value={draft.scheduledEndAt}
              />
            </label>
          </div>

          <label className="mt-3 block text-sm">
            {t("serverSettings.events.eventDescription")}
            <Textarea
              className="mt-2"
              data-testid="server-event-description"
              maxLength={1000}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              value={draft.description}
            />
          </label>

          <div className="mt-4 flex gap-2">
            <Button
              data-testid="server-event-save"
              disabled={
                saveMutation.isPending ||
                draft.name.trim().length === 0 ||
                draft.scheduledStartAt.length === 0
              }
              onClick={() => saveMutation.mutate()}
              type="button"
            >
              {editingId ? t("serverSettings.events.save") : t("serverSettings.events.create")}
            </Button>
            {editingId ? (
              <Button
                data-testid="server-event-abort-edit"
                onClick={() => {
                  setEditingId(null);
                  setDraft(EMPTY_DRAFT);
                }}
                type="button"
                variant="outline"
              >
                {t("serverSettings.events.cancel")}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
