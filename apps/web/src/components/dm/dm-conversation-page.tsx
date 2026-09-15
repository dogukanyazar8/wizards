"use client";

import { useEffect, useMemo, useReducer, useRef, type Dispatch } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  createInitialMessagesScreenState,
  reduceMessagesScreen,
  type ConversationMuteDuration,
  type ConversationToast,
  type MessagesScreenAction,
  type MessagesScreenState,
  type SetMutedRequest,
} from "@wizards/types";
import { ChatArea } from "@/components/chat/chat-area";
import { AddMembersModal } from "@/components/messages/add-members-modal";
import { ConversationMoreMenu } from "@/components/messages/conversation-more-menu";
import { ConversationProfilePanel } from "@/components/messages/conversation-profile-panel";
import {
  UNMUTE_REQUEST_BODY,
  muteRequestBody,
  resolveMutePillDuration,
} from "@/components/messages/mute-submenu";
import { useConversationToast } from "@/hooks/use-conversation-toast";
import { setConversationMutedRequest } from "@/lib/dm/conversation-settings-client";
import { groupProfileQueryKeys } from "@/lib/dm/group-profile-client";
import { dmProfileQueryKeys } from "@/lib/dm/profile-client";
import { useDMCallActions } from "@/components/providers/dm-call-provider";
import { useI18n } from "@/components/providers/locale-provider";
import { getGroupConversationTitle, isGroupConversation } from "@/lib/dm/group-presentation";
import { toMessagesPresence } from "@/lib/messages/rail-presentation";
import { useDMConversations } from "@/hooks/use-dm-conversations";
import { useBodyScrollLock, useResponsiveLayout } from "@/hooks/use-responsive-layout";
import {
  type DMConversationsInfiniteData,
  dmQueryKeys,
  fetchDMConversation,
  findOtherParticipant,
  upsertDMConversationPageData,
} from "@/lib/dm/client";

interface DMConversationPageProps {
  conversationId: string;
  currentUserDisplayName: string;
  currentUserId: string;
  currentUserUsername: string;
  uploadthingEnabled: boolean;
}

/**
 * K14 — ekran durumunun **tek** sahibi.
 *
 * Durum makinesi `key={conversationId}`'nin **üstünde** duruyor. İçerideki içerik
 * bileşeni her sohbette baştan kuruluyor (mesaj listesi ve bestekar eski sohbetin
 * kalıntısıyla açılmasın diye), ama SPEC §12 "panel durumu sohbet değişince
 * korunur" diyor — reducer aşağıda yaşasaydı açık profil paneli her sohbet
 * geçişinde kapanırdı.
 *
 * İki ad-hoc `useState` (`isDetailsDrawerRequested`, `searchRequestId`) buraya
 * katlandı: ikisi de panel yuvasının parçasıydı ve yuvanın geri kalanından ayrı
 * yaşamalarının tek sebebi reducer'ın hiç tüketilmemiş olmasıydı.
 */
export function DMConversationPage(props: DMConversationPageProps) {
  const [state, dispatch] = useReducer(
    reduceMessagesScreen,
    undefined,
    // Panel açık başlar: bugünkü davranış da buydu (geniş görünümde ayrıntı paneli
    // hep yerleşikti). Değişen tek şey artık kapatılabiliyor olması.
    () => createInitialMessagesScreenState({ panel: "profile", view: "dm" }),
  );

  return (
    <DMConversationPageContent
      {...props}
      dispatch={dispatch}
      key={props.conversationId}
      state={state}
    />
  );
}

