"use client";

import React, { useEffect, useRef, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { normalizeProfileTab, type ConversationToast, type ProfilePanelTab } from "@wizards/types";

import { MessagesSidePanel } from "@/components/messages/messages-side-panel";
import { ProfilePanelIdentity } from "@/components/messages/profile-panel-identity";
import {
  ProfilePanelTabs,
  profileTabButtonId,
  type ProfilePanelVariant,
} from "@/components/messages/profile-panel-tabs";
import { ProfileTabGeneral } from "@/components/messages/profile-tab-general";
import { ProfileTabMedia } from "@/components/messages/profile-tab-media";
import {
  ProfileTabMembers,
  type ProfileTabProps as SharedProfileTabProps,
} from "@/components/messages/profile-tab-members";
import { ProfileTabSettings } from "@/components/messages/profile-tab-settings";
import { useI18n } from "@/components/providers/locale-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchGroupProfilePanel, groupProfileQueryKeys } from "@/lib/dm/group-profile-client";
import {
  DM_PROFILE_PANEL_STALE_TIME_MS,
  dmProfilePanelQueryOptions,
} from "@/lib/dm/profile-client";
import { MESSAGES_METRICS, pxToRem } from "@/lib/messages/metrics";

/**
 * Profil paneli — SPEC-MESAJLAR §15. K4'ün tek yüzeyi.
 *
 * Önce üç panel vardı (`DmDetailsPanel`, `DmGroupDetailsPanel`,
 * `DmGroupSettingsPanel`) ve üçü de aynı sağ kolonda, aynı sohbet için, birbirinden
 * habersiz çiziliyordu; grup ayarları panelinin grup ayrıntı panelinin **içine**
 * `children` olarak gömülmesi bunun en görünür belirtisiydi. Tek panel, dört sekme.
 *
 * **Kabuk paylaşılıyor** (K5): `MessagesSidePanel` başlığı, `Esc`'i, focus tuzağını
 * ve odak dönüşünü zaten taşıyor; profil ondan yalnız genişlikte ayrılıyor
 * (`variant="profile"` → 330, thread ve arama 340'ta kalıyor).
 *
 * **Sekme gövdeleri tembel** (kural 7). Seçili olmayan sekme hiç render edilmez,
 * dolayısıyla sorgusu da kurulmaz. Kural bileşen sınırında duruyor, bir `enabled`
 * bayrağında değil: dört gövdeyi birden çizip üçünü `display:none` ile saklamak
 * paneli her açılışta dört uca birden çıkardı.
 */

const { profilePanel } = MESSAGES_METRICS;

/**
 * Kaydıran gövdenin `id`'si. Sabit, çünkü `aria-controls` dört sekmeden de **aynı**
 * öğeye bakar: gövde tek bir kutudur ve içeriği değişir. Sekme başına ayrı bir
 * `tabpanel` kimliği üretilseydi seçili olmayan üçünün `aria-controls` değeri
 * DOM'da karşılığı olmayan bir kimliği gösterirdi.
 */
export const PROFILE_PANEL_BODY_ID = "conversation-profile-panel-body";

/**
 * Dört sekme gövdesinin **ortak** prop şekli (Ş6/Ş7/Ş8 sözleşmesi):
 * `{ conversationId, variant, onToast?, onAddMembers?, onSelectMember? }`.
 *
 * Taban `profile-tab-members`'tan alınıyor, yeniden tanımlanmıyor: aynı şekli dört
 * dosyada dört kez yazmak, altıncı bir alan eklendiğinde üç dosyanın sessizce eski
 * şekilde kalması demek. Medya sekmesi de aynı kaynaktan okuyor.
 *
 * İki kanca **burada** ekleniyor, çünkü ikisi de panelin bilgisi:
 * `onAddMembers` §16'nın modalını açar (Ş10) ve `onSelectMember` paneli o kişinin
 * profiline çevirir. Üyeler sekmesi `Üye ekle` düğmesini yetkiye göre çiziyor,
 * kancanın varlığına göre **değil** — yani kanca iletilmezse düğme çizilir ama
 * hiçbir şey yapmaz. Sözleşmenin dört sekmeye de aynı gitmesi bunun tekrarını
 * engelliyor.
 *
 * Panel gövdelere veri **geçirmez**; her sekme kendi sorgusunu kendi kurar. Panel
 * verinin de sahibi olsaydı "seçilmeyen sekmenin sorgusu koşmaz" kuralı panelin
 * içinde bir `if` yığınına dönerdi ve ilk eklenen beşinci sekmede unutulurdu.
 */
export type ProfileTabProps = SharedProfileTabProps & {
  onAddMembers?: (() => void) | undefined;
  onSelectMember?: ((userId: string) => void) | undefined;
};

const TAB_BODY: Readonly<Record<ProfilePanelTab, ComponentType<ProfileTabProps>>> = Object.freeze({
  ayarlar: ProfileTabSettings,
  genel: ProfileTabGeneral,
  medya: ProfileTabMedia,
  uyeler: ProfileTabMembers,
});

export type ConversationProfilePanelProps = {
  conversationId: string;
  /** §16'nın üye ekle modalı — Dalga 3 Ş10 bağlayacak. */
  onAddMembers?: (() => void) | undefined;
  onClose: () => void;
  /**
   * §15.4'ün üye satırı — panel o kişinin profiline çevrilir. Bağlanmazsa satırlar
   * tıklanabilir **çizilmez** (Ş7'nin sözleşmesi), ölü bir hedef bırakılmaz.
   */
  onSelectMember?: ((userId: string) => void) | undefined;
  onSelectTab: (tab: ProfilePanelTab) => void;
  onSendMessage?: (() => void) | undefined;
  onStartVideoCall?: (() => void) | undefined;
  onStartVoiceCall?: (() => void) | undefined;
  onToast?: ((toast: ConversationToast) => void) | undefined;
  onToggleMute?: (() => void) | undefined;
  /** `true` ise panel ana alanın üstünde duruyor (dar görünüm). */
  overlay?: boolean;
  tab: ProfilePanelTab;
  variant: ProfilePanelVariant;
};

/**
 * Kimlik bloğunun üç hâli. Ayrı bir isim, çünkü **sıra** bir karardır: elde veri
 * varken arkadan gelen bir yenileme hatası paneli hataya düşürmez. Kullanıcının
 * ekranında duran ad ve avatar bir anlığına ağ koptu diye "Profil yüklenemedi"ye
 * dönseydi, hiçbir şey kazanmadan çalışan bir yüzey kaybedilirdi.
 */
export type ProfileIdentityState = "error" | "loading" | "ready";

export function resolveProfileIdentityState(input: {
  hasProfile: boolean;
  isError: boolean;
}): ProfileIdentityState {
  if (input.hasProfile) {
    return "ready";
  }

  return input.isError ? "error" : "loading";
}

/** Kimlik okunamadığında kimlik bloğunun yerini alan tek satır. Panel ayakta kalır. */
export function ProfileIdentityError() {
  const { t } = useI18n();

  return (
    <p
      className="shrink-0 text-center text-[hsl(var(--text-muted))]"
      data-testid="profile-panel-error"
      style={{
        fontSize: pxToRem(profilePanel.aboutFontSize),
        padding: `${pxToRem(profilePanel.identityPaddingTop)} ${pxToRem(profilePanel.identityPaddingX)}`,
      }}
    >
      {t("messages.profile.error.load")}
    </p>
  );
}

function IdentitySkeleton() {
  return (
    <div
      className="flex shrink-0 flex-col items-center"
      data-testid="profile-panel-identity-skeleton"
      style={{
        gap: pxToRem(profilePanel.identityGap),
        padding: `${pxToRem(profilePanel.identityPaddingTop)} ${pxToRem(profilePanel.identityPaddingX)} ${pxToRem(profilePanel.identityPaddingBottom)}`,
      }}
    >
      <Skeleton
        className="rounded-full"
        style={{
          height: pxToRem(profilePanel.dmTileSize),
          width: pxToRem(profilePanel.dmTileSize),
        }}
      />
      {/* Genişlik oransal: ada ne kadar yer ayrıldığı bir ölçü değil, bir tahmin. */}
      <Skeleton className="w-1/2" style={{ height: pxToRem(profilePanel.nameFontSize) }} />
      <Skeleton className="w-full" style={{ height: pxToRem(profilePanel.actionHeight) }} />
    </div>
  );
}

export function ConversationProfilePanel({
  conversationId,
  onAddMembers,
  onClose,
  onSelectMember,
  onSelectTab,
  onSendMessage,
  onStartVideoCall,
  onStartVoiceCall,
  onToast,
  onToggleMute,
  overlay = false,
  tab,
  variant,
}: ConversationProfilePanelProps) {
  const { t } = useI18n();
  const bodyRef = useRef<HTMLDivElement>(null);
  const isGroup = variant === "group";
  /*
    Reducer `uyeler`i DM'de zaten `genel`e çeviriyor; buradaki ikinci geçiş bir
    güvenlik kemeri: paneli reducer'sız çizen bir çağıran (test, Storybook, ileride
    bir başka yüzey) DM'de var olmayan bir sekmeyi isteyebilir ve sonuç boş bir
    gövde olurdu.
  */
  const activeTab = normalizeProfileTab(tab, variant);

  const dmProfile = useQuery(dmProfilePanelQueryOptions(conversationId, !isGroup));
  const groupProfile = useQuery({
    enabled: isGroup && conversationId.length > 0,
    queryFn: () => fetchGroupProfilePanel(conversationId),
    queryKey: groupProfileQueryKeys.panel(conversationId),
    // Kimlik bloğu ile Genel sekmesi **aynı** kaydı okuyor; iki tazelik penceresi
    // aynı panelde iki farklı anda yenilenen iki başlık demek olurdu.
    staleTime: DM_PROFILE_PANEL_STALE_TIME_MS,
  });

  /*
    §10: gövde sekme değişince başa döner. Kaydırma konumu sekmenin değil kutunun
    özelliği olduğu için, `Medya`da 400px aşağıdayken `Ayarlar`a geçen biri o
    sekmenin ortasına düşerdi.
  */
  useEffect(() => {
    const body = bodyRef.current;

    if (body) {
      body.scrollTop = 0;
    }
  }, [activeTab]);

  const identity = isGroup ? (
    groupProfile.data ? (
      <ProfilePanelIdentity
        onAddMembers={onAddMembers}
        onOpenSettings={() => onSelectTab("ayarlar")}
        onToggleMute={onToggleMute}
        profile={groupProfile.data}
        variant="group"
      />
    ) : null
  ) : dmProfile.data ? (
    <ProfilePanelIdentity
      onSendMessage={onSendMessage}
      onStartVideoCall={onStartVideoCall}
      onStartVoiceCall={onStartVoiceCall}
      profile={dmProfile.data}
      variant="dm"
    />
  ) : null;

  const identityState = resolveProfileIdentityState({
    hasProfile: identity !== null,
    isError: isGroup ? groupProfile.isError : dmProfile.isError,
  });
  const Body = TAB_BODY[activeTab];

  return (
    <MessagesSidePanel
      closeLabel={t("messages.profile.close")}
      onClose={onClose}
      overlay={overlay}
      testId="conversation-profile-panel"
      title={t(isGroup ? "messages.profile.title.group" : "messages.profile.title.user")}
      variant="profile"
    >
      {/*
        Kabuğun kendi sarmalayıcısı `overflow-y-auto`; bu kolon `min-h-0` ile onun
        içinde ezilir ki kaydırma **gövdede** olsun. Kimlik bloğu ve sekme şeridi
        kaymaz: SPEC §15.2 gövdeyi tek başına kaydırıyor.
      */}
      <div className="flex min-h-0 flex-1 flex-col">
        {identityState === "ready" ? identity : null}
        {identityState === "error" ? <ProfileIdentityError /> : null}
        {identityState === "loading" ? <IdentitySkeleton /> : null}

        <ProfilePanelTabs
          bodyId={PROFILE_PANEL_BODY_ID}
          onSelect={onSelectTab}
          tab={activeTab}
          variant={variant}
        />

        <div
          aria-labelledby={profileTabButtonId(activeTab)}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-color:hsl(var(--border))_transparent] [scrollbar-width:thin] [overscroll-behavior:contain]"
          data-profile-tab={activeTab}
          data-testid="conversation-profile-panel-body"
          id={PROFILE_PANEL_BODY_ID}
          ref={bodyRef}
          role="tabpanel"
          style={{
            gap: pxToRem(profilePanel.bodyGap),
            padding: `${pxToRem(profilePanel.bodyPaddingTop)} ${pxToRem(profilePanel.bodyPaddingX)} ${pxToRem(profilePanel.bodyPaddingBottom)}`,
          }}
          tabIndex={0}
        >
          {/*
            Dört sekmeye de **aynı** dört kanca gidiyor. Yalnız `uyeler`e geçmek
            cazipti (bugün ikisini de o kullanıyor), ama sözleşme sekme başına
            ayrışsaydı beşinci sekmeyi yazan kişi hangi kancayı alacağını
            gövdenin adına bakarak tahmin etmek zorunda kalırdı.
          */}
          <Body
            conversationId={conversationId}
            onAddMembers={onAddMembers}
            onSelectMember={onSelectMember}
            onToast={onToast}
            variant={variant}
          />
        </div>
      </div>
    </MessagesSidePanel>
  );
}
