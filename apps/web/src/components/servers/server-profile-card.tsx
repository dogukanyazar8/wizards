"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Check, Hash, Link2, Volume2 } from "lucide-react";
import {
  formatServerProfileCount,
  resolveServerProfileChannelBadge,
  resolveServerProfileFriendStack,
  resolveServerProfileJoinAction,
  type ServerPublicProfile,
  type ServerPublicProfileChannel,
} from "@wizards/types";
import { useI18n } from "@/components/providers/locale-provider";
import { Avatar } from "@/components/ui/avatar";
import { ServerProfileCardSkeleton } from "@/components/shell/shell-skeletons";
import {
  fetchServerPublicProfile,
  joinPublicServerRequest,
  ServerDiscoveryClientError,
  ServerProfileClientError,
  serverProfileQueryKeys,
} from "@/lib/servers/client";
import { resolveServerJoinErrorMessageKey } from "@/lib/servers/discovery-presentation";
import { workspaceQueryKeys } from "@/lib/workspace/client";

type ServerProfileCardProps = {
  serverId: string;
};

// design_handoff_whispr_hakkinda/Whispr Hakkında Ekranı.dc.html:540,543 — the
// server's own gradient art when it has not uploaded a banner/icon. Reused
// for both surfaces (the icon's radial focal point sits slightly higher, per
// the HTML's two separate radial-gradient stops).
export const FALLBACK_BANNER_STYLE = {
  backgroundImage:
    "radial-gradient(circle at 22% 26%, rgba(255,255,255,.3), transparent 42%), linear-gradient(145deg, #7C70FF, #5B62FF 46%, #2F6DFF)",
};
export const FALLBACK_ICON_STYLE = {
  backgroundImage:
    "radial-gradient(circle at 30% 18%, rgba(255,255,255,.34), transparent 34%), linear-gradient(145deg, #7C70FF, #5B62FF 46%, #2F6DFF)",
};

function ChannelRow({ channel }: { channel: ServerPublicProfileChannel }) {
  const badge = resolveServerProfileChannelBadge(channel);
  const Icon = channel.type === "voice" ? Volume2 : Hash;

  return (
    <li className="flex items-center gap-[11px] border-t border-[hsl(var(--border)/0.45)] px-4 py-3 first:border-t-0">
      <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-app-soft" />
      <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-app-foreground">
        {channel.name}
      </span>
      {badge?.kind === "read-only" ? (
        <span className="shrink-0 text-[10.5px] font-bold text-app-soft">{badge.label}</span>
      ) : null}
      {badge?.kind === "live" ? (
        <span className="shrink-0 rounded-[5px] bg-[hsl(var(--primary)/0.12)] px-[5px] py-0.5 text-[9px] font-extrabold tracking-[0.06em] text-[hsl(var(--primary))]">
          {badge.label}
        </span>
      ) : null}
      {badge?.kind === "live-count" ? (
        <span className="flex shrink-0 items-center gap-1.5">
          <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-emerald-400" />
          <span className="text-[11px] font-semibold text-[hsl(var(--success))]">
            {badge.label}
          </span>
        </span>
      ) : null}
    </li>
  );
}

function ServerProfileNotFound() {
  return (
    <div
      className="app-panel-soft mx-auto mt-8 w-full max-w-[420px] rounded-[24px] border p-6 text-center"
      data-testid="server-profile-not-found"
    >
      <p className="text-sm font-semibold text-app-foreground">Sunucu bulunamadı</p>
      <p className="mt-2 text-xs leading-5 text-app-muted">
        Bu sunucu yok ya da görüntüleme izniniz bulunmuyor.
      </p>
    </div>
  );
}

function ServerProfileError({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="app-panel-soft mx-auto mt-8 w-full max-w-[420px] rounded-[24px] border p-6 text-center"
      data-testid="server-profile-error"
    >
      <p className="text-sm font-semibold text-app-foreground">Sunucu profili yüklenemedi</p>
      <p className="mt-2 text-xs leading-5 text-app-muted">
        Bir şeyler ters gitti. Lütfen tekrar deneyin.
      </p>
      <button
        className="mt-4 inline-flex items-center justify-center rounded-2xl bg-[hsl(var(--primary))] px-4 py-2 text-xs font-semibold text-[hsl(var(--primary-foreground))] transition hover:opacity-90"
        onClick={onRetry}
        type="button"
      >
        Tekrar dene
      </button>
    </div>
  );
}

