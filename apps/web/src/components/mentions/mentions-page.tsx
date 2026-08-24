"use client";

import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import {
  MENTIONS_UI_INITIAL_STATE,
  mentionsUiReducer,
  parseMentionId,
  resolveAccountTimeZone,
  type Mention,
  type MentionCounts,
  type MentionFilter,
  type MentionListResponse,
} from "@wizards/types";

import { MentionCard } from "@/components/mentions/mention-card";
import { MentionContextPanel } from "@/components/mentions/mention-context-panel";
import { MentionReplyBox } from "@/components/mentions/mention-reply-box";
import { MentionSettingsModal } from "@/components/mentions/mention-settings-modal";
import { MentionsFeed, type MentionCardRenderer } from "@/components/mentions/mentions-feed";
import { MentionsFeedHeader } from "@/components/mentions/mentions-feed-header";
import { useAccountPreferenceRuntime } from "@/components/providers/account-preference-provider";
import { useAuthenticatedAppRuntime } from "@/components/providers/authenticated-app-providers";
import { useI18n } from "@/components/providers/locale-provider";
import { useMinuteClock } from "@/hooks/use-minute-clock";
import { useSocket } from "@/hooks/use-socket";
import { setDMConversationMutedRequest } from "@/lib/dm/client";
import { homeQueryKeys } from "@/lib/home/client";
import {
  MENTIONS_STALE_TIME_MS,
  fetchMentionCounts,
  fetchMentions,
  mentionsQueryKeys,
  updateMentionState,
  type MentionStateRequest,
} from "@/lib/mentions/client";
import {
  MENTION_TABS,
  readMentionTabCount,
  type MentionMenuAction,
  type MentionTabId,
} from "@/lib/mentions/contracts";
import { groupMentions, matchesMentionRoute } from "@/lib/mentions/grouping";
import {
  MENTIONS_DM_SOURCE,
  buildMentionsHref,
  parseMentionsRouteState,
  type MentionsRouteState,
} from "@/lib/mentions/routes";
import { useToast } from "@/hooks/use-toast";
import { toInitials } from "@/lib/messages/rail-presentation";
import { updateChannelNotificationSettings } from "@/lib/workspace/client";

/**
 * Bahsedilmeler ekranının **durum sahibi** — SPEC §2.
 *
 * Tek doğruluk kaynağı URL: filtre, kaynak, gruplama, pencere, arama ve bağlam paneli adres
 * çubuğunda durur. Bunun üç ölçülebilir sonucu var — durum paylaşılabilir, geri tuşu her
 * ekseni **tek adım** geri alır, ve sunucu ilk boyayı doğru süzgeçle çizer.
 *
 * Geçici katmanlar (menü, yanıt kutusu, klavye imleci) tek bir indirgeyicide durur
 * (`mentionsUiReducer`, Dalga 0). Üç ayrı `useState` yazıldığında "biri açılırken diğeri
 * kapanır" kuralı her çağrı yerinde tekrar edilmek zorunda kalır ve bir yerde unutulur.
 * Panel ve modal da **aynı** indirgeyicide tutulur ama yazımları adresten geçer: adres
 * değişince indirgeyici eşitlenir, indirgeyici tek başına adresin arkasından gitmez.
 *
 * Kartın içini Ş6, yanıt kutusu ile bağlam panelini Ş7, ayarlar modalını Ş8 yazıyor. Bu dosya
 * onları **yalnız yerleştirir**: `renderCard` bir `MentionCardProps` alır, kalan üçü birer
 * slot. Hiçbiri burada çizilmez.
 */

const PAGE_SIZE = 25;

export type MentionsPageProps = {
  /**
   * Dört slot da varsayılan olarak gerçek bileşeni çizer (Ş6 · Ş7 · Ş8). Prop olarak
   * kalmalarının tek sebebi test: akışın yerleşimini kartın içinden bağımsız doğrulayabilmek
   * için sahte bir çizici geçirilebiliyor.
   */
  readonly renderCard?: MentionCardRenderer;
  readonly renderContextPanel?: (input: {
    readonly mention: Mention | null;
    readonly mentionId: string;
    readonly onClose: () => void;
    readonly onOpen: () => void;
    readonly onReplyInThread: () => void;
  }) => React.ReactNode;
  readonly renderReply?: (input: {
    readonly mention: Mention;
    readonly onClose: () => void;
    readonly onSent: () => void;
  }) => React.ReactNode;
  readonly renderSettingsModal?: (input: { readonly onClose: () => void }) => React.ReactNode;
};

