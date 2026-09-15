"use client";

import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { QueryClientContext, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  Edit3,
  Hash,
  Headphones,
  Mic,
  Plus,
  SlidersHorizontal,
  Trash2,
  UserPlus,
  Volume2,
} from "lucide-react";
import { Button } from "@wizards/ui";
import type { WorkspaceChannel, WorkspaceServerDetail } from "@wizards/types";
import { useShallow } from "zustand/react/shallow";
import { Avatar } from "@/components/ui/avatar";
import { useI18n } from "@/components/providers/locale-provider";
import { useSocket } from "@/hooks/use-socket";
import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import { Modal } from "@/components/ui/modal";
import { ChannelItem } from "@/components/shell/channel-item";
import {
  ChannelSearchPopover,
  ChannelSearchTrigger,
  type ChannelSearchHit,
} from "@/components/shell/channel-search-popover";
import { ServerMenu, type ServerMenuRowKey } from "@/components/shell/server-menu";
import { VoiceChannelItem } from "@/components/shell/voice-activity";
import { ChannelSidebarSkeleton } from "@/components/shell/shell-skeletons";
import { UserBarMenu, useSettingsShortcut } from "@/components/shell/user-bar-menu";
import { useOptionalFocusControls } from "@/components/providers/focus-controls-provider";
import { useVoiceState } from "@/components/providers/voice-provider";
import { hairline, HOME_METRICS, HOME_TYPE_SCALE, pxToRem } from "@/lib/home/metrics";
import { DISPLAY_FONT, DISPLAY_TRACKING } from "@/components/servers/shared/typography";
import {
  countHiddenInCollapsedCategory,
  filterCollapsedCategoryChannels,
} from "@/lib/servers/channel-visibility";
import { SERVER_METRICS } from "@/lib/servers/metrics";
import { SERVER_INVITE_DEFAULT_DURATION_ID } from "@/lib/servers/invite-form";
import { getServerIconToneColor } from "@/lib/servers/server-icon-tone";
import { resolveServerIconPresentation } from "@/lib/servers/server-icon-presentation";
import { useLayerStack } from "@/lib/servers/use-layer-stack";
import { resolveViewerPermissions, viewerCan } from "@/lib/servers/viewer-permissions";
import { cn } from "@/lib/utils";
import {
  applyCategoryReorder,
  applyChannelReorder,
  deleteCategoryRequest,
  reorderCategoriesRequest,
  reorderChannelsRequest,
  workspaceQueryKeys,
} from "@/lib/workspace/client";
import { useVoiceStates } from "@/hooks/use-voice-states";
import { useAppStore } from "@/lib/store";
import { updatePresenceDndAction, updatePresenceStatusAction } from "@/lib/account/actions";
import { logoutAction } from "@/lib/auth/actions";
import { homeQueryKeys } from "@/lib/home/client";
import {
  DEFAULT_DND_DURATION,
  resolveStatusMenuDndDuration,
  selectDndDuration,
  type DndDuration,
} from "@/lib/presence/dnd";
import { SETTINGS_METRICS } from "@/lib/settings/metrics";
import {
  resolveUserBarMenuPlacement,
  USER_BAR_MENU_MAX_HEIGHT,
  type UserBarMenuPlacement,
} from "@/lib/shell/user-bar-menu-placement";
import type { VoiceChannelStateDTO } from "@/lib/voice/types";

type PresenceStatus = "ONLINE" | "IDLE" | "DND" | "OFFLINE";

type ChannelSidebarProps = {
  activeChannelId: string | null;
  currentUser: {
    id: string;
    avatarUrl?: string | null;
    displayName: string;
    status: PresenceStatus;
    username: string;
  };
  detail: WorkspaceServerDetail | null;
  loading: boolean;
  onNavigate: (href: string) => void;
  onCurrentUserStatusChange: (status: PresenceStatus) => void;
  /**
   * Sunucu menüsünün `Sunucudan ayrıl` satırı. Kabuğun **mevcut** onay penceresini ve
   * `leaveServerRequest` mutation'ını tetikler; kenar çubuğu ikinci bir ayrılma yolu açmaz.
   */
  onLeaveServer?: (() => void) | undefined;
  onOpenSettings: () => void;
  onPrefetch?: (href: string) => void;
  showUserFooter?: boolean;
};

type SortableChannelRowProps = {
  active: boolean;
  canManage: boolean;
  channel: WorkspaceChannel;
  currentUserId: string;
  /** Satırın sağ tık menüsü — düzenle/sil buradan açılır, satırda kaplama düğme yok. */
  onContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onPrefetch?: () => void;
  onSelect: () => void;
  testId?: string;
  voiceState?: VoiceChannelStateDTO | null;
};

type SortableCategoryGroupProps = {
  canManage: boolean;
  categoryId: string;
  children: (
    sortable: Pick<ReturnType<typeof useSortable>, "attributes" | "isDragging" | "listeners">,
  ) => React.ReactNode;
};

type CategorySortableHandle = Pick<
  ReturnType<typeof useSortable>,
  "attributes" | "isDragging" | "listeners"
>;

type ChannelDropZoneProps = {
  canManage: boolean;
  categoryId: string | null;
  children: React.ReactNode;
  empty: boolean;
  emptyLabel: string;
};

/**
 * Kenar çubuğunun zemini ve sağ kenarı — referans satır 1:
 * `background:hsl(var(--surface-panel));border-right:1px solid hsl(var(--border)/.4)`.
 *
 * Eskiden burada bir degrade vardı **ve** kabuk sütunu ikinci bir degrade + kenar çiziyordu;
 * iki katman üst üste binince zemin hiçbir temada referansın rengi olmuyordu. Kolon artık tek
 * yerden boyanıyor: kabuk sütunu şeffaf, `aside` opak.
 */
const SIDEBAR_SURFACE_STYLE: CSSProperties = {
  background: "hsl(var(--surface-panel))",
  borderRight: `${hairline(SERVER_METRICS.layout.columnBorderWidth)} solid hsl(var(--border) / ${SERVER_METRICS.layout.sidebarBorderAlpha})`,
};

const OPEN_CHANNEL_GROUP_KEY = "open-channels-group";

type SidebarDisplayGroup =
  | {
      category: WorkspaceServerDetail["categories"][number];
      key: string;
      type: "category";
    }
  | {
      key: typeof OPEN_CHANNEL_GROUP_KEY;
      type: "open";
    };

const SortableChannelRow = React.memo(function SortableChannelRow({
  active,
  canManage,
  channel,
  currentUserId,
  onContextMenu,
  onPrefetch,
  onSelect,
  testId,
  voiceState = null,
}: SortableChannelRowProps) {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    disabled: !canManage,
    id: channel.id,
    data: { categoryId: channel.categoryId ?? null, itemType: "channel" },
  });
  const verticalTransform = transform ? { ...transform, x: 0 } : null;
  /*
    Referansın satırında **tutamak yok** (§2.4): satırın kendisi sürükleniyor. `PointerSensor`
    4 px eşiğinde olduğu için tıklama ile sürükleme birbirine karışmıyor ve satır yöneticide
    de üyede de aynı `7px 9px` geometrisinde kalıyor. dnd kablolaması değişmedi; yalnız
    `attributes`/`listeners`'ın gittiği düğüm değişti.
  */
  const Item = channel.type === "VOICE" ? VoiceChannelItem : ChannelItem;

  return (
    <div
      ref={setNodeRef}
      className="min-w-0"
      onContextMenu={onContextMenu}
      style={{
        opacity: isDragging ? 0.75 : 1,
        transform: verticalTransform ? CSS.Transform.toString(verticalTransform) : undefined,
        transition,
      }}
    >
      <Item
        active={active}
        canAccess={channel.canAccess}
        currentUserId={currentUserId}
        mentionCount={channel.mentionCount}
        name={channel.name}
        onSelect={onSelect}
        readOnly={channel.readOnly}
        type={channel.type}
        unreadCount={channel.unreadCount}
        voiceState={voiceState}
        {...(canManage ? { dragHandleProps: { ...attributes, ...listeners } } : {})}
        {...(onPrefetch ? { onPrefetch } : {})}
        {...(testId ? { testId } : {})}
      />
    </div>
  );
});

function SortableCategoryGroup({ canManage, categoryId, children }: SortableCategoryGroupProps) {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    disabled: !canManage,
    id: `category-sort:${categoryId}`,
    data: { categoryId, itemType: "category" },
  });
  const verticalTransform = transform ? { ...transform, x: 0 } : null;

  return (
    <div
      ref={setNodeRef}
      style={{
        opacity: isDragging ? 0.78 : 1,
        transform: verticalTransform ? CSS.Transform.toString(verticalTransform) : undefined,
        transition,
      }}
    >
      {children({ attributes, isDragging, listeners })}
    </div>
  );
}