function ServerProfileCardContent({ profile }: { profile: ServerPublicProfile }) {
  const { t } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [linkCopied, setLinkCopied] = useState(false);
  const joinAction = resolveServerProfileJoinAction(profile.joined);
  const friendStack = resolveServerProfileFriendStack(
    profile.mutualFriends,
    profile.mutualFriendCount,
  );

  /**
   * S3 Bölüm B lands the real invite-free join mutation; S2 only routed a
   * non-member here to `/invite/{serverId}` as a placeholder (see
   * `resolveServerProfileJoinAction`'s own comment in
   * `server-profile-presentation.ts`). A member still gets the plain "go"
   * link -- no mutation involved, nothing to join.
   */
  const joinMutation = useMutation({
    mutationFn: () => joinPublicServerRequest(profile.serverId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: serverProfileQueryKeys.profile(profile.serverId),
      });
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.servers });
      router.push(`/channels/${profile.serverId}`);
    },
  });
  const joinErrorMessageKey = joinMutation.isError
    ? resolveServerJoinErrorMessageKey(
        joinMutation.error instanceof ServerDiscoveryClientError
          ? joinMutation.error.code
          : undefined,
      )
    : null;

  const handleCopyLink = async () => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Clipboard access can be denied by the browser; the button simply
      // stays in its normal state, no destructive fallback needed.
    }
  };

  return (
    <div className="mx-auto w-full max-w-[420px] space-y-4 pb-6" data-testid="server-profile-card">
      <div className="overflow-hidden rounded-[24px] border border-[hsl(var(--border)/0.6)] bg-[hsl(var(--surface-card))]">
        <div
          className="relative h-[92px] w-full"
          style={profile.bannerUrl ? undefined : FALLBACK_BANNER_STYLE}
        >
          {profile.bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt={`${profile.name} banner`}
              className="h-full w-full object-cover"
              src={profile.bannerUrl}
            />
          ) : null}
        </div>
        <div className="-mt-[26px] px-4 pb-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-[18px] border-[3px] border-[hsl(var(--surface-card))] bg-[hsl(var(--surface-card))] shadow-[0_6px_16px_rgba(30,34,53,0.14)]">
            {profile.iconUrl ? (
              <Avatar
                alt={profile.name}
                className="h-[50px] w-[50px] rounded-[14px]"
                fallback={profile.name}
                src={profile.iconUrl}
              />
            ) : (
              <div
                aria-hidden="true"
                className="h-[50px] w-[50px] rounded-[14px]"
                style={FALLBACK_ICON_STYLE}
              />
            )}
          </div>

          <div className="mt-3 flex items-center gap-[7px]">
            <h1 className="truncate text-[18px] font-extrabold tracking-[-0.01em] text-app-foreground">
              {profile.name}
            </h1>
            {profile.verified ? (
              <BadgeCheck
                aria-hidden="true"
                className="h-[15px] w-[15px] shrink-0 text-[hsl(var(--primary))]"
              />
            ) : null}
            {profile.verified ? <span className="sr-only">Doğrulanmış sunucu</span> : null}
          </div>

          <div className="mt-[9px] flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-emerald-400" />
              <span className="text-[11.5px] font-semibold text-app-muted">
                {formatServerProfileCount(profile.onlineCount, "tr")} çevrimiçi
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-slate-300" />
              <span className="text-[11.5px] font-semibold text-app-muted">
                {formatServerProfileCount(profile.memberCount, "tr")} üye
              </span>
            </span>
          </div>

          {profile.description ? (
            <p className="mt-[11px] text-[12.5px] font-medium leading-[1.5] text-app-muted">
              {profile.description}
            </p>
          ) : null}
        </div>
      </div>

      {profile.channels.length > 0 ? (
        <div>
          <p className="px-1 pb-2 text-[10.5px] font-bold tracking-[0.1em] text-app-soft">
            KANALLAR
          </p>
          <ul className="overflow-hidden rounded-[24px] border border-[hsl(var(--border)/0.6)] bg-[hsl(var(--surface-card))]">
            {profile.channels.map((channel) => (
              <ChannelRow channel={channel} key={channel.name} />
            ))}
          </ul>
        </div>
      ) : null}

      {friendStack ? (
        <div className="flex items-center gap-[11px] rounded-[20px] border border-[hsl(var(--border)/0.6)] bg-[hsl(var(--surface-card))] px-4 py-3">
          <div className="flex shrink-0" role="presentation">
            {friendStack.visible.map((friend, index) => (
              <Avatar
                alt={friend.displayName}
                className="h-7 w-7 border-2 border-[hsl(var(--surface-card))]"
                fallback={friend.displayName}
                key={friend.id}
                src={friend.avatarUrl}
                {...(index === 0 ? {} : { style: { marginLeft: -9 } })}
              />
            ))}
            {friendStack.overflowCount > 0 ? (
              <div
                aria-hidden="true"
                className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[hsl(var(--surface-card))] bg-[hsl(var(--surface-soft))] text-[9.5px] font-extrabold text-app-muted"
                style={{ marginLeft: -9 }}
              >
                +{friendStack.overflowCount}
              </div>
            ) : null}
          </div>
          <span className="flex-1 text-[11.5px] font-medium leading-[1.4] text-app-soft">
            {friendStack.caption}
          </span>
        </div>
      ) : null}

      {joinErrorMessageKey ? (
        <div
          className="app-danger rounded-[18px] border p-3"
          data-testid="server-profile-join-error"
        >
          <p className="text-xs font-semibold">{t(`${joinErrorMessageKey}.title`)}</p>
          <p className="mt-1 text-xs leading-5 text-app-muted">
            {t(`${joinErrorMessageKey}.description`)}
          </p>
        </div>
      ) : null}

      <div className="flex gap-[9px]">
        {joinAction.kind === "go" ? (
          <Link
            className="flex flex-1 items-center justify-center rounded-2xl bg-[hsl(var(--primary))] py-3.5 text-center text-sm font-extrabold text-[hsl(var(--primary-foreground))] shadow-[0_10px_24px_hsl(var(--primary)/0.24)] transition hover:opacity-95"
            data-testid="server-profile-primary-action"
            href={`/channels/${profile.serverId}`}
          >
            {joinAction.label}
          </Link>
        ) : (
          <button
            className="flex flex-1 items-center justify-center rounded-2xl bg-[hsl(var(--primary))] py-3.5 text-center text-sm font-extrabold text-[hsl(var(--primary-foreground))] shadow-[0_10px_24px_hsl(var(--primary)/0.24)] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            data-testid="server-profile-primary-action"
            disabled={joinMutation.isPending}
            onClick={() => joinMutation.mutate()}
            type="button"
          >
            {joinMutation.isPending ? t("discover.joining") : joinAction.label}
          </button>
        )}
        <button
          aria-label={linkCopied ? "Bağlantı kopyalandı" : "Bağlantıyı kopyala"}
          className="flex items-center justify-center rounded-2xl border border-[hsl(var(--border)/0.6)] bg-[hsl(var(--surface-card))] px-4 py-3.5 text-app-muted transition hover:bg-[hsl(var(--surface-soft)/0.6)]"
          onClick={() => {
            void handleCopyLink();
          }}
          type="button"
        >
          {linkCopied ? (
            <Check className="h-[18px] w-[18px]" />
          ) : (
            <Link2 className="h-[18px] w-[18px]" />
          )}
        </button>
      </div>
    </div>
  );
}

export function ServerProfileCard({ serverId }: ServerProfileCardProps) {
  const query = useQuery({
    queryFn: () => fetchServerPublicProfile(serverId),
    queryKey: serverProfileQueryKeys.profile(serverId),
    retry: (failureCount, error) =>
      !(error instanceof ServerProfileClientError && error.status === 404) && failureCount < 2,
  });

  return (
    <div className="h-full w-full overflow-y-auto px-4 py-6 md:px-6">
      {query.isPending ? <ServerProfileCardSkeleton /> : null}
      {query.isError &&
      query.error instanceof ServerProfileClientError &&
      query.error.status === 404 ? (
        <ServerProfileNotFound />
      ) : null}
      {query.isError &&
      !(query.error instanceof ServerProfileClientError && query.error.status === 404) ? (
        <ServerProfileError onRetry={() => void query.refetch()} />
      ) : null}
      {query.isSuccess ? <ServerProfileCardContent profile={query.data} /> : null}
    </div>
  );
}