function DMConversationPageContent({
  conversationId,
  currentUserDisplayName,
  currentUserId,
  currentUserUsername,
  dispatch,
  state,
  uploadthingEnabled,
}: DMConversationPageProps & {
  dispatch: Dispatch<MessagesScreenAction>;
  state: MessagesScreenState;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const redirectedRef = useRef(false);
  const markedAsReadRef = useRef<string | null>(null);
  const responsiveLayout = useResponsiveLayout();
  const { locale, t } = useI18n();
  const { startCall } = useDMCallActions();
  const { conversations, hideConversation, isLoading, markAsRead, markAsUnread } =
    useDMConversations(currentUserId, {
      autoMarkActiveAsRead: true,
    });

  const conversation = useMemo(
    () => conversations.find((item) => item.id === conversationId) ?? null,
    [conversationId, conversations],
  );
  /**
   * Açık sohbet **her zaman** tek konuşma ucundan çekiliyor.
   *
   * Liste kipi (`rosterMode: "row"`) katılımcı okumasını sınırlıyor ve
   * `onlineCount`'u hiç vermiyor: elli konuşmalık bir sayfa için 250 üyelik bir
   * roster taşımanın anlamı yok. Ama açık sohbetin başlığı üye sayacını, üye
   * listesi roster'ı ve rol çipleri rolleri istiyor — üçü de tam kaydı ister.
   *
   * Liste kaydı yine de ilk çizimde kullanılıyor (`?? conversation`), böylece
   * sohbet anında açılıyor ve tam kayıt gelince yerini alıyor.
   */
  const conversationQuery = useQuery({
    queryFn: () => fetchDMConversation(conversationId),
    queryKey: dmQueryKeys.conversation(conversationId),
    retry: false,
    staleTime: 30_000,
  });
  const activeConversation = conversationQuery.data ?? conversation ?? null;

  const otherParticipant = useMemo(
    () => (activeConversation ? findOtherParticipant(activeConversation, currentUserId) : null),
    [activeConversation, currentUserId],
  );
  // Faz 6 §19.2: a group has no counterpart, so the 1:1 panel's own guard
  // (`otherParticipant`) would hide the details surface entirely.
  const isGroup = Boolean(activeConversation && isGroupConversation(activeConversation));
  const conversationKind: "dm" | "group" = isGroup ? "group" : "dm";
  const viewerRole = activeConversation?.role ?? "MEMBER";

  /*
    Görünüm ekseni reducer'a bildirilir, çünkü `uyeler` sekmesini DM'de `genel`e
    çeviren kural orada yaşıyor. `isGroup` konuşma kaydı gelene kadar `false`;
    kayıt gelince tek bir geçiş olur, her render'da değil.
  */
  useEffect(() => {
    if (state.view !== conversationKind) {
      dispatch({ kind: conversationKind, type: "openConversation" });
    }
  }, [conversationKind, dispatch, state.view]);

  useEffect(() => {
    dispatch({ role: viewerRole, type: "setRole" });
  }, [dispatch, viewerRole]);

  useEffect(() => {
    if (isLoading || conversationQuery.isLoading || activeConversation || redirectedRef.current) {
      return;
    }

    redirectedRef.current = true;
    router.replace("/messages");
  }, [activeConversation, conversationQuery.isLoading, isLoading, router]);

  useEffect(() => {
    if (!conversationQuery.data) {
      return;
    }

    queryClient.setQueryData<DMConversationsInfiniteData | undefined>(dmQueryKeys.list, (current) =>
      upsertDMConversationPageData(current, conversationQuery.data),
    );
  }, [conversationQuery.data, queryClient]);

  useEffect(() => {
    if (!activeConversation || markedAsReadRef.current === activeConversation.id) {
      return;
    }

    markedAsReadRef.current = activeConversation.id;
    void markAsRead(activeConversation.id);
  }, [activeConversation, markAsRead]);

  const profileOpen = state.panel === "profile";
  const hasSubject = Boolean(otherParticipant || isGroup);
  const drawerOpen = state.detailsDrawerOpen && responsiveLayout.shouldMountInfoDrawer;
  const shouldShowDetailsDrawer = drawerOpen && hasSubject;
  useBodyScrollLock(shouldShowDetailsDrawer);

  const closeDrawer = () => dispatch({ type: "closeDetailsDrawer" });

  const startProfileCall = (video: boolean) => {
    if (!otherParticipant) {
      return;
    }

    void startCall({
      conversationId,
      peer: {
        avatarUrl: otherParticipant.avatarUrl ?? null,
        displayName: otherParticipant.displayName ?? null,
        id: otherParticipant.userId,
        username: otherParticipant.username,
      },
      video,
    });
  };

  /*
    Panelin ortak prop'ları: yerleşik kolon ile dar görünümün çekmecesi **aynı**
    bileşeni çiziyor ve yalnız kapatma hedefiyle `overlay` bayrağında ayrılıyorlar.
    İki ayrı çağrı yazılsaydı bir sonraki prop yalnız birine eklenirdi.
  */
  /*
    §17. Alt menü açıkken `state.menu.kind` `"muteSubmenu"` olur ve menünün kendisi
    hâlâ ekrandadır — yalnız `"conversationMore"`a bakan bir bayrak, alt menü açıldığı
    anda menüyü kapatırdı.
  */
  const moreOpen = state.menu?.kind === "conversationMore" || state.menu?.kind === "muteSubmenu";
  const toastController = useConversationToast({ dispatch, toast: state.toast });
  const mutePillDuration = resolveMutePillDuration(
    { muted: state.muted, mutedUntil: state.mutedUntil },
    new Date(),
  );

  /*
    Sessizlik tek mutasyondan geçiyor: pill, alt menü ve gövde kurucusu (`muteRequestBody`)
    aynı yolu paylaşıyor. `Süresiz`in `{ duration: "forever", muted: true }` olduğu tek
    yerde yazılı, burada ikinci kez kurulmuyor.
  */
  /*
    Menü başlığı `ChatArea`'nın çizdiği başlıkla aynı adı taşımalı — iki farklı ad,
    aynı sohbetin iki farklı yerde başka türlü anılması demek. Grup adı aynı yardımcıdan
    türetiliyor; 1:1'de karşı tarafın görünen adı.
  */
  const menuTitle = isGroup
    ? getGroupConversationTitle(
        activeConversation ?? { name: null, participants: [] },
        currentUserId,
        t("dm.sidebar.unknownUser"),
        locale,
      )
    : (otherParticipant?.displayName ?? otherParticipant?.username ?? conversationId);

  const setMuted = useMutation({
    mutationFn: (body: SetMutedRequest) => setConversationMutedRequest(conversationId, body),
    onError: () => toastController.show({ kind: "actionFailed", tone: "danger" }),
    onSuccess: (result, body) => {
      dispatch({ muted: result.muted, mutedUntil: result.mutedUntil, type: "setMute" });
      /*
        Sessizlik `notifyLevel` ile ikizdir (tuzak 5) ve profil panelinin `Ayarlar`
        sekmesi bildirim radyosunu o alandan okuyor. Tazelenmezse başlıktaki pill
        yeni durumu, radyo eskisini gösterir — aynı ekranda iki farklı cevap.
      */
      void queryClient.invalidateQueries({
        queryKey: isGroup
          ? groupProfileQueryKeys.panel(conversationId)
          : dmProfileQueryKeys.profile(conversationId),
      });
      toastController.show(
        body.muted === false
          ? { kind: "muteCleared", tone: "success" }
          : body.duration === "forever" || body.duration === undefined
            ? { kind: "mutedForever", tone: "success" }
            : { kind: "mutedFor", params: { duration: body.duration }, tone: "success" },
      );
    },
  });

  /*
    §17'nin `Okunmadı olarak işaretle` ve `Arşivle` satırları. İkisi de **mevcut**
    mutasyonlar (`useDMConversations`); menü kendi istemcisini açmıyor, sohbet rayının
    satır menüsüyle aynı yolu paylaşıyor — ikinci bir yol, aynı sohbet için iki farklı
    okunmamış sayacı demekti.

    `markedAsReadRef` bu sohbet için zaten dolu, o yüzden otomatik okundu işaretleyici
    yeniden koşmuyor ve satır bir tıkta geri alınmıyor.

    Arşivleme sohbeti raydan düşürür; sayfa **açık kalırsa** kullanıcı artık listede
    olmayan bir sohbete bakar. Konuşma sorgusunun önbelleği hâlâ dolu olduğu için
    aşağıdaki `!activeConversation` yönlendirmesi tetiklenmez — çıkış burada, eylemin
    kendi başarı dalında yapılıyor.
  */
  const markConversationUnread = () => {
    void markAsUnread(conversationId).then(
      () => toastController.show({ kind: "markedUnread", tone: "success" }),
      () => toastController.show({ kind: "actionFailed", tone: "danger" }),
    );
  };

  const archiveConversation = () => {
    void hideConversation(conversationId).then(
      () => {
        toastController.show({ kind: "archived", tone: "success" });
        redirectedRef.current = true;
        router.replace("/messages");
      },
      () => toastController.show({ kind: "actionFailed", tone: "danger" }),
    );
  };

  const profilePanelProps = {
    conversationId,
    // §16'nın modalı Ş10'da geliyor; eksen bugünden reducer'da yaşıyor, böylece
    // modal geldiğinde bağlanacağı yer yeni bir `useState` olmuyor (K14).
    onAddMembers: () => dispatch({ modal: { kind: "invite" as const }, type: "openModal" }),
    onSelectTab: (tab: MessagesScreenState["profileTab"]) =>
      dispatch({ tab, type: "setProfileTab" }),
    onStartVideoCall: () => startProfileCall(true),
    onStartVoiceCall: () => startProfileCall(false),
    // §17'nin şeridi Ş9'un; toast durumu şimdiden reducer'a düşüyor.
    onToast: (toast: ConversationToast) => dispatch({ toast, type: "showToast" }),
    variant: conversationKind,
  };

  if ((isLoading || conversationQuery.isLoading) && !activeConversation) {
    return (
      <div className="flex flex-1 items-center justify-center text-app-muted">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!activeConversation) {
    return null;
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {shouldShowDetailsDrawer && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-x-0 bottom-0 top-[var(--app-viewport-top,0px)] z-[90] xl:hidden"
              data-testid="dm-details-drawer-root"
            >
              <div
                className="absolute inset-0 bg-[hsl(var(--backdrop)/0.5)] backdrop-blur-xs"
                data-testid="dm-details-drawer-backdrop"
                onClick={closeDrawer}
                role="presentation"
              />
              {/*
                Sarmalayıcı artık yalnız konumlandırıyor. `role="dialog"`,
                `aria-modal`, focus tuzağı, `Esc` ve açılışta odak panelin ortak
                kabuğundan geliyor (`overlay`); ikisi birden diyalog olsaydı ekran
                okuyucu iç içe iki modal duyururdu.
              */}
              <div
                className="absolute inset-y-0 right-0 flex max-w-full overflow-hidden"
                data-testid="dm-details-drawer"
              >
                <ConversationProfilePanel
                  {...profilePanelProps}
                  onClose={closeDrawer}
                  onSendMessage={closeDrawer}
                  overlay
                  tab={state.profileTab}
                />
              </div>
            </div>,
            document.body,
          )
        : null}

      <div className="min-w-0 flex-1">
        <ChatArea
          conversationId={activeConversation.id}
          mode="dm"
          currentUserId={currentUserId}
          currentUserDisplayName={currentUserDisplayName}
          currentUserUsername={currentUserUsername}
          canModerate={false}
          directMessageConversation={activeConversation}
          directMessageParticipant={otherParticipant}
          directMessageSearchRequestId={state.searchRequestId}
          onSidePanelOpen={() => dispatch({ type: "closePanel" })}
          sidePanelCloseRequestId={state.sidePanelCloseRequestId}
          conversationMoreOpen={moreOpen}
          conversationMuted={state.muted}
          conversationMutedUntil={state.mutedUntil}
          conversationToast={state.toast}
          onDismissConversationToast={toastController.dismiss}
          onUnmuteConversation={() => setMuted.mutate(UNMUTE_REQUEST_BODY)}
          conversationMoreMenu={
            <ConversationMoreMenu
              avatarColor={activeConversation.avatarColor ?? null}
              avatarUrl={otherParticipant?.avatarUrl ?? null}
              handle={otherParticipant?.username ?? null}
              memberCount={activeConversation.memberCount ?? activeConversation.participants.length}
              muteDuration={mutePillDuration}
              muteSubmenuOpen={state.menu?.kind === "muteSubmenu"}
              name={menuTitle}
              onAddMembers={() =>
                dispatch({ modal: { kind: "invite" as const }, type: "openModal" })
              }
              onArchive={archiveConversation}
              onClose={() => dispatch({ type: "closeMenu" })}
              onMarkUnread={markConversationUnread}
              onOpenProfile={(tab) => dispatch({ tab, type: "openProfile" })}
              onSelectMuteDuration={(duration: ConversationMuteDuration) =>
                setMuted.mutate(muteRequestBody(duration))
              }
              onToggleMuteSubmenu={() => dispatch({ type: "openMuteSubmenu" })}
              open={moreOpen}
              /*
                §17 DM alt satırı `@selin · Çevrimiçi`. Prop verilmezse bileşen
                `offline`a düşer ve menü, başlığın yanı başında **çevrimiçi** yazan
                birini `Çevrimdışı` diye tanıtırdı. Dönüşüm sohbet rayıyla aynı
                yardımcıdan; ikinci bir eşleme iki yüzeyi ayırırdı.
              */
              presence={toMessagesPresence(otherParticipant?.status)}
              role={viewerRole}
              variant={conversationKind}
            />
          }
          onOpenDirectMessageDetails={
            responsiveLayout.shouldMountInfoDrawer
              ? // Menü 254/262 genişliğinde bir masaüstü yüzeyi; dar görünümün cevabı
                // çekmecedir, o dal korunuyor.
                () => dispatch({ type: "openDetailsDrawer" })
              : () => dispatch({ menu: { kind: "conversationMore" }, type: "openMenu" })
          }
          uploadthingEnabled={uploadthingEnabled}
        />
      </div>

      {/*
        Yerleşik kolon yalnız geniş görünümde. Eşik CSS'te değil burada, çünkü
        `xl:hidden` ile saklanan bir panel yine de **çizilir** — ve çizildiği anda
        seçili sekmenin sorgusu koşar. Dar görünümde aynı veriyi bir de çekmece
        çekerdi (kural 7).
      */}
      {profileOpen && hasSubject && !responsiveLayout.shouldMountInfoDrawer ? (
        <ConversationProfilePanel
          {...profilePanelProps}
          onClose={() => dispatch({ type: "closePanel" })}
          onSendMessage={() => dispatch({ type: "closePanel" })}
          tab={state.profileTab}
        />
      ) : null}

      {/*
        §16. Üç tetikleyici (profil başlığı, Üyeler sekmesi, grup menüsü) aynı eksene
        yazıyor, o yüzden modal burada **bir kez** çiziliyor. Yalnız grupta anlamı var:
        bir 1:1 DM'e üye eklenmez.
      */}
      {isGroup ? (
        <AddMembersModal
          conversationId={activeConversation.id}
          expiry={state.inviteLinkExpiry}
          onAdded={() => dispatch({ type: "closeModal" })}
          onClearSelection={() => dispatch({ type: "clearInviteSelection" })}
          onClose={() => dispatch({ type: "closeModal" })}
          onSelectExpiry={(expiry) => dispatch({ expiry, type: "setInviteLinkExpiry" })}
          onToast={toastController.show}
          onToggleSelection={(userId) => dispatch({ type: "toggleInviteSelection", userId })}
          open={state.modal?.kind === "invite"}
          selection={state.inviteSelection}
        />
      ) : null}
    </div>
  );
}