type MentionPages = InfiniteData<MentionListResponse, string | undefined>;

/** Genel bildirim soketinden yalnız kanal bahsetmelerini ayırır. */
export function isMentionNotification(payload: unknown): payload is { type: "MENTION" } {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "type" in payload &&
    payload.type === "MENTION"
  );
}

/**
 * Sayfaları yerinde yamalar. Okundu işaretlemek listeyi baştan çekmez: yeniden çekme, ekranı
 * kullanıcının bulunduğu yerden koparan bir kaydırma sıçraması demek.
 */
export function patchMentionInPages(
  current: MentionPages | undefined,
  mentionId: string,
  patch: Partial<Pick<Mention, "readLater" | "unread">>,
): MentionPages | undefined {
  if (!current) {
    return current;
  }

  return {
    ...current,
    pages: current.pages.map((page) => ({
      ...page,
      items: page.items.map((item) => (item.id === mentionId ? { ...item, ...patch } : item)),
    })),
  };
}

/** `Listeden kaldır` ve `mention:state` (`dismissed`) — kart akıştan düşer, mesaj silinmez. */
export function removeMentionFromPages(
  current: MentionPages | undefined,
  mentionId: string,
): MentionPages | undefined {
  if (!current) {
    return current;
  }

  if (!current.pages.some((page) => page.items.some((item) => item.id === mentionId))) {
    return current;
  }

  return {
    ...current,
    pages: current.pages.map((page) => ({
      ...page,
      total: Math.max(0, page.total - 1),
      items: page.items.filter((item) => item.id !== mentionId),
    })),
  };
}

/**
 * Canlı gelen kart ilk sayfanın başına girer.
 *
 * Kimlik zaten listedeyse **eklenmez**: aynı bahsetmenin iki kez görünmesi, iki bahsetme
 * geldiği anlamına gelirdi. Sayfa yoksa hiçbir şey yapılmaz — ilk çekme zaten kartı getirecek.
 */
export function prependMentionToPages(
  current: MentionPages | undefined,
  mention: Mention,
): MentionPages | undefined {
  if (!current || current.pages.length === 0) {
    return current;
  }

  if (current.pages.some((page) => page.items.some((item) => item.id === mention.id))) {
    return current;
  }

  return {
    ...current,
    pages: current.pages.map((page, index) => ({
      ...page,
      total: page.total + 1,
      items: index === 0 ? [mention, ...page.items] : page.items,
    })),
  };
}

/** `mention:read-all` — sunucu hepsini okudu, liste onu yansıtır. */
export function markAllMentionPagesRead(
  current: MentionPages | undefined,
): MentionPages | undefined {
  if (!current) {
    return current;
  }

  return {
    ...current,
    pages: current.pages.map((page) => ({
      ...page,
      items: page.items.map((item) => (item.unread ? { ...item, unread: false } : item)),
    })),
  };
}

/**
 * Başlık pilinin sayısı. Sekmeler dört filtreyi sayıyor; ray iki filtre daha sürüyor
 * (`Bana özel`, `Thread yanıtları`) ve başlık onlarda da bir sayı göstermek zorunda.
 */
export function readMentionFilterCount(counts: MentionCounts, filter: MentionFilter): number {
  if (filter === "me") {
    return counts.me;
  }

  if (filter === "thread") {
    return counts.thread;
  }

  return readMentionTabCount(
    counts,
    (MENTION_TABS.find((tab) => tab.filter === filter)?.id ?? "all") as MentionTabId,
  );
}

/** Başlık pili, etkin filtre + kaynak + aramanın sunucudan dönen kesin toplamıdır. */
export function readMentionHeaderCount(
  page: MentionListResponse | null | undefined,
): number | null {
  return page?.total ?? null;
}

/**
 * Boş durumun hangi metni yazacağı. Tam metin ("Son 30 günün bahsetmelerini okudun") yalnız
 * daraltılmamış görünümde doğru; süzgeçliyken aynı cümle, filtreyi unutmuş bir kullanıcıya
 * yanlış bilgi verirdi (PROMPT §6).
 */
