"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ConnectionQuality, RoomEvent, type Participant } from "livekit-client";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/components/providers/locale-provider";
import { useVoiceParticipants, useVoiceState } from "@/components/providers/voice-provider";
import { getSocket } from "@/lib/socket/client";
import {
  ParticipantCameraVideo,
  ScreenShareVideo,
  isReconnectState,
  renderGridParticipants,
} from "@/components/voice/room/voice-room-primitives";
import { useRightPanelVisibility } from "@/hooks/use-right-panel-visibility";
import {
  ServerScreenShareStage,
  ServerScreenShareStripCard,
  ServerVoiceControls,
  ServerVoiceEmptyState,
  ServerVoiceGrid,
  ServerVoiceHeader,
  ServerVoiceTile,
} from "@/components/voice/server/server-voice-surface";
import {
  findWorkspaceChannel,
  resolveChannelCategoryName,
} from "@/lib/servers/channel-access-count";
import {
  orderVoiceParticipants,
  selectVoiceLatencyTierFromQuality,
  selectVoiceSubtitle,
} from "@/lib/servers/voice-presentation";
import {
  setServerRightPanelContent,
  useServerRightPanelContent,
} from "@/lib/servers/right-panel-store";
import {
  SCREEN_SHARE_QUALITY_OPTIONS,
  getScreenShareQualityPreset,
} from "@/lib/voice/screen-share";
import { buildSettingsHref } from "@/lib/settings/navigation";
import { fetchWorkspaceServer, workspaceQueryKeys } from "@/lib/workspace/client";

type VoiceChannelViewProps = {
  channelId: string;
  serverId: string;
};

function getSidebarInviteErrorMessage(t: ReturnType<typeof useI18n>["t"], code: string) {
  if (code === "VOICE_INVITE_TARGET_FORBIDDEN") {
    return t("voice.invite.targetPermissionDenied");
  }
  if (code === "VOICE_INVITE_FORBIDDEN") {
    return t("voice.invite.permissionDenied");
  }
  if (code === "VOICE_INVITE_TARGET_OFFLINE") {
    return t("voice.invite.offline");
  }
  if (code === "VOICE_INVITE_TARGET_ALREADY_JOINED") {
    return t("voice.invite.alreadyJoined");
  }
  if (code === "VOICE_INVITE_RATE_LIMITED") {
    return t("voice.invite.rateLimited");
  }
  return t("voice.invite.unavailable");
}

export function VoiceChannelView(props: VoiceChannelViewProps) {
  return <VoiceChannelViewContent {...props} key={`${props.serverId}:${props.channelId}`} />;
}

