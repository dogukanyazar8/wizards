"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, CheckCircle2, Loader2, Send, Users } from "lucide-react";
import { Button } from "@wizards/ui";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatAdminInt } from "@/components/admin/format/admin-format";

type SegmentType =
  "ALL_USERS" | "ONLINE_USERS" | "RECENTLY_ACTIVE" | "CLIENT_TYPE" | "COUNTRY" | "USER_IDS";

type RequestState =
  { tone: "danger"; message: string } | { tone: "success"; message: string } | null;

type NotificationComposerProps = {
  canSend: boolean;
};

async function requestJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? "Request failed");
  }

  return payload as T;
}

function parseUserIds(value: string) {
  return value
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function NotificationComposer({ canSend }: NotificationComposerProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [actionUrl, setActionUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [segmentType, setSegmentType] = useState<SegmentType>("ALL_USERS");
  const [recentDays, setRecentDays] = useState("14");
  const [clientType, setClientType] = useState<"WEB" | "DESKTOP" | "MOBILE">("WEB");
  const [countryCode, setCountryCode] = useState("");
  const [userIds, setUserIds] = useState("");
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [state, setState] = useState<RequestState>(null);
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [awaitingApproval, setAwaitingApproval] = useState(false);

  const segment = useMemo(() => {
    switch (segmentType) {
      case "ONLINE_USERS":
        return { type: "ONLINE_USERS" };
      case "RECENTLY_ACTIVE":
        return {
          days: Math.min(Math.max(Number.parseInt(recentDays, 10) || 14, 1), 90),
          type: "RECENTLY_ACTIVE",
        };
      case "CLIENT_TYPE":
        return { clientType, type: "CLIENT_TYPE" };
      case "COUNTRY":
        return {
          countryCode: countryCode.trim().toUpperCase().slice(0, 2),
          type: "COUNTRY",
        };
      case "USER_IDS":
        return { type: "USER_IDS", userIds: parseUserIds(userIds) };
      default:
        return { type: "ALL_USERS" };
    }
  }, [clientType, countryCode, recentDays, segmentType, userIds]);

  const disabled = !canSend || sending || previewing;

  // A campaign over the approval threshold is created but not sent: a second
  // admin has to approve it, so the composer stops offering to send this draft.
  const editDraft = (apply: () => void) => {
    setAwaitingApproval(false);
    apply();
  };

  const preview = async () => {
    if (!canSend) {
      return;
    }

    setPreviewing(true);
    setState(null);

    try {
      const payload = await requestJson<{ recipientCount: number }>(
        "/api/v1/admin/notification-campaigns/preview",
        { segment },
      );
      setRecipientCount(payload.recipientCount);
      setState({
        message: `${formatAdminInt(payload.recipientCount)} recipient matched.`,
        tone: "success",
      });
    } catch (error) {
      setState({
        message: error instanceof Error ? error.message : "Preview failed.",
        tone: "danger",
      });
    } finally {
      setPreviewing(false);
    }
  };

  const send = async () => {
    if (!canSend) {
      return;
    }

    setSending(true);
    setState(null);

    try {
      const payload = await requestJson<{
        campaign: { sentCount?: number; status?: string; title?: string };
      }>("/api/v1/admin/notification-campaigns", {
        actionUrl,
        body,
        imageUrl,
        segment,
        sendNow: true,
        title,
        type: "SYSTEM",
      });

      if (payload.campaign.status === "PENDING_APPROVAL") {
        setAwaitingApproval(true);
        setState({
          message: "This audience needs a second admin to approve the campaign before it is sent.",
          tone: "danger",
        });
        router.refresh();
        return;
      }

      setTitle("");
      setBody("");
      setActionUrl("");
      setImageUrl("");
      setAwaitingApproval(false);
      setRecipientCount(payload.campaign.sentCount ?? null);
      setState({
        message: `${formatAdminInt(payload.campaign.sentCount ?? 0)} notification sent.`,
        tone: "success",
      });
      router.refresh();
    } catch (error) {
      setState({
        message: error instanceof Error ? error.message : "Notification could not be sent.",
        tone: "danger",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="app-panel min-w-0 overflow-hidden rounded-[28px] border p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="app-panel-soft flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-[hsl(var(--primary))]">
            <BellRing className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-app-foreground text-xl font-semibold">Broadcast Notification</h2>
            <p className="text-app-muted mt-1 text-sm leading-6">
              Compose a system notification and send it to a controlled audience.
            </p>
          </div>
        </div>
        <span className="app-panel-soft inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm text-app-muted">
          <Users className="h-4 w-4" />
          {recipientCount === null ? "No preview" : `${formatAdminInt(recipientCount)} users`}
        </span>
      </div>

      <div className={cn("mt-5 grid gap-4", !canSend && "opacity-60")}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.45fr)]">
          <Input
            disabled={!canSend}
            maxLength={140}
            onChange={(event) => editDraft(() => setTitle(event.target.value))}
            placeholder="Title"
            value={title}
          />
          <select
            className="app-input h-11 w-full rounded-2xl border px-4 text-sm outline-hidden"
            disabled={!canSend}
            onChange={(event) => editDraft(() => setSegmentType(event.target.value as SegmentType))}
            value={segmentType}
          >
            <option value="ALL_USERS">All users</option>
            <option value="ONLINE_USERS">Online users</option>
            <option value="RECENTLY_ACTIVE">Recently active</option>
            <option value="CLIENT_TYPE">Client type</option>
            <option value="COUNTRY">Country</option>
            <option value="USER_IDS">Specific users</option>
          </select>
        </div>

        <Textarea
          disabled={!canSend}
          maxLength={800}
          onChange={(event) => editDraft(() => setBody(event.target.value))}
          placeholder="Message"
          value={body}
        />

        <div className="grid gap-4 lg:grid-cols-2">
          <Input
            disabled={!canSend}
            onChange={(event) => setActionUrl(event.target.value)}
            placeholder="Action URL"
            value={actionUrl}
          />
          <Input
            disabled={!canSend}
            onChange={(event) => setImageUrl(event.target.value)}
            placeholder="Image URL"
            value={imageUrl}
          />
        </div>

        {segmentType === "RECENTLY_ACTIVE" ? (
          <Input
            disabled={!canSend}
            max="90"
            min="1"
            onChange={(event) => setRecentDays(event.target.value)}
            placeholder="Days"
            type="number"
            value={recentDays}
          />
        ) : null}

        {segmentType === "CLIENT_TYPE" ? (
          <select
            className="app-input h-11 w-full rounded-2xl border px-4 text-sm outline-hidden"
            disabled={!canSend}
            onChange={(event) => setClientType(event.target.value as "WEB" | "DESKTOP" | "MOBILE")}
            value={clientType}
          >
            <option value="WEB">Web</option>
            <option value="DESKTOP">Desktop</option>
            <option value="MOBILE">Mobile</option>
          </select>
        ) : null}

        {segmentType === "COUNTRY" ? (
          <Input
            disabled={!canSend}
            maxLength={2}
            onChange={(event) => setCountryCode(event.target.value)}
            placeholder="Country code"
            value={countryCode}
          />
        ) : null}

        {segmentType === "USER_IDS" ? (
          <Textarea
            disabled={!canSend}
            onChange={(event) => setUserIds(event.target.value)}
            placeholder="User IDs separated by comma, space or new line"
            value={userIds}
          />
        ) : null}
      </div>

      {state ? (
        <div
          className={cn(
            "mt-4 flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm",
            state.tone === "success"
              ? "border-[hsl(var(--success)/0.22)] bg-[hsl(var(--success)/0.12)] text-app-success"
              : "border-[hsl(var(--danger)/0.26)] bg-[hsl(var(--danger)/0.12)] text-app-danger",
          )}
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{state.message}</span>
        </div>
      ) : null}

      {/* Only the in-app channel exists. Push and email are drawn disabled so
          the composer never implies a delivery path the platform does not have. */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span className="rounded-[12px] bg-[hsl(var(--primary))] px-3 py-[7px] text-[12.5px] font-semibold text-[hsl(var(--primary-foreground))]">
          Uygulama içi
        </span>
        <span
          className="text-app-soft cursor-not-allowed rounded-[12px] border border-[hsl(var(--border)/0.7)] px-3 py-[7px] text-[12.5px] font-semibold opacity-60"
          title="Kampanya push göndermiyor; bildirim uygulama içinde görünür."
        >
          Push
        </span>
        <span
          className="text-app-soft cursor-not-allowed rounded-[12px] border border-[hsl(var(--border)/0.7)] px-3 py-[7px] text-[12.5px] font-semibold opacity-60"
          title="E-posta kanalı yok."
        >
          E-posta
        </span>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
        <Button disabled={disabled} onClick={preview} type="button" variant="outline">
          {previewing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Users className="mr-2 h-4 w-4" />
          )}
          Preview
        </Button>
        <Button
          disabled={disabled || awaitingApproval || !title.trim() || !body.trim()}
          onClick={send}
          type="button"
        >
          {sending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-2 h-4 w-4" />
          )}
          {awaitingApproval ? "Onaya Gönder" : "Send now"}
        </Button>
      </div>
    </section>
  );
}