export function isFilteredMentionView(route: MentionsRouteState): boolean {
  // `window` **daraltma değil**: `MentionWindowSchema` iki değer taşıyor ve `all` ikisinin
  // genişi. Boş durumun birincil butonu (`Arşive dön`) tam da oraya götürüyor; pencereyi
  // daraltma saymak, hiçbir süzgeç uygulamamış kullanıcıya "Bu daraltmada bekleyen bahsetme
  // yok" demek olurdu — üstelik kaldıracağı bir süzgeç ekranda görünmeden.
  return route.filter !== "all" || route.source !== null || route.query !== null;
}

/** Ş6'nın kartı. Slot yalnız testte değiştirilir; üretimde her zaman bu çizilir. */
const renderMentionCardDefault: MentionCardRenderer = (cardProps) => <MentionCard {...cardProps} />;

export function MentionsPage({
  renderCard,
  renderContextPanel,
  renderReply,
  renderSettingsModal,
}: MentionsPageProps) {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const socket = useSocket();
  const now = useMinuteClock();
  const { formatTime, preferences } = useAccountPreferenceRuntime();
  const { currentUser: authenticatedUser, uploadthingEnabled } = useAuthenticatedAppRuntime();
  const { show } = useToast();

  const currentUser = useMemo(() => {
    const name = authenticatedUser.displayName;
    return {
      avatarUrl: authenticatedUser.avatarUrl,
      initials: name ? toInitials(name) : "?",
      name,
    };
  }, [authenticatedUser.avatarUrl, authenticatedUser.displayName]);

  /**
   * `?panel=` ham geliyor (Ş0.3 onu bir bahsetme kimliği olarak doğrulamıyor). Elle yazılmış
   * `?panel=` ya da `?panel=abc` gibi bir adres, arkasında hiçbir bahsetme olmayan bir panel
   * açar ve başlıktaki iki ikon butonunu boşuna kaldırırdı. Kimlik `parseMentionId` ile
   * doğrulanır — çözülmeyen değer panel yok demektir.
   */
  const routeState = useMemo((): MentionsRouteState => {
    const parsed = parseMentionsRouteState(searchParams);

    return parseMentionId(parsed.panel) ? parsed : { ...parsed, panel: null };
  }, [searchParams]);

  const [ui, dispatch] = useReducer(mentionsUiReducer, MENTIONS_UI_INITIAL_STATE);

  // Adres → indirgeyici. Geri tuşu, paylaşılan bağlantı ve rayın "paneli düşür" kararı
  // buradan geçer; bileşenler adresi ve state'i ayrı ayrı güncellemez.
  useEffect(() => {
    if (routeState.panel !== ui.panel) {
      dispatch({ id: routeState.panel ?? ui.panel ?? "", type: "togglePanel" });
    }
  }, [routeState.panel, ui.panel]);

  useEffect(() => {
    if (routeState.settingsOpen !== ui.settingsOpen) {
      dispatch({ type: routeState.settingsOpen ? "openSettings" : "closeSettings" });
    }
  }, [routeState.settingsOpen, ui.settingsOpen]);

  const listKey = useMemo(
    () =>
      mentionsQueryKeys.list({
        filter: routeState.filter,
        query: routeState.query,
        source: routeState.source,
        window: routeState.window,
      }),
    [routeState.filter, routeState.query, routeState.source, routeState.window],
  );

  const countsKey = useMemo(() => mentionsQueryKeys.counts(routeState.window), [routeState.window]);

  // Ray ile aynı anahtar ve aynı çağrı: iki yüzey tek istek paylaşır ve aynı anda değişir
  // (PROMPT §3 — bütün piller tek sorgudan).
  const countsQuery = useQuery({
    queryFn: () => fetchMentionCounts(routeState.window),
    queryKey: countsKey,
    refetchOnWindowFocus: false,
    staleTime: MENTIONS_STALE_TIME_MS.counts,
  });

  const listQuery = useInfiniteQuery<
    MentionListResponse,
    Error,
    MentionPages,
    typeof listKey,
    string | undefined
  >({
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined,
    queryFn: ({ pageParam }) =>
      fetchMentions({
        filter: routeState.filter,
        limit: PAGE_SIZE,
        query: routeState.query,
        source: routeState.source,
        window: routeState.window,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    queryKey: listKey,
    staleTime: MENTIONS_STALE_TIME_MS.list,
  });

  const items = useMemo(
    () => listQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [listQuery.data],
  );
  const firstPage = listQuery.data?.pages[0] ?? null;

  const dmLabel = t("mentions.sidebar.dmSource");
  /**
   * `preferences.timeZone` **ham tercih**: `"SYSTEM"` gibi bir yer tutucu ya da `null`
   * olabiliyor ve `Intl.DateTimeFormat` onu tanımıyor. Gruplama eşikleri izleyicinin takvim
   * gününde hesaplanacaksa çözülmüş IANA kimliği gerekiyor; sözlük tarafı (`formatTime`) zaten
   * aynı çözümden geçiyor, gruplama da geçmeli.
   */
  const timeZone = resolveAccountTimeZone(preferences.timeZone);
  const groups = useMemo(
    () =>
      groupMentions(items, {
        dmLabel,
        grouping: routeState.grouping,
        now,
        timeZone,
      }),
    [dmLabel, items, now, routeState.grouping, timeZone],
  );

  /**
   * Bekleyen "yeni bahsetme" sayısı **hangi listeye ait olduğuyla birlikte** tutulur.
   *
   * Süzgeç değiştiğinde sayı anlamını kaybeder — şerit artık görünmeyen bir listeyi
   * anlatıyor olurdu. Sıfırlamayı bir efektle yapmak, her filtre değişiminde fazladan bir
   * render turu demekti; anahtarı sayının yanında taşımak aynı işi render sırasında bitiriyor.
   */
  const listKeyId = JSON.stringify(listKey);
  const [pendingNew, setPendingNew] = useState({ count: 0, key: listKeyId });
  const newCount = pendingNew.key === listKeyId ? pendingNew.count : 0;

  const atTopRef = useRef(true);
  const routeRef = useRef(routeState);
  const listKeyRef = useRef(listKey);
  const countsKeyRef = useRef(countsKey);
  const listKeyIdRef = useRef(listKeyId);

  useEffect(() => {
    routeRef.current = routeState;
    listKeyRef.current = listKey;
    countsKeyRef.current = countsKey;
    listKeyIdRef.current = listKeyId;
  }, [countsKey, listKey, listKeyId, routeState]);

  useEffect(() => {
    if (!socket) {
      return;
    }

    /**
     * Olayın taşıdığı sayaç **her zaman tüm zamanlar** kapsamlı: yayıncılar
     * (`mentions/[mentionId]/state` ve `mentions/read-all`) `countMentions`u pencere vermeden
     * çağırıyor. Ekranın anahtarı ise pencereli (`counts(window)`), varsayılanı `30d`.
     *
     * Bu yüzden yük yalnız pencere `all` iken doğrudan yazılıyor; `30d` görünümünde 30 günlük
     * anahtara tüm zamanların sayısını yazmak, ray pillerini ve başlık pilini sessizce
     * şişirirdi. O durumda sorgu geçersiz kılınıyor ve doğru sayı sunucudan geliyor.
     */
    const writeCounts = (counts: MentionCounts) => {
      if (routeRef.current.window === "all") {
        queryClient.setQueryData(countsKeyRef.current, counts);
      } else {
        void queryClient.invalidateQueries({ queryKey: countsKeyRef.current });
      }

      // Gezinme paneli rozeti `window=all` sayıyor (Ş3 §4); rozet kendi sorgusundan tazelenir.
      void queryClient.invalidateQueries({ queryKey: homeQueryKeys.summary });
    };

    const onNew = (payload: { counts: MentionCounts; mention: Mention }) => {
      writeCounts(payload.counts);

      if (!matchesMentionRoute(payload.mention, routeRef.current)) {
        return;
      }

      queryClient.setQueryData<MentionPages>(listKeyRef.current, (current) =>
        prependMentionToPages(current, payload.mention),
      );

      // En üstteyken kart doğrudan görünür; kaydırılmışken konum korunur ve şerit çıkar
      // (PROMPT §4). Telafiyi akış ölçerek yapıyor.
      if (!atTopRef.current) {
        setPendingNew((current) =>
          current.key === listKeyIdRef.current
            ? { count: current.count + 1, key: current.key }
            : { count: 1, key: listKeyIdRef.current },
        );
      }
    };

    // Kanal mesajı üreticileri bugün genel bildirim olayını yayımlıyor. Tam Mention DTO'su
    // taşınmadığı için listeyi ve sayaçları yetkili uçlardan yeniden oku.
    const onNotification = (payload: unknown) => {
      if (!isMentionNotification(payload)) {
        return;
      }

      void queryClient.invalidateQueries({ queryKey: listKeyRef.current });
      void queryClient.invalidateQueries({ queryKey: countsKeyRef.current });
      void queryClient.invalidateQueries({ queryKey: homeQueryKeys.summary });

      // Genel bildirim, aktif daraltmaya gerçekten uyup uymadığını söylemez. Yanlış bir şerit
      // göstermek yerine daraltılmış görünümü yalnız yeniden çekeriz.
      if (!atTopRef.current && !isFilteredMentionView(routeRef.current)) {
        setPendingNew((current) =>
          current.key === listKeyIdRef.current
            ? { count: current.count + 1, key: current.key }
            : { count: 1, key: listKeyIdRef.current },
        );
      }
    };

    const onState = (payload: {
      counts: MentionCounts;
      dismissed: boolean;
      mentionId: string;
      readLater: boolean;
      unread: boolean;
    }) => {
      writeCounts(payload.counts);
      queryClient.setQueryData<MentionPages>(listKeyRef.current, (current) =>
        payload.dismissed
          ? removeMentionFromPages(current, payload.mentionId)
          : patchMentionInPages(current, payload.mentionId, {
              readLater: payload.readLater,
              unread: payload.unread,
            }),
      );
    };

    const onReadAll = (payload: { counts: MentionCounts }) => {
      writeCounts(payload.counts);
      queryClient.setQueryData<MentionPages>(listKeyRef.current, markAllMentionPagesRead);
    };

    socket.on("mention:new", onNew);
    socket.on("notification:new", onNotification);
    socket.on("mention:state", onState);
    socket.on("mention:read-all", onReadAll);

    return () => {
      socket.off("mention:new", onNew);
      socket.off("notification:new", onNotification);
      socket.off("mention:state", onState);
      socket.off("mention:read-all", onReadAll);
    };
  }, [queryClient, socket]);

  /**
   * Durum yazımı iyimser: kullanıcı `Okundu işaretle`ye bastığında kartın beklemesi için bir
   * sebep yok. İstek düşerse önceki sayfa geri konur — yarım kalmış bir iyimserlik, olmayan
   * bir durumu kalıcı göstermek demek.
   */
  const stateMutation = useMutation<
    Mention,
    Error,
    { mentionId: string; patch: MentionStateRequest },
    { previous: MentionPages | undefined }
  >({
    mutationFn: (input) => updateMentionState(input.mentionId, input.patch),
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(listKeyRef.current, context.previous);
      }
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: listKeyRef.current });
      const previous = queryClient.getQueryData<MentionPages>(listKeyRef.current);

      queryClient.setQueryData<MentionPages>(listKeyRef.current, (current) => {
        if (input.patch.dismissed) {
          return removeMentionFromPages(current, input.mentionId);
        }

        return patchMentionInPages(current, input.mentionId, {
          ...(input.patch.read === undefined ? {} : { unread: !input.patch.read }),
          ...(input.patch.readLater === undefined ? {} : { readLater: input.patch.readLater }),
        });
      });

      return { previous };
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: countsKeyRef.current });
      void queryClient.invalidateQueries({ queryKey: homeQueryKeys.summary });
    },
  });

  const muteMutation = useMutation({
    mutationFn: (mention: Mention) =>
      mention.source.type === "channel"
        ? // K12 — süresiz sessize alma; alt menü tasarımı yok, tek satır.
          updateChannelNotificationSettings(mention.source.channelId, "muted").then(() => undefined)
        : setDMConversationMutedRequest(mention.source.conversationId, true).then(() => undefined),
  });

  /**
   * Adres yazımı **render kapsamındaki** durumdan okur, `ref`ten değil: bu geri çağrı bağlam
   * paneline ve modala render sırasında veriliyor ve bir `ref`i render sırasında okumak,
   * React'in bileşeni güncellemesi gerektiğini görememesi demek.
   */
  const pushRoute = useCallback(
    (next: Partial<MentionsRouteState>) => {
      router.push(buildMentionsHref({ ...routeState, ...next }), { scroll: false });
    },
    [routeState, router],
  );

  const handleOpen = useCallback(
    (mention: Mention) => {
      if (mention.unread) {
        stateMutation.mutate({ mentionId: mention.id, patch: { read: true } });
      }

      router.push(mention.href);
    },
    [router, stateMutation],
  );

  const handleToggleRead = useCallback(
    (mention: Mention) => {
      stateMutation.mutate({ mentionId: mention.id, patch: { read: mention.unread } });
    },
    [stateMutation],
  );

  const handleReply = useCallback((mention: Mention) => {
    dispatch({ id: mention.id, type: "toggleReply" });
  }, []);

  const handleContext = useCallback(
    (mention: Mention) => {
      // Panel adreste duruyor (SPEC §2): bir bahsetmenin bağlamı paylaşılabilir bir görünüm.
      pushRoute({ panel: routeState.panel === mention.id ? null : mention.id });
    },
    [pushRoute, routeState.panel],
  );

  const handleMenuToggle = useCallback((mention: Mention) => {
    dispatch({ id: mention.id, type: "toggleMenu" });
  }, []);

  const handleMenuAction = useCallback(
    (mention: Mention, action: MentionMenuAction) => {
      dispatch({ id: mention.id, type: "toggleMenu" });

      switch (action) {
        case "copy-link":
          void navigator.clipboard?.writeText(mention.permalink);
          show({ message: t("mentions.toast.linkCopied") });
          return;
        case "read-later":
          stateMutation.mutate({ mentionId: mention.id, patch: { readLater: true } });
          show({
            action: {
              label: t("mentions.toast.undo"),
              onAct: () =>
                stateMutation.mutate({ mentionId: mention.id, patch: { readLater: false } }),
            },
            message: t("mentions.toast.readLater"),
          });
          return;
        case "mute-source":
          muteMutation.mutate(mention);
          show({
            message:
              mention.source.type === "channel"
                ? t("mentions.toast.muted", { channel: mention.source.channelName })
                : t("mentions.toast.mutedConversation"),
          });
          return;
        case "dismiss":
          stateMutation.mutate({ mentionId: mention.id, patch: { dismissed: true } });
          // K12/K11 ile aynı duruş: geri alınabilir her eylem geri alma taşır. `dismissed`
          // yazımının tersi yine aynı uçtur, ayrı bir geri alma jetonu gerekmez.
          show({
            action: {
              label: t("mentions.toast.undo"),
              onAct: () =>
                stateMutation.mutate({ mentionId: mention.id, patch: { dismissed: false } }),
            },
            message: t("mentions.toast.removed"),
          });
      }
    },
    [muteMutation, show, stateMutation, t],
  );

  /**
   * `Esc` merdiveni indirgeyicinin kendisinden okunur (modal → menü → yanıt → panel). Sırayı
   * burada tekrar yazmak, iki yerde yaşayan ve bir gün ayrışacak bir kural demekti.
   */
  const handleClose = useCallback(() => {
    const next = mentionsUiReducer(ui, { type: "closeTransient" });

    if (next.settingsOpen !== ui.settingsOpen || next.panel !== ui.panel) {
      pushRoute({ panel: next.panel, settingsOpen: next.settingsOpen });
      return;
    }

    dispatch({ type: "closeTransient" });
  }, [pushRoute, ui]);

  const handleAtTopChange = useCallback((atTop: boolean) => {
    atTopRef.current = atTop;

    if (atTop) {
      // Kullanıcı tepeye vardı; şerit artık görülmüş bir şeyi duyuruyor olurdu.
      //
      // Guard şart: `handleScroll` tepe bandındaki **her** kaydırma olayında çağrılıyor ve
      // koşulsuz yeni bir nesne yazmak, sayı zaten sıfırken bile her olayda bir render turu
      // demekti (`Object.is` yeni nesneyi asla eski nesneye eşit görmez).
      setPendingNew((current) =>
        current.count === 0 && current.key === listKeyIdRef.current
          ? current
          : { count: 0, key: listKeyIdRef.current },
      );
    }
  }, []);

  /**
   * Bağımlılıklar **ilkel**: `useInfiniteQuery` her render'da yeni bir izlenen sonuç nesnesi
   * döndürüyor ve `[listQuery]` yazmak bu geri çağrının kimliğini her render'da değiştirirdi.
   * Akıştaki `IntersectionObserver` efekti ona bağlı; kimlik değişince gözlemci her render'da
   * sökülüp yeniden kuruluyor ve yeni gözlemci sentinel görüş alanındayken ilk kesişimi
   * **tekrar** bildiriyor — yani her render bir sayfa daha çekiyordu.
   */
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = listQuery;
  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const counts = countsQuery.data ?? null;

  const sourceTitle = useMemo(() => {
    if (!routeState.source) {
      return null;
    }

    if (routeState.source === MENTIONS_DM_SOURCE) {
      return dmLabel;
    }

    return firstPage?.sourceTitle ?? null;
  }, [dmLabel, firstPage?.sourceTitle, routeState.source]);

  const empty = !listQuery.isPending && !listQuery.isError && items.length === 0;
  const headerCount = readMentionHeaderCount(firstPage);

  const panelMention = ui.panel ? (items.find((item) => item.id === ui.panel) ?? null) : null;

  /**
   * `en yenisi {time}` listenin **ilk** kartından okunamaz: Ş3'ün sıralaması üç anahtarlı
   * (`readLaterFirst, occurredAt, mentionId`) ve `Sonra oku` işaretli eski bir kart listenin
   * başında durabilir. Başlıkta o kartın saatini yazmak, "en yenisi" cümlesini yalan yapardı.
   */
  const newestAt = useMemo(() => {
    let newest: string | null = null;
    let newestTime = Number.NEGATIVE_INFINITY;

    for (const item of items) {
      const time = new Date(item.createdAt).getTime();

      if (Number.isFinite(time) && time > newestTime) {
        newest = item.createdAt;
        newestTime = time;
      }
    }

    return newest;
  }, [items]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[hsl(var(--surface-base))]">
        <MentionsFeedHeader
          contextPanelOpen={ui.panel !== null}
          count={headerCount}
          counts={counts}
          empty={empty}
          formatTime={formatTime}
          newestAt={newestAt}
          routeState={routeState}
          title={sourceTitle ?? t("mentions.sidebar.title")}
        />

        <MentionsFeed
          cursor={ui.cursor}
          error={listQuery.isError}
          filtered={isFilteredMentionView(routeState)}
          groups={groups}
          hasNextPage={listQuery.hasNextPage}
          loading={listQuery.isPending}
          loadingMore={listQuery.isFetchingNextPage}
          menuId={ui.menu}
          newCount={newCount}
          onAtTopChange={handleAtTopChange}
          onClose={handleClose}
          onContext={handleContext}
          onCursorChange={(mentionId) => dispatch({ id: mentionId, type: "setCursor" })}
          onLoadMore={handleLoadMore}
          onMenuAction={handleMenuAction}
          onMenuToggle={handleMenuToggle}
          onOpen={handleOpen}
          onReply={handleReply}
          onRetry={() => {
            void listQuery.refetch();
          }}
          onShowNew={() => setPendingNew({ count: 0, key: listKeyId })}
          onToggleRead={handleToggleRead}
          panelId={ui.panel}
          renderCard={renderCard ?? renderMentionCardDefault}
          renderReply={(mention: Mention) => {
            const input = {
              mention,
              onClose: () => dispatch({ id: mention.id, type: "toggleReply" }),
              // Gönderim sonrası kart okundu sayılır (SPEC §5.2).
              onSent: () => {
                if (mention.unread) {
                  stateMutation.mutate({ mentionId: mention.id, patch: { read: true } });
                }
              },
            };

            return renderReply ? (
              renderReply(input)
            ) : (
              <MentionReplyBox
                currentUser={currentUser}
                uploadthingEnabled={uploadthingEnabled}
                {...input}
              />
            );
          }}
          replyId={ui.reply}
          routeState={routeState}
        />
      </div>

      {ui.panel
        ? (() => {
            const input = {
              mention: panelMention,
              mentionId: ui.panel,
              onClose: () => pushRoute({ panel: null }),
              onOpen: () => {
                if (panelMention?.unread) {
                  stateMutation.mutate({ mentionId: panelMention.id, patch: { read: true } });
                }
              },
              onReplyInThread: () => {
                if (panelMention) {
                  dispatch({ id: panelMention.id, type: "toggleReply" });
                }
              },
            };

            return renderContextPanel ? (
              renderContextPanel(input)
            ) : (
              <MentionContextPanel {...input} />
            );
          })()
        : null}

      {ui.settingsOpen
        ? (
            renderSettingsModal ??
            ((input: { onClose: () => void }) => <MentionSettingsModal onClose={input.onClose} />)
          )({ onClose: () => pushRoute({ settingsOpen: false }) })
        : null}
    </div>
  );
}
