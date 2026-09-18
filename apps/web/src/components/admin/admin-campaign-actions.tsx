"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@wizards/ui";

type AdminCampaignActionsProps = {
  readonly canApprove: boolean;
  readonly canSend: boolean;
  readonly campaignId: string;
  readonly showApprove: boolean;
  readonly showSend: boolean;
};

async function runCampaignAction(campaignId: string, action: "approve" | "send") {
  const response = await fetch(
    `/api/v1/admin/notification-campaigns/${encodeURIComponent(campaignId)}/${action}`,
    { method: "POST" },
  );
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.error ?? "Campaign action failed.");
  }
}

export function AdminCampaignActions({
  canApprove,
  canSend,
  campaignId,
  showApprove,
  showSend,
}: AdminCampaignActionsProps) {
  const router = useRouter();
  const [pending, setPending] = useState<"approve" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: "approve" | "send") => {
    setPending(action);
    setError(null);
    try {
      await runCampaignAction(campaignId, action);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Campaign action failed.");
    } finally {
      setPending(null);
    }
  };

  if ((!canApprove || !showApprove) && (!canSend || !showSend)) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      {canApprove && showApprove ? (
        <Button disabled={pending !== null} onClick={() => void run("approve")} variant="outline">
          {pending === "approve" ? "Onaylanıyor…" : "Kampanyayı onayla"}
        </Button>
      ) : null}
      {canSend && showSend ? (
        <Button disabled={pending !== null} onClick={() => void run("send")}>
          {pending === "send" ? "Kuyruğa alınıyor…" : "Gönderimi başlat"}
        </Button>
      ) : null}
    </div>
  );
}