function ChannelDropZone({
  canManage,
  categoryId,
  children,
  empty,
  emptyLabel,
}: ChannelDropZoneProps) {
  const { isOver, setNodeRef } = useDroppable({
    disabled: !canManage,
    id: `category:${categoryId ?? "uncategorized"}`,
    data: { categoryId },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-5 rounded-[11px] border border-transparent transition",
        canManage && isOver
          ? "border-[hsl(var(--primary)/0.34)] bg-[hsl(var(--primary)/0.08)] shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.08)]"
          : "",
      )}
    >
      {children}
      {canManage && empty ? (
        <div className="rounded-[14px] border border-dashed border-[hsl(var(--border)/0.5)] px-2 py-1.5 text-[11px] font-medium text-app-soft">
          {emptyLabel}
        </div>
      ) : null}
    </div>
  );
}

type UserProfileFooterProps = {
  user: {
    id: string;
    avatarUrl?: string | null;
    displayName: string;
    status: PresenceStatus;
    username: string;
  };
  onOpenAppearanceSettings: () => void;
  onStatusChange: (status: PresenceStatus) => void;
};

const USER_STATUS_OPTIONS: Array<{
  key: string;
  value: PresenceStatus;
}> = [
  { key: "friends.status.online", value: "ONLINE" },
  { key: "friends.status.idle", value: "IDLE" },
  { key: "friends.status.dnd", value: "DND" },
  { key: "friends.status.offline", value: "OFFLINE" },
];

/**
 * Presence → token. SPEC §2.5: kullanıcı ayağındaki nokta ve avatar halkası **aynı** renkten
 * türer; renk paletten değil token'dan gelir (§1 "yeni renk yok").
 */
function getPresenceToken(status: PresenceStatus) {
  if (status === "ONLINE") {
    return "success";
  }

  if (status === "IDLE") {
    return "warning";
  }

  if (status === "DND") {
    return "danger";
  }

  return "text-muted";
}

/**
 * SPEC §2.5 — kullanıcı ayağının kutusu: üst kenar 1px `--border`, zemin `--surface-card`,
 * padding `14 10`. Mobil güvenli alan padding'in üzerine biner, kırpılmaz.
 */
export const FOOTER_WRAPPER_STYLE: CSSProperties = {
  background: "hsl(var(--surface-card))",
  borderTop: `${hairline(HOME_METRICS.panel.footerBorderTopWidth)} solid hsl(var(--border))`,
  paddingBottom: `max(${pxToRem(HOME_METRICS.panel.footerPaddingY)}, env(safe-area-inset-bottom))`,
  paddingLeft: pxToRem(HOME_METRICS.panel.footerPaddingX),
  paddingRight: pxToRem(HOME_METRICS.panel.footerPaddingX),
  paddingTop: pxToRem(HOME_METRICS.panel.footerPaddingY),
};

/** SPEC §2.5 — kullanıcı ayağındaki üç ikon butonunun ortak kutusu. */
const FOOTER_ACTION_STYLE: CSSProperties = {
  borderRadius: pxToRem(HOME_METRICS.panel.footerActionRadius),
  height: pxToRem(HOME_METRICS.panel.footerActionSize),
  width: pxToRem(HOME_METRICS.panel.footerActionSize),
};

const FOOTER_ACTION_ICON_STYLE: CSSProperties = {
  height: pxToRem(HOME_METRICS.panel.footerActionIconSize),
  width: pxToRem(HOME_METRICS.panel.footerActionIconSize),
};

const FOOTER_ACTION_ICON_STROKE = HOME_METRICS.panel.footerActionIconStrokeWidth;

function getStatusDotStyle(status: PresenceStatus): CSSProperties {
  const token = getPresenceToken(status);

  return {
    background: `hsl(var(--${token}))`,
    boxShadow: `0 0 0 ${pxToRem(3)} hsl(var(--${token}) / 0.14)`,
  };
}