function VoiceChannelViewContent({ channelId, serverId }: VoiceChannelViewProps) {
  const { t } = useI18n();
  const router = useRouter();
  const {
    activeChannelId,
    activeScreenShareId,
    cameraError,
    cameraStatus,
    connectionState,
    errorMessage,
    getParticipantVolume,
    isCameraEnabled,
    isApplyingScreenShareQuality,
    isDeafened,
    isJoining,
    isKrispNoiseCancellationActive,
    isMuted,
    isScreenSharing,
    joinChannel,
    leaveChannel,
    resetParticipantVolume,
    room,
    setParticipantVolume,
    setScreenShareQuality,
    screenShareQuality,
    toggleCamera,
    toggleDeafen,
    toggleMute,
    toggleScreenShare,
  } = useVoiceState();
  const { participants, screenShares } = useVoiceParticipants();
  const [inviteError, setInviteError] = useState<string | null>(null);
  /**
   * §5.1 — `N dakikadır bağlı`. Sağlayıcı bir "bağlandı" damgası taşımıyor ve K5 gereği
   * `lib/voice/*` bu şeritte değişmiyor; damga burada, **sunum** katmanında tutuluyor.
   * Dakika alanı olduğu için saniyede bir değil, otuz saniyede bir tazeleniyor.
   */
  /**
   * `{ connectedAtMs, nowMs }` **tek** durumda: ikisi ayrı olsaydı ilk tikte biri yazılıp
   * diğeri bir kare geç yazılabilir ve süre bir kare boyunca yanlış çıkardı. İkisi de
   * geri çağrıdan yazılır — efekt gövdesinde `setState` zincirleme render üretir.
   */
  const [connectionClock, setConnectionClock] = useState<{
    connectedAtMs: number;
    nowMs: number;
  } | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [reportedConnectionQuality, setReportedConnectionQuality] = useState(
    ConnectionQuality.Unknown,
  );
  const joinChannelRef = useRef(joinChannel);

  useEffect(() => {
    joinChannelRef.current = joinChannel;
  }, [joinChannel]);

  useEffect(() => {
    if (!room) {
      return;
    }

    const handleConnectionQualityChanged = (
      quality: ConnectionQuality,
      participant: Participant,
    ) => {
      if (
        participant === room.localParticipant ||
        participant.identity === room.localParticipant.identity
      ) {
        setReportedConnectionQuality(quality);
      }
    };

    room.on(RoomEvent.ConnectionQualityChanged, handleConnectionQualityChanged);

    return () => {
      room.off(RoomEvent.ConnectionQualityChanged, handleConnectionQualityChanged);
    };
  }, [room]);

  useEffect(() => {
    void joinChannelRef.current({ channelId, serverId }).catch(() => {
      // The provider exposes the error message for inline rendering.
    });
  }, [channelId, serverId]);

  useEffect(() => {
    if (!room) {
      return;
    }

    const connectedAtMs = Date.now();
    const tick = () => setConnectionClock({ connectedAtMs, nowMs: Date.now() });

    // İlk tik bir **geri çağrıda**: efekt gövdesinde `setState` çağırmak zincirleme render
    // üretir (`react-hooks/set-state-in-effect`). Alan dakika olduğu için 30 sn yeter.
    const firstTick = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 30_000);

    return () => {
      window.clearTimeout(firstTick);
      window.clearInterval(timer);
    };
  }, [room]);

  useEffect(() => {
    if (!inviteError) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setInviteError(null);
    }, 5_000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [inviteError]);

  /*
    §5.2 — konuşan öne alınır ama sıra **kararlı** kalır. `renderGridParticipants` LiveKit
    tarafının sırasıdır (K5, dokunulmadı); `orderVoiceParticipants` onun üstüne yalnız
    "sen ve konuşanlar önde" kuralını koyar.
  */
  const orderedParticipants = useMemo(
    () => orderVoiceParticipants(renderGridParticipants(room, participants)),
    [participants, room],
  );

  /* §5.1 — kanal adı ve kategori çipi. Sorgu kabuğun zaten doldurduğu önbelleği paylaşıyor. */
  const serverDetailQuery = useQuery({
    enabled: Boolean(serverId),
    queryFn: () => fetchWorkspaceServer(serverId),
    queryKey: workspaceQueryKeys.server(serverId),
    staleTime: 30_000,
  });
  const activeChannelRecord = findWorkspaceChannel(serverDetailQuery.data ?? null, channelId);
  const channelName = activeChannelRecord?.name ?? t("voice.view.title");
  const categoryName = resolveChannelCategoryName(serverDetailQuery.data ?? null, channelId);

  /** §5.2 — `Sunucu` (primary) ve `Yönetici` (danger) rozetleri üyelik seviyesinden. */
  const roleBadges = useMemo(() => {
    const map = new Map<string, "admin" | "owner">();

    for (const member of serverDetailQuery.data?.members ?? []) {
      if (member.accessLevel === "OWNER") {
        map.set(member.userId, "owner");
      } else if (member.accessLevel === "ADMIN") {
        map.set(member.userId, "admin");
      }
    }

    return map;
  }, [serverDetailQuery.data?.members]);

  /** `ConnectionQuality` iki yerden gelebilir: canlı olay ve odanın anlık değeri. */
  const localConnectionQuality = room
    ? (room.localParticipant.connectionQuality ?? reportedConnectionQuality)
    : ConnectionQuality.Unknown;

  const rightPanelContent = useServerRightPanelContent();
  const rightPanel = useRightPanelVisibility();
  const isMembersPanelOpen = rightPanel.isOpen && rightPanelContent === "members";
  const openMembersPanel = useCallback(() => {
    // Düğme bir anahtardır: açıksa kapatır. Katman kipinde (§11) hangi bayrağın çevrileceğini
    // kanca bilir — ses ekranı da metin kanalıyla aynı kuralı okur.
    rightPanel.setOpen(!isMembersPanelOpen);
    setServerRightPanelContent("members");
  }, [isMembersPanelOpen, rightPanel]);

  const toggleStageFullscreen = useCallback(() => {
    const element = stageRef.current;

    if (!element || typeof document === "undefined") {
      return;
    }

    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }

    void element.requestFullscreen?.().catch(() => undefined);
  }, []);
  const showReconnectOverlay = isReconnectState(connectionState);
  const participantCount = orderedParticipants.length;
  const activeScreenShare =
    screenShares.find((share) => share.id === activeScreenShareId) ?? screenShares[0] ?? null;
  const cameraParticipants = useMemo(
    () =>
      orderedParticipants.filter(
        (participant) => participant.isCameraEnabled && participant.cameraTrack,
      ),
    [orderedParticipants],
  );
  const activeCameraParticipant =
    cameraParticipants.find((participant) => participant.isLocal) ?? cameraParticipants[0] ?? null;
  useEffect(() => {
    const socket = getSocket();

    /*
      Ş7. Davet **gönderimi** artık sağ panelin işi (Ş5 · SPEC §4.2) ve iyimser yazılıyor;
      geriye kalan tek sorumluluk hatanın görünmesi. Dinleyici burada duruyor çünkü hata
      kanala aittir: kullanıcı hangi kanalda davet gönderdiyse hatayı orada görmeli. Kod →
      cümle eşlemesi değişmedi (`getSidebarInviteErrorMessage`).
    */
    const handleInviteError = (error: { channelId?: string; code: string }) => {
      if (error.channelId && error.channelId !== channelId) {
        return;
      }

      setInviteError(getSidebarInviteErrorMessage(t, error.code));
    };

    socket.on("voice:invite:error", handleInviteError);

    return () => {
      socket.off("voice:invite:error", handleInviteError);
    };
  }, [channelId, t]);

  if (isJoining && !errorMessage) {
    return (
      <div
        className="flex h-full items-center justify-center bg-transparent"
        data-testid="voice-connecting-state"
      >
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-app-muted" />
          <p className="mt-3 text-sm font-medium text-app-foreground">
            {t("voice.view.connecting")}
          </p>
        </div>
      </div>
    );
  }

  if (!room && !errorMessage && activeChannelId !== channelId) {
    return (
      <div
        className="flex h-full items-center justify-center bg-transparent p-6"
        data-testid="voice-disconnected-state"
      >
        <div className="app-panel max-w-md rounded-[28px] border p-8 text-center">
          <p className="text-base font-semibold text-app-foreground">
            {t("voice.view.disconnectedTitle")}
          </p>
          <p className="mt-2 text-sm text-app-muted">{t("voice.view.disconnectedDescription")}</p>
          <button
            className="mt-5 rounded-2xl border border-[hsl(var(--primary)/0.32)] bg-[hsl(var(--primary)/0.14)] px-4 py-2 text-sm font-semibold text-app-foreground transition hover:opacity-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            onClick={() => {
              void joinChannel({ channelId, serverId }).catch(() => {
                // The provider exposes the error message for inline rendering.
              });
            }}
            type="button"
          >
            {t("voice.view.reconnectAction")}
          </button>
        </div>
      </div>
    );
  }

  if (errorMessage && !room && activeChannelId !== channelId) {
    return (
      <div
        className="flex h-full items-center justify-center bg-transparent"
        data-testid="voice-error-state"
      >
        <div className="max-w-md text-center">
          <p className="text-base font-semibold text-app-foreground">
            {t("voice.view.errorTitle")}
          </p>
          <p className="mt-2 text-sm text-app-muted">{errorMessage}</p>
        </div>
      </div>
    );
  }

  /*
    §5.1 — Krisp çipi gerçek durumdan (`krisp-quality.ts`); "kontrol ediliyor" ara durumu
    SPEC'te yok, çip o an **kapalı** yazar ve durum netleşince kendiliğinden düzelir.
  */
  /*
    §5.1 gecikme çipi. Sözcük **gerçek** veriden: LiveKit'in `ConnectionQuality`si. Sayı
    (`32 ms`) yok — TODO(api), odanın RTT'sini veren bir alan yok (Ş4 TODO 1) ve
    `ConnectionQuality` bir sınıf, milisaniye değil. Sayı geldiği gün `ms` dolar; çip
    bugün yalnız sözcüğü yazar, uydurmaz.
  */
  const latencyTier = selectVoiceLatencyTierFromQuality(localConnectionQuality);
  const latency = latencyTier ? { ms: null, tier: latencyTier } : null;

  /*
    §5.3 — `1080p · 30 fps` çipi. Çözünürlük seçilen kalite ön ayarından geliyor
    (`SCREEN_SHARE_QUALITY_OPTIONS`, `screen-share.ts` — dokunulmadı); fps aynı ön ayarın
    kare hızıdır. Gerçek yayın çözünürlüğünü veren bir alan yok, o yüzden yazan şey
    "seçilen kalite", "ölçülen kalite" değil.
  */
  const shareQualityOption =
    SCREEN_SHARE_QUALITY_OPTIONS.find((option) => option.id === screenShareQuality) ?? null;
  const shareResolutionLabel = shareQualityOption?.shortLabel ?? null;
  const shareFps = shareQualityOption
    ? (getScreenShareQualityPreset(shareQualityOption.id).encoding.maxFramerate ?? null)
    : null;

  const krispChipLabel = isKrispNoiseCancellationActive
    ? t("server.voice.header.krispActive")
    : t("server.voice.header.krispInactive");

  // Oda yokken ya da saat ilk tikini atmadan süre yazılmaz: ölçüm yokluğu bir süre değildir.
  const clock = room ? connectionClock : null;
  const subtitle = selectVoiceSubtitle({
    cameraCount: cameraParticipants.length,
    connectedAtMs: clock?.connectedAtMs ?? null,
    nowMs: clock?.nowMs ?? 0,
    participantCount,
    sharerName: activeScreenShare
      ? (activeScreenShare.displayName ?? activeScreenShare.username)
      : null,
  });

  return (
    <div
      className="relative flex h-full min-h-0 flex-col overflow-hidden bg-transparent"
      data-testid="voice-channel-view"
    >
      {showReconnectOverlay ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[hsl(var(--background)/0.75)] backdrop-blur-xs">
          <div className="app-panel rounded-[28px] border px-6 py-5 text-center shadow-[0_18px_50px_hsl(var(--shadow-color)/0.14)]">
            <Loader2 className="mx-auto h-7 w-7 animate-spin text-app-muted" />
            <p className="mt-3 text-sm font-semibold text-app-foreground">
              {t("voice.view.reconnecting")}
            </p>
          </div>
        </div>
      ) : null}

      {/* §5.1 — hoparlör ikonu, ad, kategori çipi, durum satırı, Krisp + gecikme çipleri. */}
      <ServerVoiceHeader
        categoryName={categoryName}
        channelName={channelName}
        krispActive={isKrispNoiseCancellationActive}
        krispLabel={krispChipLabel}
        latency={latency}
        membersActive={isMembersPanelOpen}
        onOpenMembers={openMembersPanel}
        subtitle={subtitle}
      />

      {errorMessage || cameraError || inviteError ? (
        <div
          className="mx-5 mt-3 rounded-[1.5rem] border border-[hsl(var(--warning)/0.24)] bg-[hsl(var(--warning)/0.08)] px-4 py-3"
          data-testid="voice-inline-error"
        >
          <p className="text-sm font-medium text-app-foreground">
            {errorMessage ?? cameraError ?? inviteError}
          </p>
        </div>
      ) : null}

      {screenShares.length > 0 ? (
        /* §5.3 — tek büyük sahne + altında yatay katılımcı şeridi. */
        <ServerScreenShareStage
          cameraName={
            activeCameraParticipant
              ? (activeCameraParticipant.displayName ?? activeCameraParticipant.username)
              : undefined
          }
          cameraSlot={
            activeCameraParticipant?.cameraTrack ? (
              <ParticipantCameraVideo
                isLocal={activeCameraParticipant.isLocal}
                sizeClass="thumbnail"
                track={activeCameraParticipant.cameraTrack}
              />
            ) : null
          }
          fps={shareFps}
          onToggleFullscreen={toggleStageFullscreen}
          qualityControl={
            activeScreenShare?.isLocal
              ? {
                  disabled: isApplyingScreenShareQuality,
                  onChange: (qualityId) => {
                    void setScreenShareQuality(qualityId as typeof screenShareQuality);
                  },
                  options: SCREEN_SHARE_QUALITY_OPTIONS.map((option) => ({
                    id: option.id,
                    label: t(option.labelKey),
                  })),
                  selectedId: screenShareQuality,
                }
              : undefined
          }
          resolutionLabel={shareResolutionLabel}
          sharerAvatarUrl={activeScreenShare?.avatarUrl ?? null}
          sharerName={
            activeScreenShare?.displayName ??
            activeScreenShare?.username ??
            t("voice.screenShare.unknownSharer")
          }
          stageRef={stageRef}
          strip={orderedParticipants.map((participant) => (
            <ServerScreenShareStripCard key={participant.userId} participant={participant} />
          ))}
          videoSlot={
            activeScreenShare?.track ? <ScreenShareVideo track={activeScreenShare.track} /> : null
          }
        />
      ) : participantCount > 0 ? (
        /* §5.2 — katılımcı ızgarası; kolon sayısı `selectVoiceGridColumns`ten. */
        <ServerVoiceGrid participantCount={participantCount}>
          {orderedParticipants.map((participant) => (
            <ServerVoiceTile
              {...(participant.isLocal
                ? {}
                : {
                    volume: {
                      onReset: () => resetParticipantVolume(participant.userId),
                      onSet: (value: number) => setParticipantVolume(participant.userId, value),
                      value: getParticipantVolume(participant.userId),
                    },
                  })}
              cameraSlot={
                participant.isCameraEnabled && participant.cameraTrack ? (
                  <ParticipantCameraVideo
                    isLocal={participant.isLocal}
                    track={participant.cameraTrack}
                  />
                ) : null
              }
              key={participant.userId}
              participant={participant}
              roleBadge={roleBadges.get(participant.userId) ?? null}
            />
          ))}
        </ServerVoiceGrid>
      ) : (
        <ServerVoiceEmptyState />
      )}

      {/* §5.4 — dört düğme + ayarlar + Ayrıl. */}
      <ServerVoiceControls
        cameraBusy={cameraStatus === "starting" || cameraStatus === "stopping"}
        isCameraEnabled={isCameraEnabled}
        isDeafened={isDeafened}
        isMuted={isMuted}
        isScreenSharing={isScreenSharing}
        onLeave={() => {
          void leaveChannel();
        }}
        onOpenSettings={() => router.push(buildSettingsHref("av", "audio"))}
        onToggleCamera={() => {
          void toggleCamera();
        }}
        onToggleDeafen={() => {
          void toggleDeafen();
        }}
        onToggleMute={() => {
          void toggleMute();
        }}
        onToggleScreenShare={() => {
          void toggleScreenShare();
        }}
      />
    </div>
  );
}