export function UserProfileFooter({
  user,
  onOpenAppearanceSettings,
  onStatusChange,
}: UserProfileFooterProps) {
  const { t } = useI18n();
  const socket = useSocket();
  const [isLoggingOut, startLogoutTransition] = useTransition();
  const [isUpdatingStatus, startStatusTransition] = useTransition();
  const [statusOverride, setStatusOverride] = useState<{
    sourceStatus: PresenceStatus;
    value: PresenceStatus;
  } | null>(null);
  const [activeUserPopup, setActiveUserPopup] = useState<"quick" | "status" | null>(null);
  /**
   * Hızlı menünün **sabit** koordinatı (`lib/shell/user-bar-menu-placement.ts`).
   *
   * Menü artık kullanıcı barının içinde değil `document.body`'de duruyor: gezinme paneli sütunu
   * `overflow:hidden` taşıyor ve 280 px'lik sütun 308 px'lik menüyü kırpıyordu. Kırpma `z-index`
   * ile aşılamaz, o yüzden kutu kırpma kutusunun **dışına** taşındı.
   *
   * Koordinat açılış anında, tıklama olayının içinde ölçülür — bir efektin içinde ölçmek
   * zincirleme render demekti ve dikdörtgen zaten o karede biliniyor.
   */
  const [quickMenuPlacement, setQuickMenuPlacement] = useState<UserBarMenuPlacement | null>(null);
  const userBarRef = useRef<HTMLDivElement | null>(null);
  const quickMenuRef = useRef<HTMLDivElement | null>(null);
  const quickMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  /**
   * Bu bileşen sorgu sağlayıcısı olmayan yüzeylerde de çiziliyor (gezinme paneli testleri,
   * kabuk dışı önizlemeler). Eksik bir istemci burada hata değil, "tazelenecek önbellek yok"
   * bilgisidir; bu yüzden zorunlu `useQueryClient` değil bağlamın kendisi okunur.
   */
  const queryClient = useContext(QueryClientContext);
  const { isDeafened, isMuted, leaveChannel, toggleDeafen, toggleMute } = useVoiceState();
  const focusControls = useOptionalFocusControls();
  const focusMinutesLeft = focusControls?.minutesLeft ?? null;
  const isQuickMenuOpen = activeUserPopup === "quick";
  const isStatusMenuOpen = activeUserPopup === "status";
  const status = statusOverride?.sourceStatus === user.status ? statusOverride.value : user.status;

  /**
   * Ş12 §2 / K8 — hangi süre çipi seçili.
   *
   * Kaynak **mevcut odak katmanıdır**: `FocusControlsProvider` zaten açık pencereyi tutuyor ve
   * kullanıcı barındaki durum satırı da onu okuyor. Buraya ikinci bir geri sayım ya da ikinci
   * bir "DND açık mı" bayrağı konulmaz.
   */
  const derivedDndDuration = selectDndDuration({
    status,
    statusExpiresAt: focusControls?.focus?.expiresAt ?? null,
    statusFocusMinutes: focusControls?.focus?.totalMinutes ?? null,
  });
  /**
   * İyimser çip seçimi. `baseline`, yazma başlarken sunucunun söylediği değerdir; sunucu bundan
   * başka bir şey söylediği an iyimser değer düşer. Ayarlama **render sırasında** yapılır
   * (React'in "state'i props değişince ayarla" deseni): bir efektle yapmak zincirleme render
   * demekti ve çipin doğrusu zaten aynı karede biliniyor.
   */
  const [pendingDnd, setPendingDnd] = useState<{
    baseline: DndDuration | null;
    value: DndDuration | null;
  } | null>(null);

  if (pendingDnd !== null && pendingDnd.baseline !== derivedDndDuration) {
    setPendingDnd(null);
  }

  const dndDuration = pendingDnd === null ? derivedDndDuration : pendingDnd.value;

  /**
   * Menü kapanırken odak **dişliye** döner.
   *
   * Popover kapandığında odak sahipsiz kalıyordu: menü ögesi DOM'dan düştüğü için
   * `document.activeElement` `<body>`ye düşüyor, klavye kullanıcısı ray'ın başına savruluyordu.
   * Ayarlar penceresi de açılışta `document.activeElement`i "geri dönülecek yer" olarak
   * yakaladığı için, `Esc` ile kapandığında dönecek bir yer bulamıyordu (SPEC §"kapanışta focus
   * tetikleyiciye döner").
   *
   * Geri verme **eşzamanlı**: pencereyi açan tıklama önce burayı, sonra rota geçişini işletiyor,
   * yani pencere mount olduğunda odak zaten dişlide oluyor ve doğru hedefi yakalıyor.
   */
  const closeUserPopups = useCallback(() => {
    setActiveUserPopup((current) => {
      if (current === "quick") {
        quickMenuTriggerRef.current?.focus({ preventScroll: true });
      }

      return null;
    });
  }, []);

  const toggleUserPopup = useCallback((popup: "quick" | "status") => {
    if (popup === "quick") {
      const anchor = userBarRef.current?.getBoundingClientRect() ?? null;

      setQuickMenuPlacement(
        resolveUserBarMenuPlacement({
          anchor: anchor ? { left: anchor.left, top: anchor.top, width: anchor.width } : null,
          maxHeight: USER_BAR_MENU_MAX_HEIGHT,
          // Ölçek adımı kök font boyutunda yaşıyor (SPEC-ANA-SAYFA §8); tasarım ölçülerinin
          // fiziksel karşılığı ondan türer. Sabit 16 yazmak ×1.5 ve ×2 adımlarında menüyü
          // olması gerekenden dar çizerdi.
          rootFontSizePx: Number.parseFloat(
            window.getComputedStyle(document.documentElement).fontSize,
          ),
          viewport: { height: window.innerHeight, width: window.innerWidth },
        }),
      );
    }

    setActiveUserPopup((current) => (current === popup ? null : popup));
  }, []);

  const handleLogout = () => {
    startLogoutTransition(async () => {
      await leaveChannel().catch(() => undefined);
      socket.disconnect();
      await logoutAction();
    });
  };

  /**
   * `⌘,` / `Ctrl+,` — menü kapalıyken de çalışır, o yüzden dinleyici menünün değil kullanıcı
   * barının ömrüne bağlı. Kaç kullanıcı barı çizilirse çizilsin tek `keydown` kurulur
   * (`useSettingsShortcut`).
   */
  useSettingsShortcut(onOpenAppearanceSettings);

  const handleStatusChange = (nextStatus: PresenceStatus) => {
    closeUserPopups();
    const previousStatus = status;
    setStatusOverride({ sourceStatus: user.status, value: nextStatus });
    onStatusChange(nextStatus);
    startStatusTransition(async () => {
      const result = await updatePresenceStatusAction(nextStatus);

      if (!result.success || !result.status) {
        setStatusOverride({ sourceStatus: user.status, value: previousStatus });
        onStatusChange(previousStatus);
        return;
      }

      setStatusOverride({ sourceStatus: user.status, value: result.status });
      onStatusChange(result.status);
    });
  };

  /**
   * Ş12 §2 — anahtar ve dört çip tek yazma yolundan geçer.
   *
   * `duration === null` anahtarın kapatılmasıdır; `statusRestoreTo` sunucuda durduğu için
   * iyimser değer odak katmanının bildiği hedeften okunur, o da yoksa `ONLINE`. Sunucunun
   * cevabı her hâlde son sözü söyler.
   */
  const applyDnd = (duration: DndDuration | null) => {
    closeUserPopups();
    const previousStatus = status;
    const optimisticStatus: PresenceStatus =
      duration === null ? (focusControls?.restoreTo ?? "ONLINE") : "DND";

    setStatusOverride({ sourceStatus: user.status, value: optimisticStatus });
    onStatusChange(optimisticStatus);
    setPendingDnd({ baseline: derivedDndDuration, value: duration });

    startStatusTransition(async () => {
      const result = await updatePresenceDndAction(duration);

      if (!result.success || !result.status) {
        setStatusOverride({ sourceStatus: user.status, value: previousStatus });
        onStatusChange(previousStatus);
        setPendingDnd(null);
        return;
      }

      setStatusOverride({ sourceStatus: user.status, value: result.status });
      onStatusChange(result.status);
      // Süreyi odak katmanı yönetiyor; penceresini yeni satırdan okuması için özeti tazeler.
      void queryClient?.invalidateQueries({ queryKey: homeQueryKeys.summary });
    });
  };

  useEffect(() => {
    if (!isQuickMenuOpen && !isStatusMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      const targetElement = target instanceof Element ? target : null;

      if (targetElement?.closest("[data-notification-popup='true']")) {
        return;
      }

      // Menü portalda: kullanıcı barının **içinde** değil, ama kullanıcı için içeridedir.
      // İki kabı da saymayan bir kontrol, menüye yapılan ilk tıklamada menüyü kapatırdı.
      const insideAnchor = target instanceof Node && userBarRef.current?.contains(target);
      const insideMenu = target instanceof Node && quickMenuRef.current?.contains(target);

      if (!insideAnchor && !insideMenu) {
        setActiveUserPopup(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveUserPopup(null);

        // Ş12 §1 — menü kapanınca focus dişliye döner. Durum listesi kendi tetikleyicisine
        // sahiptir ve onun davranışı bu şeritte değişmez.
        if (isQuickMenuOpen) {
          quickMenuTriggerRef.current?.focus();
        }
      }
    };

    // Sabit koordinat açılışta ölçüldü; görünüm alanı değişirse menü **kapanır**, yeniden
    // konumlanmaz. Yeniden konumlamak menüyü parmağın altında zıplatır (satır motorunun
    // açılır menüsü de aynı kuralı izliyor); kapatmak kullanıcının niyetine saygı duyar.
    const closeOnViewportChange = () => setActiveUserPopup(null);

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", closeOnViewportChange, { passive: true });
    window.addEventListener("scroll", closeOnViewportChange, { capture: true, passive: true });

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, { capture: true });
    };
  }, [isQuickMenuOpen, isStatusMenuOpen]);

  const currentStatusOption = USER_STATUS_OPTIONS.find((option) => option.value === status) ?? {
    key: "friends.status.online",
    value: "ONLINE" as const,
  };

  const presenceToken = getPresenceToken(status);
  /**
   * Ölçüm açılış tıklamasında yapılır; buradaki yedek yalnız ölçümün hiç koşamadığı yol için
   * (kutu açık render edilirse) ve SPEC'in sabit koordinatını verir — konumsuz bir menü
   * çizmektense yanlış yerde ama görünür bir menü çizmek yeğdir.
   */
  const placement =
    quickMenuPlacement ??
    resolveUserBarMenuPlacement({ anchor: null, viewport: { height: 0, width: 0 } });

  return (
    <div
      className="relative flex w-full min-w-0 items-center"
      data-notification-popup-anchor="user"
      data-testid="user-bar"
      data-user-bar-anchor="true"
      ref={userBarRef}
    >
      <div
        className="flex w-full min-w-0 items-center"
        style={{ gap: pxToRem(HOME_METRICS.panel.footerGap) }}
      >
        <div className="relative shrink-0">
          {/* SPEC §2.5: halka presence renginden türer. Odak modu Faz 3'te gelince warning halkası
              bunun üstüne biner; şimdiden sabitlenmez. */}
          <Avatar
            alt={user.displayName}
            className="rounded-full"
            fallback={user.displayName}
            src={user.avatarUrl}
            style={{
              boxShadow: `0 0 0 ${pxToRem(HOME_METRICS.panel.footerAvatarRingInner)} hsl(var(--${presenceToken}) / 0.55), 0 0 0 ${pxToRem(HOME_METRICS.panel.footerAvatarRingOuter)} hsl(var(--${presenceToken}) / 0.2)`,
              fontSize: pxToRem(HOME_METRICS.panel.footerAvatarFontSize),
              height: pxToRem(HOME_METRICS.panel.footerAvatarSize),
              width: pxToRem(HOME_METRICS.panel.footerAvatarSize),
            }}
          />
          <span
            aria-hidden="true"
            className="absolute bottom-0 right-0 rounded-full"
            style={{
              border: `${pxToRem(HOME_METRICS.panel.footerPresenceDotBorderWidth)} solid hsl(var(--surface-card))`,
              height: pxToRem(HOME_METRICS.panel.footerPresenceDotSize),
              width: pxToRem(HOME_METRICS.panel.footerPresenceDotSize),
              ...getStatusDotStyle(status),
            }}
          />
        </div>

        <div className="min-w-0 flex-1 basis-0">
          <p
            className="truncate text-app-foreground"
            style={{
              fontSize: pxToRem(HOME_TYPE_SCALE.cardRowName.size),
              fontWeight: HOME_TYPE_SCALE.cardRowName.weight,
              lineHeight: HOME_TYPE_SCALE.cardRowName.lineHeight,
            }}
          >
            {user.displayName}
          </p>
          <div
            className="relative inline-flex max-w-full align-top"
            style={{ marginTop: pxToRem(HOME_METRICS.panel.footerStatusMarginTop) }}
          >
            {/* Görsel kutu tasarımın yüksekliğinde kalır; `after` sözde öğesi düzeni bozmadan
                işaretçi hedefini 44px'e çıkarır (SPEC §8.2.5 tıklama hedefi tabanı). */}
            <button
              aria-expanded={isStatusMenuOpen}
              aria-haspopup="listbox"
              aria-label={t("shell.user.status")}
              className="relative inline-flex max-w-full items-center rounded-full bg-transparent p-0 text-left text-app-muted transition after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-[''] hover:text-app-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.45)] disabled:cursor-wait disabled:opacity-70"
              disabled={isUpdatingStatus}
              onClick={() => toggleUserPopup("status")}
              style={{
                fontSize: pxToRem(HOME_METRICS.panel.trailingTimeFontSize),
                fontWeight: 600,
                gap: pxToRem(HOME_METRICS.panel.footerStatusGap),
                lineHeight: HOME_TYPE_SCALE.cardRowName.lineHeight,
              }}
              title={t("shell.user.statusTitle")}
              type="button"
            >
              <span
                className="shrink-0 rounded-full"
                style={{
                  height: pxToRem(HOME_METRICS.panel.footerStatusDotSize),
                  width: pxToRem(HOME_METRICS.panel.footerStatusDotSize),
                  ...getStatusDotStyle(status),
                }}
              />
              <span className="truncate">
                {/*
                  Faz 5 §3.3 — odak açıkken satır pencereyi söyler, durumu değil. Sayı üst
                  çubuktaki pill ve `Durumun` kartıyla **aynı** kaynaktan (`FocusControlsProvider`)
                  gelir; burada ikinci bir geri sayım kurulmaz.
                  i18n: `home.presence.focusRow`
                */}
                {focusMinutesLeft === null
                  ? t(currentStatusOption.key)
                  : `Odak modu · ${focusMinutesLeft} dk`}
              </span>
            </button>

            {isStatusMenuOpen ? (
              <div
                className="absolute bottom-[calc(100%+0.45rem)] left-0 z-50 max-h-[min(14rem,50dvh)] w-44 overflow-y-auto overscroll-contain rounded-[18px] border border-[hsl(var(--border)/0.66)] bg-[hsl(var(--surface-card)/0.98)] p-1.5 shadow-[0_18px_48px_hsl(var(--shadow-color)/0.18)] backdrop-blur-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                role="listbox"
              >
                {USER_STATUS_OPTIONS.map((option) => {
                  const selected = option.value === status;

                  return (
                    <button
                      aria-selected={selected}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-[14px] px-2.5 py-1.5 text-left text-xs font-semibold transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.45)]",
                        selected
                          ? "bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]"
                          : "text-app-muted hover:bg-[hsl(var(--surface-soft)/0.58)] hover:text-app-foreground",
                      )}
                      key={option.value}
                      onClick={() => {
                        const duration = resolveStatusMenuDndDuration(option.value);
                        if (duration) {
                          applyDnd(duration);
                          return;
                        }

                        handleStatusChange(option.value);
                      }}
                      role="option"
                      type="button"
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={getStatusDotStyle(option.value)}
                      />
                      <span>{t(option.key)}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>

        {/* SPEC §2.5: üç ikon butonu 28×28, yarıçap 9, muted; hover'da surface-soft + foreground. */}
        <div
          className="flex shrink-0 items-center"
          style={{ gap: pxToRem(HOME_METRICS.panel.footerActionGap) }}
        >
          <button
            aria-label={t("shell.user.toggleMute")}
            aria-pressed={isMuted}
            className={cn(
              "inline-flex shrink-0 items-center justify-center transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
              isMuted
                ? "bg-[hsl(var(--danger)/0.12)] text-[hsl(var(--danger))]"
                : "text-app-muted hover:bg-[var(--surface-hover)] hover:text-app-foreground",
            )}
            onClick={() => {
              void toggleMute();
            }}
            style={FOOTER_ACTION_STYLE}
            type="button"
          >
            <Mic style={FOOTER_ACTION_ICON_STYLE} strokeWidth={FOOTER_ACTION_ICON_STROKE} />
          </button>

          <button
            aria-label={t("shell.user.toggleDeafen")}
            aria-pressed={isDeafened}
            className={cn(
              "inline-flex shrink-0 items-center justify-center transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
              isDeafened
                ? "bg-[hsl(var(--danger)/0.12)] text-[hsl(var(--danger))]"
                : "text-app-muted hover:bg-[var(--surface-hover)] hover:text-app-foreground",
            )}
            onClick={() => {
              void toggleDeafen();
            }}
            style={FOOTER_ACTION_STYLE}
            type="button"
          >
            <Headphones style={FOOTER_ACTION_ICON_STYLE} strokeWidth={FOOTER_ACTION_ICON_STROKE} />
          </button>

          <button
            aria-expanded={isQuickMenuOpen}
            aria-label={t("shell.user.appearanceSettings")}
            className={cn(
              "inline-flex items-center justify-center transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
              isQuickMenuOpen
                ? "bg-[hsl(var(--surface-soft))] text-app-foreground"
                : "text-app-muted hover:bg-[var(--surface-hover)] hover:text-app-foreground",
            )}
            data-testid="user-settings-button"
            onClick={() => toggleUserPopup("quick")}
            ref={quickMenuTriggerRef}
            style={FOOTER_ACTION_STYLE}
            title={t("shell.user.appearanceSettingsTitle")}
            type="button"
          >
            <SlidersHorizontal
              style={FOOTER_ACTION_ICON_STYLE}
              strokeWidth={FOOTER_ACTION_ICON_STROKE}
            />
          </button>
        </div>

        {isQuickMenuOpen && typeof document !== "undefined"
          ? createPortal(
              <div
                aria-label={t("shell.user.quickMenu")}
                className="fixed overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                data-testid="user-quick-menu"
                ref={quickMenuRef}
                role="dialog"
                // Ölçülmüş koordinatlar **fiziksel** pikseldir ve `rem`'e çevrilmez: rem'e çevrilen
                // bir `left`, ölçek adımı değiştiğinde ölçüldüğü yerden kayardı
                // (`user-bar-menu-placement.ts` birim sözleşmesi).
                style={{
                  bottom: `${placement.bottom}px`,
                  left: `${placement.left}px`,
                  maxHeight: `${placement.maxHeight}px`,
                  width: `${placement.width}px`,
                  zIndex: SETTINGS_METRICS.userMenu.zIndex,
                }}
              >
                {/* SPEC §3 kutuyu kabuğun `left:82px · bottom:14px` koordinatına koyuyor. Kutu
                `document.body`'ye portallanıyor çünkü gezinme paneli sütunu `overflow:hidden`
                taşıyor ve 280 px'lik sütun 308 px'lik menüyü kırpıyordu — kırpma `z-index` ile
                aşılamaz. Koordinat çapadan türer (menü üç ayrı yüzeyde açılıyor);
                ölçü, yarıçap ve içerik `UserBarMenu` içinde tasarımın ölçüsündedir. */}
                <UserBarMenu
                  dndActive={status === "DND"}
                  dndDuration={dndDuration}
                  dndPending={isUpdatingStatus}
                  logoutPending={isLoggingOut}
                  onLogout={handleLogout}
                  onOpenSettings={() => {
                    closeUserPopups();
                    onOpenAppearanceSettings();
                  }}
                  onSelectDndDuration={applyDnd}
                  onToggleDnd={() => applyDnd(status === "DND" ? null : DEFAULT_DND_DURATION)}
                />
              </div>,
              document.body,
            )
          : null}
      </div>
    </div>
  );
}

function buildReorderPayload(categoryId: string | null, channels: WorkspaceChannel[]) {
  return channels.map((channel, index) => ({
    categoryId,
    id: channel.id,
    position: index,
  }));
}

function getChannelsForCategory(
  categoryId: string | null,
  detail: WorkspaceServerDetail,
): WorkspaceChannel[] {
  if (categoryId === null) return [...detail.ungroupedChannels];
  return [...(detail.categories.find((cat) => cat.id === categoryId)?.channels ?? [])];
}

export function ChannelSidebar({
  activeChannelId,
  currentUser,
  detail,
  loading,
  onNavigate,
  onCurrentUserStatusChange,
  onLeaveServer,
  onOpenSettings,
  onPrefetch,
  showUserFooter = true,
}: ChannelSidebarProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const voiceStatesQuery = useVoiceStates(detail?.server.id ?? null);
  const { prepareForVoiceJoin } = useVoiceState();
  const {
    collapsedCategories,
    openCategoryModal,
    openChannelModal,
    openDeleteChannelDialog,
    openChannelGroupPositions,
    openInviteModal,
    openServerSettings,
    toggleCategoryCollapse,
  } = useAppStore(
    useShallow((state) => ({
      collapsedCategories: state.collapsedCategories,
      openCategoryModal: state.openCategoryModal,
      openChannelModal: state.openChannelModal,
      openDeleteChannelDialog: state.openDeleteChannelDialog,
      openChannelGroupPositions: state.openChannelGroupPositions,
      openInviteModal: state.openInviteModal,
      openServerSettings: state.openServerSettings,
      toggleCategoryCollapse: state.toggleCategoryCollapse,
    })),
  );

  /**
   * K11'in "aynı anda tek açılır" kuralı tek bir değerle uygulanıyor: menü ile arama
   * popover'ı aynı state'i paylaşınca biri açılırken diğerinin kapanması bir yan etki değil,
   * tanım gereği oluyor. İki ayrı boolean iki ayrı doğruluk kaynağı demekti.
   */
  const [sidebarOverlay, setSidebarOverlay] = useState<"menu" | "search" | null>(null);
  const serverMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const channelSearchTriggerRef = useRef<HTMLButtonElement | null>(null);
  const closeSidebarOverlay = useCallback(() => setSidebarOverlay(null), []);

  useLayerStack({
    id: "server-sidebar-overlay",
    kind: "popover",
    onClose: closeSidebarOverlay,
    open: sidebarOverlay !== null,
  });

  /**
   * Kanal satırının sağ tık menüsü. Referansın satırında kalem/çöp kaplaması **yok** (§2.4);
   * düzenleme ve silme kategorininkiyle aynı desende, sağ tıkla açılıyor.
   */
  const [channelMenu, setChannelMenu] = useState<{
    categoryId: string | null;
    channelId: string | null;
    channelName: string;
    open: boolean;
    type: "TEXT" | "VOICE";
    x: number;
    y: number;
  }>({
    categoryId: null,
    channelId: null,
    channelName: "",
    open: false,
    type: "TEXT",
    x: 0,
    y: 0,
  });
  const [categoryMenu, setCategoryMenu] = useState<{
    categoryId: string | null;
    categoryName: string;
    open: boolean;
    x: number;
    y: number;
  }>({
    categoryId: null,
    categoryName: "",
    open: false,
    x: 0,
    y: 0,
  });
  const [emptyMenu, setEmptyMenu] = useState({
    open: false,
    x: 0,
    y: 0,
  });
  const [categoryToDelete, setCategoryToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4,
      },
    }),
  );

  const reorderMutation = useMutation<
    { success: true },
    Error,
    Array<{ categoryId: string | null; id: string; position: number }>,
    { previousDetail: WorkspaceServerDetail | null }
  >({
    mutationKey: ["workspace", "reorder-channels", detail?.server.id],
    mutationFn: (items: Array<{ categoryId: string | null; id: string; position: number }>) => {
      if (!detail) {
        return Promise.resolve({ success: true as const });
      }

      return reorderChannelsRequest(detail.server.id, items);
    },
    onError: (
      _error,
      _variables,
      context: { previousDetail: WorkspaceServerDetail | null } | undefined,
    ) => {
      if (detail && context?.previousDetail) {
        queryClient.setQueryData(
          workspaceQueryKeys.server(detail.server.id),
          context.previousDetail,
        );
      }
    },
    onMutate: async (items) => {
      if (!detail) {
        return { previousDetail: null };
      }

      await queryClient.cancelQueries({
        queryKey: workspaceQueryKeys.server(detail.server.id),
      });

      const previousDetail =
        queryClient.getQueryData<WorkspaceServerDetail>(
          workspaceQueryKeys.server(detail.server.id),
        ) ?? null;

      if (previousDetail) {
        queryClient.setQueryData(
          workspaceQueryKeys.server(detail.server.id),
          applyChannelReorder(previousDetail, items),
        );
      }

      return { previousDetail };
    },
    onSettled: () => {
      if (!detail) {
        return;
      }

      void queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.server(detail.server.id),
      });
    },
  });

  const categoryReorderMutation = useMutation<
    { success: true },
    Error,
    Array<{ id: string; position: number }>,
    { previousDetail: WorkspaceServerDetail | null }
  >({
    mutationKey: ["workspace", "reorder-categories", detail?.server.id],
    mutationFn: (items: Array<{ id: string; position: number }>) => {
      if (!detail) {
        return Promise.resolve({ success: true as const });
      }

      return reorderCategoriesRequest(detail.server.id, items);
    },
    onError: (_error, _variables, context) => {
      if (detail && context?.previousDetail) {
        queryClient.setQueryData(
          workspaceQueryKeys.server(detail.server.id),
          context.previousDetail,
        );
      }
    },
    onMutate: async (items) => {
      if (!detail) {
        return { previousDetail: null };
      }

      await queryClient.cancelQueries({
        queryKey: workspaceQueryKeys.server(detail.server.id),
      });

      const previousDetail =
        queryClient.getQueryData<WorkspaceServerDetail>(
          workspaceQueryKeys.server(detail.server.id),
        ) ?? null;

      if (previousDetail) {
        queryClient.setQueryData(
          workspaceQueryKeys.server(detail.server.id),
          applyCategoryReorder(previousDetail, items),
        );
      }

      return { previousDetail };
    },
    onSettled: () => {
      if (!detail) {
        return;
      }

      void queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.server(detail.server.id),
      });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async () => {
      if (!detail || !categoryToDelete) {
        return;
      }

      return deleteCategoryRequest(detail.server.id, categoryToDelete.id);
    },
    onSuccess: async () => {
      if (!detail) {
        return;
      }

      setCategoryToDelete(null);
      await queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.server(detail.server.id),
      });
      await queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.servers,
      });
    },
  });

  const serverId = detail?.server.id ?? null;

  const navigateToChannel = useCallback(
    (channelId: string, channelType: "TEXT" | "VOICE") => {
      if (!serverId) return;

      if (channelType === "VOICE") {
        void prepareForVoiceJoin().catch(() => {
          // Join flow inside the voice view handles the final fallback state.
        });
      }

      onNavigate(`/channels/${serverId}/${channelId}`);
    },
    [onNavigate, prepareForVoiceJoin, serverId],
  );

  const prefetchChannel = useCallback(
    (channelId: string) => {
      if (!serverId) return;
      onPrefetch?.(`/channels/${serverId}/${channelId}`);
    },
    [serverId, onPrefetch],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || !detail) return;

      const activeType = active.data.current?.itemType;

      if (activeType === "category") {
        const sourceCategoryId = active.data.current?.categoryId as string | undefined;
        const targetCategoryId = over.data.current?.categoryId as string | undefined;

        if (!sourceCategoryId || !targetCategoryId || sourceCategoryId === targetCategoryId) {
          return;
        }

        const oldIndex = detail.categories.findIndex(
          (category) => category.id === sourceCategoryId,
        );
        const newIndex = detail.categories.findIndex(
          (category) => category.id === targetCategoryId,
        );

        if (oldIndex < 0 || newIndex < 0) {
          return;
        }

        const reordered = arrayMove(detail.categories, oldIndex, newIndex);
        categoryReorderMutation.mutate(
          reordered.map((category, index) => ({
            id: category.id,
            position: index,
          })),
        );
        return;
      }

      const sourceCategoryId = (active.data.current?.categoryId ?? null) as string | null;
      const targetCategoryId = (over.data.current?.categoryId ?? null) as string | null;
      const droppedOnCategory = typeof over.id === "string" && over.id.startsWith("category:");

      const sourceChannels = getChannelsForCategory(sourceCategoryId, detail);
      const targetChannels = getChannelsForCategory(targetCategoryId, detail);

      const oldIndex = sourceChannels.findIndex((c) => c.id === active.id);
      const newIndex = droppedOnCategory
        ? targetChannels.length
        : targetChannels.findIndex((c) => c.id === over.id);

      if (oldIndex < 0 || newIndex < 0) return;

      if (sourceCategoryId === targetCategoryId) {
        if (droppedOnCategory) {
          return;
        }

        const reordered = arrayMove(sourceChannels, oldIndex, newIndex);
        reorderMutation.mutate(buildReorderPayload(sourceCategoryId, reordered));
      } else {
        const movingChannel = sourceChannels[oldIndex]!;
        const newSourceChannels = sourceChannels.filter((c) => c.id !== movingChannel.id);
        const newTargetChannels = [...targetChannels];
        newTargetChannels.splice(newIndex, 0, { ...movingChannel, categoryId: targetCategoryId });
        reorderMutation.mutate([
          ...buildReorderPayload(sourceCategoryId, newSourceChannels),
          ...buildReorderPayload(targetCategoryId, newTargetChannels),
        ]);
      }
    },
    [categoryReorderMutation, detail, reorderMutation],
  );

  const setAllCategoriesCollapsed = useCallback(
    (collapsed: boolean) => {
      if (!detail) {
        return;
      }

      detail.categories.forEach((category) => {
        const key = `${detail.server.id}:${category.id}`;
        const isCollapsed = collapsedCategories[key] ?? false;
        if (isCollapsed !== collapsed) {
          toggleCategoryCollapse(detail.server.id, category.id);
        }
      });

      setSidebarOverlay(null);
      setEmptyMenu((state) => ({ ...state, open: false }));
      setCategoryMenu((state) => ({ ...state, open: false }));
    },
    [collapsedCategories, detail, toggleCategoryCollapse],
  );

  if (loading) {
    return (
      <aside
        className="h-full w-full min-w-0 overflow-hidden pt-[env(safe-area-inset-top)] md:pt-0"
        data-testid="channel-sidebar"
        style={SIDEBAR_SURFACE_STYLE}
      >
        <ChannelSidebarSkeleton />
      </aside>
    );
  }

  if (!detail) {
    return (
      <aside
        className="flex h-full w-full min-w-0 flex-col overflow-hidden pt-[env(safe-area-inset-top)] md:pt-0"
        data-testid="channel-sidebar"
        style={SIDEBAR_SURFACE_STYLE}
      >
        {/*
          Detay yoksa sunucu bilinmiyor demek (yükleme bitti, cevap gelmedi).
          Burada eskiden arkadaş listesi çiziliyordu; Mesajlar kendi rotasına ve
          kendi rayına taşınınca bu, **sunucu** sütununda alakasız bir ekran
          oldu. Boş bırakmak, yanlış bir ekran göstermekten iyi.
        */}
        <div className="min-h-0 flex-1 p-4" data-testid="channel-sidebar-empty" />
        {showUserFooter ? (
          <div
            className="flex items-center"
            data-notification-popup-anchor="controls-border"
            style={FOOTER_WRAPPER_STYLE}
          >
            <UserProfileFooter
              user={currentUser}
              onOpenAppearanceSettings={onOpenSettings}
              onStatusChange={onCurrentUserStatusChange}
            />
          </div>
        ) : null}
      </aside>
    );
  }

  const canManage = detail.server.isAdmin;
  /**
   * Menü kapısı `isAdmin`'e değil **yetki bitlerine** bakıyor (00 §5): `MANAGE_CHANNELS`
   * taşıyan ama yönetici olmayan bir rol kategori/kanal satırını görmeli, `MANAGE_SERVER`
   * taşımayan bir yönetici yardımcısı ayarlar satırını görmemeli.
   */
  const viewerPermissions = resolveViewerPermissions({
    currentUserId: currentUser.id,
    members: detail.members,
    roles: detail.roles,
    server: { isOwner: detail.server.isOwner },
  });
  const canManageChannels = viewerCan(viewerPermissions, "MANAGE_CHANNELS");
  const canManageServer = viewerCan(viewerPermissions, "MANAGE_SERVER");
  /** Kanal kimliği → o kanaldaki katılımcı sayısı; daraltma filtresinin üçüncü ölçütü. */
  const voiceParticipantCounts = new Map(
    (voiceStatesQuery.data ?? []).map((state) => [state.channelId, state.participants.length]),
  );
  const collapsedContext = { activeChannelId, voiceStates: voiceParticipantCounts };
  const visibleCategories = detail.categories;
  const visibleUngroupedChannels = detail.ungroupedChannels;
  const hasOpenChannelGroup = visibleUngroupedChannels.length > 0;
  const openChannelGroupPosition = hasOpenChannelGroup
    ? Math.min(
        visibleCategories.length,
        Math.max(0, openChannelGroupPositions[detail.server.id] ?? visibleCategories.length),
      )
    : visibleCategories.length;
  const displayGroups: SidebarDisplayGroup[] = visibleCategories.map((category) => ({
    category,
    key: `category:${category.id}`,
    type: "category",
  }));
  const hasVisibleChannels =
    visibleUngroupedChannels.length > 0 ||
    visibleCategories.some((category) => category.channels.length > 0);

  if (hasOpenChannelGroup) {
    displayGroups.splice(openChannelGroupPosition, 0, {
      key: OPEN_CHANNEL_GROUP_KEY,
      type: "open",
    });
  }

  const getCategoryCollapsed = (categoryId: string) =>
    collapsedCategories[`${detail.server.id}:${categoryId}`] ?? false;

  /**
   * Arama popover'ının kaynağı **daraltmadan önceki** listedir: daraltılmış bir kategorideki
   * kanal listede görünmese de aramada bulunur (Ş0'ın `channel-visibility` notu).
   */
  const channelSearchHits: ChannelSearchHit[] = [
    ...detail.categories.flatMap((category) =>
      category.channels.map((channel) => ({
        categoryLabel: category.name,
        id: channel.id,
        name: channel.name,
        type: channel.type,
      })),
    ),
    ...detail.ungroupedChannels.map((channel) => ({
      categoryLabel: t("shell.channelSidebar.openChannels"),
      id: channel.id,
      name: channel.name,
      type: channel.type,
    })),
  ];

  const onlineMemberCount = detail.members.filter((member) => member.status !== "OFFLINE").length;
  const serverIcon = resolveServerIconPresentation({
    iconColor: detail.server.iconColor,
    iconUrl: detail.server.iconUrl,
    name: detail.server.name,
    shortName: detail.server.shortName,
  });

  const handleServerMenuSelect = (key: ServerMenuRowKey) => {
    setSidebarOverlay(null);

    if (key === "invite") {
      openInviteModal(detail.server.id);
      return;
    }

    if (key === "createCategory") {
      openCategoryModal(detail.server.id);
      return;
    }

    if (key === "createChannel") {
      openChannelModal({ mode: "create", serverId: detail.server.id, type: "TEXT" });
      return;
    }

    if (key === "settings") {
      openServerSettings(detail.server.id);
      return;
    }

    onLeaveServer?.();
  };

  const openChannelContextMenu = (
    channel: WorkspaceChannel,
    event: React.MouseEvent<HTMLElement>,
  ) => {
    if (!canManage) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setChannelMenu({
      channelId: channel.id,
      channelName: channel.name,
      categoryId: channel.categoryId,
      open: true,
      type: channel.type,
      x: event.clientX,
      y: event.clientY,
    });
  };

  const renderChannelRow = (channel: WorkspaceChannel, sortable: boolean) => {
    const voiceState =
      channel.type === "VOICE"
        ? (voiceStatesQuery.data?.find((state) => state.channelId === channel.id) ?? null)
        : null;
    const itemProps = {
      active: channel.id === activeChannelId,
      currentUserId: currentUser.id,
      name: channel.name,
      onSelect: () => {
        if (!channel.canAccess) {
          return;
        }
        void navigateToChannel(channel.id, channel.type);
      },
      testId: `channel-item-${channel.id}`,
      ...(channel.canAccess ? { onPrefetch: () => prefetchChannel(channel.id) } : {}),
    };

    if (sortable) {
      return (
        <SortableChannelRow
          canManage={canManage}
          channel={channel}
          key={channel.id}
          onContextMenu={(event) => openChannelContextMenu(channel, event)}
          voiceState={voiceState}
          {...itemProps}
        />
      );
    }

    /*
      Daraltılmış kategoride satırlar **sürüklenmez**. Sıralama yükü listenin tamamından
      türetiliyor (`buildReorderPayload`); süzülmüş üç satırdan üretilen bir yük geri kalan
      kanalların konumunu sıfırlardı. Daraltılmış hâl bir görünüm kısayolu, bir düzenleme
      kipi değil.
    */
    const Item = channel.type === "VOICE" ? VoiceChannelItem : ChannelItem;

    return (
      <div key={channel.id} onContextMenu={(event) => openChannelContextMenu(channel, event)}>
        <Item
          canAccess={channel.canAccess}
          mentionCount={channel.mentionCount}
          readOnly={channel.readOnly}
          type={channel.type}
          unreadCount={channel.unreadCount}
          voiceState={voiceState}
          {...itemProps}
        />
      </div>
    );
  };

  const renderChannelGroup = (
    label: string,
    categoryId: string | null,
    channels: WorkspaceChannel[],
    groupKey: string,
    categorySortable?: CategorySortableHandle,
  ) => {
    const { sidebar } = SERVER_METRICS;
    const collapsed = categoryId ? getCategoryCollapsed(categoryId) : false;
    const categoryCaretTransform = collapsed ? "rotate(-90deg)" : "rotate(0deg)";
    /**
     * SPEC §2.4: daraltıldığında yalnız aktif / okunmamışı olan / içinde konuşan kanal
     * görünür. Kural Ş0'ın saf fonksiyonundan gelir, burada ikinci kez yazılmaz.
     */
    const collapsedChannels = collapsed
      ? filterCollapsedCategoryChannels(channels, collapsedContext)
      : channels;
    const hiddenCount = collapsed ? countHiddenInCollapsedCategory(channels, collapsedContext) : 0;
    /*
      Kategori başlığının **kendisi** sürükleme tutamağı: referansın satırında ayrı bir
      tutamak, ok çifti ya da `···` düğmesi yok (§2.4). Kategori işlemleri sağ tık menüsünde,
      klavye ile sıralama ise sunucu ayarlarının Kanallar bölümünde (Ş12) yaşıyor.
    */
    const categoryDragProps =
      canManage && categorySortable
        ? { ...categorySortable.attributes, ...categorySortable.listeners }
        : {};

    return (
      <div
        data-sidebar-interactive="true"
        data-testid={`channel-category-${categoryId ?? "open"}`}
        key={groupKey}
        style={{ marginTop: pxToRem(sidebar.categoryMarginTop) }}
      >
        <div
          className="flex items-center"
          onContextMenu={
            categoryId
              ? (event) => {
                  if (!canManage) {
                    return;
                  }

                  event.preventDefault();
                  event.stopPropagation();
                  setCategoryMenu({
                    categoryId,
                    categoryName: label,
                    open: true,
                    x: event.clientX,
                    y: event.clientY,
                  });
                }
              : undefined
          }
          style={{
            gap: pxToRem(sidebar.categoryHeaderGap),
            padding: `${pxToRem(sidebar.categoryHeaderPaddingY)} ${pxToRem(
              sidebar.categoryHeaderPaddingRight,
            )} ${pxToRem(sidebar.categoryHeaderPaddingY)} ${pxToRem(
              sidebar.categoryHeaderPaddingLeft,
            )}`,
          }}
        >
          <button
            aria-expanded={categoryId ? !collapsed : undefined}
            className="flex min-w-0 flex-1 cursor-pointer items-center text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            data-testid={categoryId ? `channel-category-toggle-${categoryId}` : undefined}
            onClick={() => {
              if (categoryId) {
                toggleCategoryCollapse(detail.server.id, categoryId);
              }
            }}
            style={{ gap: pxToRem(sidebar.categoryHeaderGap) }}
            type="button"
            {...categoryDragProps}
          >
            {categoryId ? (
              <span
                className="grid flex-none place-items-center"
                style={{
                  color: "hsl(var(--text-muted))",
                  height: pxToRem(sidebar.categoryCaretSize),
                  transform: categoryCaretTransform,
                  transition: `transform ${sidebar.categoryCaretTransitionMs}ms`,
                  width: pxToRem(sidebar.categoryCaretSize),
                }}
              >
                <ChevronDown
                  aria-hidden="true"
                  strokeWidth={sidebar.categoryCaretStrokeWidth}
                  style={{
                    height: pxToRem(sidebar.categoryCaretSize),
                    width: pxToRem(sidebar.categoryCaretSize),
                  }}
                />
              </span>
            ) : null}
            <span
              className="min-w-0 truncate uppercase"
              style={{
                color: collapsed ? "hsl(var(--text-muted))" : "hsl(var(--text-secondary))",
                fontFamily: DISPLAY_FONT,
                fontSize: pxToRem(sidebar.categoryLabelFontSize),
                fontWeight: 600,
                letterSpacing: `${sidebar.categoryLabelLetterSpacing}em`,
                lineHeight: sidebar.categoryLabelLineHeight,
              }}
            >
              {label}
            </span>
            {hiddenCount > 0 ? (
              <span
                className="flex-none"
                data-testid={`channel-category-hidden-${categoryId ?? "open"}`}
                style={{
                  background: "hsl(var(--surface-tertiary))",
                  borderRadius: pxToRem(sidebar.categoryHiddenChipRadius),
                  color: "hsl(var(--text-muted))",
                  fontFamily: DISPLAY_FONT,
                  fontSize: pxToRem(sidebar.categoryHiddenChipFontSize),
                  fontWeight: 600,
                  lineHeight: 1,
                  padding: `${pxToRem(sidebar.categoryHiddenChipPaddingY)} ${pxToRem(
                    sidebar.categoryHiddenChipPaddingX,
                  )}`,
                }}
              >
                {t("server.sidebar.category.hidden", { count: hiddenCount })}
              </span>
            ) : null}
          </button>

          {canManageChannels && categoryId ? (
            <button
              aria-label={t("server.sidebar.category.addChannel", { name: label })}
              className="grid flex-none cursor-pointer place-items-center transition-colors hover:bg-[hsl(var(--surface-soft))] hover:text-[hsl(var(--foreground))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
              data-testid={`channel-category-add-${categoryId}`}
              onClick={(event) => {
                event.stopPropagation();
                openChannelModal({
                  categoryId,
                  mode: "create",
                  serverId: detail.server.id,
                  type: "TEXT",
                });
              }}
              style={{
                borderRadius: pxToRem(sidebar.categoryAddButtonRadius),
                color: "hsl(var(--text-muted))",
                height: pxToRem(sidebar.categoryAddButtonSize),
                width: pxToRem(sidebar.categoryAddButtonSize),
              }}
              title={t("server.sidebar.category.addChannel", { name: label })}
              type="button"
            >
              <Plus
                aria-hidden="true"
                strokeWidth={sidebar.categoryAddIconStrokeWidth}
                style={{
                  height: pxToRem(sidebar.categoryAddIconSize),
                  width: pxToRem(sidebar.categoryAddIconSize),
                }}
              />
            </button>
          ) : null}
        </div>

        {collapsed ? (
          collapsedChannels.map((channel) => renderChannelRow(channel, false))
        ) : (
          <SortableContext
            items={channels.map((channel) => channel.id)}
            strategy={verticalListSortingStrategy}
          >
            <ChannelDropZone
              canManage={canManage}
              categoryId={categoryId}
              empty={channels.length === 0}
              emptyLabel={t("shell.channelSidebar.dropChannelsHere")}
            >
              {channels.map((channel) => renderChannelRow(channel, true))}
            </ChannelDropZone>
          </SortableContext>
        )}
      </div>
    );
  };

  return (
    <aside
      className="relative flex h-full w-full min-w-0 flex-col overflow-hidden pt-[env(safe-area-inset-top)] md:pt-0"
      data-testid="channel-sidebar"
      style={SIDEBAR_SURFACE_STYLE}
    >
      {/* SPEC §2.1 — sunucu başlığı. Açıkken zemin `surface-soft`, altında `border/.45`. */}
      <button
        aria-expanded={sidebarOverlay === "menu"}
        aria-haspopup="menu"
        className="flex w-full min-w-0 items-center text-left transition-colors hover:bg-[hsl(var(--surface-soft))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
        data-sidebar-interactive="true"
        data-testid="server-header-button"
        onClick={() => setSidebarOverlay((current) => (current === "menu" ? null : "menu"))}
        ref={serverMenuTriggerRef}
        style={{
          background: sidebarOverlay === "menu" ? "hsl(var(--surface-soft))" : "transparent",
          borderBottom: `${hairline()} solid hsl(var(--border) / ${SERVER_METRICS.sidebar.headerBorderBottomAlpha})`,
          height: pxToRem(SERVER_METRICS.headerHeight),
          flexShrink: 0,
          gap: pxToRem(SERVER_METRICS.sidebar.headerGap),
          padding: `${pxToRem(SERVER_METRICS.sidebar.headerPaddingY)} ${pxToRem(
            SERVER_METRICS.sidebar.headerPaddingX,
          )}`,
        }}
        type="button"
      >
        <span
          className="grid flex-none place-items-center uppercase"
          style={{
            background:
              serverIcon.kind === "image"
                ? `center / cover no-repeat url(${JSON.stringify(serverIcon.imageUrl)})`
                : getServerIconToneColor(serverIcon.tone),
            borderRadius: pxToRem(SERVER_METRICS.sidebar.headerIconRadius),
            color: "hsl(var(--primary-foreground))",
            fontFamily: DISPLAY_FONT,
            fontSize: pxToRem(SERVER_METRICS.sidebar.headerIconFontSize),
            fontWeight: 600,
            height: pxToRem(SERVER_METRICS.sidebar.headerIconSize),
            lineHeight: 1,
            width: pxToRem(SERVER_METRICS.sidebar.headerIconSize),
          }}
        >
          {serverIcon.kind === "fallback" ? serverIcon.label : ""}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className="block truncate"
            style={{
              color: "hsl(var(--foreground))",
              fontFamily: DISPLAY_FONT,
              fontSize: pxToRem(SERVER_METRICS.sidebar.headerNameFontSize),
              fontWeight: 600,
              letterSpacing: DISPLAY_TRACKING,
              lineHeight: SERVER_METRICS.sidebar.headerNameLineHeight,
            }}
          >
            {detail.server.name}
          </span>
          <span
            className="flex items-center"
            style={{
              color: "hsl(var(--text-muted))",
              fontSize: pxToRem(SERVER_METRICS.sidebar.headerMetaFontSize),
              fontWeight: 500,
              gap: pxToRem(SERVER_METRICS.sidebar.headerMetaGap),
              lineHeight: 1,
              marginTop: pxToRem(SERVER_METRICS.sidebar.headerMetaMarginTop),
            }}
          >
            <span
              aria-hidden="true"
              className="flex-none rounded-full"
              style={{
                background: "hsl(var(--success))",
                height: pxToRem(SERVER_METRICS.sidebar.headerPresenceDotSize),
                width: pxToRem(SERVER_METRICS.sidebar.headerPresenceDotSize),
              }}
            />
            <span className="truncate">
              {t("server.sidebar.header.presence", {
                members: detail.server.memberCount,
                online: onlineMemberCount,
              })}
            </span>
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          style={{
            color: "hsl(var(--text-muted))",
            flex: "none",
            height: pxToRem(SERVER_METRICS.sidebar.headerChevronSize),
            width: pxToRem(SERVER_METRICS.sidebar.headerChevronSize),
          }}
        />
      </button>

      {sidebarOverlay === "menu" ? (
        <ServerMenu
          canManageChannels={canManageChannels}
          canManageServer={canManageServer}
          inviteHint={t(`server.modal.invite.duration.${SERVER_INVITE_DEFAULT_DURATION_ID}`)}
          onClose={closeSidebarOverlay}
          onSelect={handleServerMenuSelect}
          triggerRef={serverMenuTriggerRef}
        />
      ) : null}

      <ChannelSearchTrigger
        onOpen={() => setSidebarOverlay("search")}
        open={sidebarOverlay === "search"}
        triggerRef={channelSearchTriggerRef}
      />

      {sidebarOverlay === "search" ? (
        <ChannelSearchPopover
          channels={channelSearchHits}
          onClose={closeSidebarOverlay}
          onSelect={(channelId) => {
            const channel = channelSearchHits.find((hit) => hit.id === channelId);
            setSidebarOverlay(null);
            if (channel) {
              void navigateToChannel(channel.id, channel.type);
            }
          }}
          triggerRef={channelSearchTriggerRef}
        />
      ) : null}

      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd} sensors={sensors}>
        <div
          className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden"
          data-testid="channel-sidebar-list"
          style={{
            padding: `0 ${pxToRem(SERVER_METRICS.sidebar.listPaddingX)} ${pxToRem(
              SERVER_METRICS.sidebar.listPaddingBottom,
            )}`,
          }}
          onContextMenu={(event) => {
            const target = event.target;
            if (
              target instanceof HTMLElement &&
              target.closest("[data-sidebar-interactive='true']")
            ) {
              return;
            }

            event.preventDefault();
            setEmptyMenu({
              open: true,
              x: event.clientX,
              y: event.clientY,
            });
          }}
        >
          {hasVisibleChannels ? (
            <SortableContext
              items={detail.categories.map((category) => `category-sort:${category.id}`)}
              strategy={verticalListSortingStrategy}
            >
              {displayGroups.map((group) =>
                group.type === "category" ? (
                  <SortableCategoryGroup
                    canManage={canManage}
                    categoryId={group.category.id}
                    key={group.key}
                  >
                    {(sortable) =>
                      renderChannelGroup(
                        group.category.name,
                        group.category.id,
                        group.category.channels,
                        group.key,
                        sortable,
                      )
                    }
                  </SortableCategoryGroup>
                ) : (
                  renderChannelGroup(
                    t("shell.channelSidebar.openChannels"),
                    null,
                    visibleUngroupedChannels,
                    group.key,
                  )
                ),
              )}
            </SortableContext>
          ) : (
            <div className="rounded-[24px] border border-dashed border-[hsl(var(--border)/0.7)] bg-[hsl(var(--surface-soft)/0.28)] px-4 py-8 text-center">
              <p className="text-sm font-semibold text-app-foreground">
                {t("shell.channelSidebar.searchEmptyTitle")}
              </p>
              <p className="mt-2 text-xs leading-5 text-app-muted">
                {t("shell.channelSidebar.searchEmptyDescription")}
              </p>
            </div>
          )}
        </div>
      </DndContext>

      {showUserFooter ? (
        <div
          className="flex items-center"
          data-notification-popup-anchor="controls-border"
          style={FOOTER_WRAPPER_STYLE}
        >
          <UserProfileFooter
            user={currentUser}
            onOpenAppearanceSettings={onOpenSettings}
            onStatusChange={onCurrentUserStatusChange}
          />
        </div>
      ) : null}

      <ContextMenu
        onClose={() => setChannelMenu((state) => ({ ...state, open: false }))}
        open={channelMenu.open}
        position={channelMenu}
      >
        <div className="px-3 py-2">
          <p className="text-app-soft text-[10px] font-semibold uppercase tracking-[0.2em]">
            {t("server.sidebar.channel.actions")}
          </p>
          <p className="mt-0.5 max-w-48 truncate text-sm font-semibold text-app-foreground">
            {channelMenu.channelName}
          </p>
        </div>
        <ContextMenuSeparator />
        <ContextMenuItem
          data-testid="channel-context-edit"
          onClick={() => {
            if (!channelMenu.channelId) return;
            const { categoryId, channelId, type } = channelMenu;
            setChannelMenu((state) => ({ ...state, open: false }));
            openChannelModal({
              categoryId,
              channelId,
              mode: "edit",
              serverId: detail.server.id,
              type,
            });
          }}
        >
          <Edit3 className="mr-2 h-4 w-4" />
          {t("server.sidebar.channel.edit")}
        </ContextMenuItem>
        <ContextMenuItem
          data-testid="channel-context-delete"
          destructive
          onClick={() => {
            if (!channelMenu.channelId) return;
            const { channelId, channelName } = channelMenu;
            setChannelMenu((state) => ({ ...state, open: false }));
            openDeleteChannelDialog(channelId, channelName);
          }}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {t("server.sidebar.channel.delete")}
        </ContextMenuItem>
      </ContextMenu>

      <ContextMenu
        onClose={() => setCategoryMenu((state) => ({ ...state, open: false }))}
        open={categoryMenu.open}
        position={categoryMenu}
      >
        <div className="px-3 py-2">
          <p className="text-app-soft text-[10px] font-semibold uppercase tracking-[0.2em]">
            {t("shell.channelSidebar.categoryActions")}
          </p>
          <p className="mt-0.5 max-w-48 truncate text-sm font-semibold text-app-foreground">
            {categoryMenu.categoryName}
          </p>
        </div>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => {
            if (!categoryMenu.categoryId) return;
            setCategoryMenu((state) => ({ ...state, open: false }));
            openCategoryModal(detail.server.id, {
              categoryId: categoryMenu.categoryId,
              mode: "edit",
            });
          }}
        >
          <Edit3 className="mr-2 h-4 w-4" />
          {t("shell.channelSidebar.editCategory")}
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            if (!categoryMenu.categoryId) return;
            setCategoryMenu((state) => ({ ...state, open: false }));
            openChannelModal({
              categoryId: categoryMenu.categoryId,
              mode: "create",
              serverId: detail.server.id,
              type: "TEXT",
            });
          }}
        >
          <Hash className="mr-2 h-4 w-4" />
          {t("shell.channelSidebar.createTextChannel")}
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            if (!categoryMenu.categoryId) return;
            setCategoryMenu((state) => ({ ...state, open: false }));
            openChannelModal({
              categoryId: categoryMenu.categoryId,
              mode: "create",
              serverId: detail.server.id,
              type: "VOICE",
            });
          }}
        >
          <Volume2 className="mr-2 h-4 w-4" />
          {t("shell.channelSidebar.createVoiceChannel")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          destructive
          onClick={() => {
            if (!categoryMenu.categoryId) return;
            setCategoryToDelete({
              id: categoryMenu.categoryId,
              name: categoryMenu.categoryName,
            });
            setCategoryMenu((state) => ({ ...state, open: false }));
          }}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {t("shell.channelSidebar.deleteCategory")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={detail.categories.length === 0}
          onClick={() => setAllCategoriesCollapsed(false)}
        >
          <ChevronDown className="mr-2 h-4 w-4" />
          {t("shell.channelSidebar.expandAllCategories")}
        </ContextMenuItem>
        <ContextMenuItem
          disabled={detail.categories.length === 0}
          onClick={() => setAllCategoriesCollapsed(true)}
        >
          <ChevronDown className="mr-2 h-4 w-4 -rotate-90" />
          {t("shell.channelSidebar.collapseAllCategories")}
        </ContextMenuItem>
      </ContextMenu>

      <ContextMenu
        onClose={() => setEmptyMenu((state) => ({ ...state, open: false }))}
        open={emptyMenu.open}
        position={emptyMenu}
      >
        {/*
          `Sunucu profili` eskiden başlığın açtığı menüdeydi. Başlık artık SPEC §2.2'nin beş
          satırını çiziyor ve o beşin içinde profil yok; rota kaybolmasın diye boş alanın
          sağ tık menüsüne taşındı.
        */}
        <ContextMenuItem
          onClick={() => {
            setEmptyMenu((state) => ({ ...state, open: false }));
            onNavigate(`/servers/${detail.server.id}/about`);
          }}
        >
          {t("server.sidebar.serverProfile")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        {canManage ? (
          <>
            <ContextMenuItem
              onClick={() => {
                setEmptyMenu((state) => ({ ...state, open: false }));
                openChannelModal({
                  mode: "create",
                  serverId: detail.server.id,
                  type: "TEXT",
                });
              }}
            >
              <Hash className="mr-2 h-4 w-4" />
              {t("shell.channelSidebar.createTextChannel")}
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => {
                setEmptyMenu((state) => ({ ...state, open: false }));
                openChannelModal({
                  mode: "create",
                  serverId: detail.server.id,
                  type: "VOICE",
                });
              }}
            >
              <Volume2 className="mr-2 h-4 w-4" />
              {t("shell.channelSidebar.createVoiceChannel")}
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => {
                setEmptyMenu((state) => ({ ...state, open: false }));
                openCategoryModal(detail.server.id);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              {t("shell.channelSidebar.createCategory")}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={() => {
                setEmptyMenu((state) => ({ ...state, open: false }));
                openInviteModal(detail.server.id);
              }}
            >
              <UserPlus className="mr-2 h-4 w-4" />
              {t("shell.channelSidebar.createInvite")}
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        ) : null}
        <ContextMenuItem
          disabled={detail.categories.length === 0}
          onClick={() => setAllCategoriesCollapsed(false)}
        >
          <ChevronDown className="mr-2 h-4 w-4" />
          {t("shell.channelSidebar.expandAllCategories")}
        </ContextMenuItem>
        <ContextMenuItem
          disabled={detail.categories.length === 0}
          onClick={() => setAllCategoriesCollapsed(true)}
        >
          <ChevronDown className="mr-2 h-4 w-4 -rotate-90" />
          {t("shell.channelSidebar.collapseAllCategories")}
        </ContextMenuItem>
      </ContextMenu>

      <Modal
        onClose={() => setCategoryToDelete(null)}
        open={Boolean(categoryToDelete)}
        title={
          categoryToDelete
            ? t("workspace.modal.categoryDeleteTitle", { name: categoryToDelete.name })
            : t("shell.channelSidebar.deleteCategory")
        }
        {...(categoryToDelete
          ? { description: t("shell.channelSidebar.deleteCategoryDescription") }
          : {})}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button
            className="h-11 rounded-2xl"
            disabled={deleteCategoryMutation.isPending}
            onClick={() => setCategoryToDelete(null)}
            type="button"
            variant="outline"
          >
            {t("common.cancel")}
          </Button>
          <Button
            className="h-11 rounded-2xl border border-[hsl(var(--danger)/0.32)] bg-[hsl(var(--danger)/0.12)] text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger)/0.18)]"
            disabled={deleteCategoryMutation.isPending}
            onClick={() => deleteCategoryMutation.mutate()}
            type="button"
            variant="outline"
          >
            {deleteCategoryMutation.isPending
              ? t("workspace.modal.categoryDeleting")
              : t("workspace.modal.categoryDeleteAction")}
          </Button>
        </div>
      </Modal>
    </aside>
  );
}
