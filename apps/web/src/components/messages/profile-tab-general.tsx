"use client";

import React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ConversationToast } from "@wizards/types";

import { ProfileBadgeGrid } from "@/components/messages/profile-badge-grid";
import {
  ProfileMutualFriends,
  ProfileMutualServers,
} from "@/components/messages/profile-mutual-lists";
import { ProfilePinnedList } from "@/components/messages/profile-pinned-list";
import { ProfileRelationshipCard } from "@/components/messages/profile-relationship-card";
import { ProfileSectionLabel } from "@/components/messages/profile-section-label";
import { useI18n } from "@/components/providers/locale-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { createDMConversationRequest } from "@/lib/dm/client";
import { groupProfileQueryKeys, fetchGroupProfilePanel } from "@/lib/dm/group-profile-client";
import {
  DM_PROFILE_PANEL_STALE_TIME_MS,
  dmProfilePanelQueryOptions,
} from "@/lib/dm/profile-client";
import { MESSAGES_METRICS, pxToRem } from "@/lib/messages/metrics";
import { messagesConversationHref } from "@/lib/messages/routes";

/**
 * Profil panelinin `Genel` sekmesi — SPEC-MESAJLAR §15.3. Panelin varsayılan sekmesi;
 * `screens/15` (DM üst), `screens/16` (DM kaydırılmış), `screens/19` (grup).
 *
 * **Altı bölüm, bağlayıcı sıra:**
 * `HAKKINDA` (grupta `GRUP AÇIKLAMASI`) → `ROZETLER` (DM) → tarih kartı →
 * `ORTAK SUNUCULAR` (DM) → `ORTAK ARKADAŞLAR` (DM) → `SABİTLENEN MESAJLAR` (grup).
 * Tarih kartının rozet ızgarasının **altında** olması ayrı bir kabul kriteri, o yüzden
 * sıra testte DOM üzerinden kilitli.
 *
 * **Sekme kendi verisini kendi çeker.** Panelden veri gelmez: "seçilmeyen sekmenin sorgusu
 * koşmaz" kuralı (§15.2, kural 7) tam olarak bu sınırda tutuluyor — sekme gövdesi
 * takılmadıkça `useQuery` hiç kurulmaz, `enabled` bayrağıyla oynamak gerekmez.
 *
 * **Boş bölüm hiç çizilmez.** Boş bir `ROZETLER 0 / 16` başlığının altında boşluk bırakmak,
 * o kişide olmayan bir şeyin yerini göstermek olurdu. Aynı kural altı bölümün hepsinde:
 * bio boşsa `HAKKINDA` yok, ortak sunucu yoksa bölüm yok, sabit yoksa bölüm yok, arkadaş
 * değilse tarih kartı yok (karar K7).
 */

const { profilePanel } = MESSAGES_METRICS;

export type ProfileTabProps = {
  readonly conversationId: string;
  /**
   * Ş5'in paneli bağlayacak. `Genel` sekmesinin kendi ürettiği bir toast **yok**:
   * `ConversationToastKind` listesindeki on üç kipin hiçbiri bu sekmede olabilecek bir
   * olayı anlatmıyor (hepsi Ayarlar / Üyeler / menü eylemleri). Prop yine de sözleşmenin
   * parçası, çünkü dört sekme aynı imzayla çağrılıyor.
   */
  readonly onToast?: ((toast: ConversationToast) => void) | undefined;
  /**
   * Ortak arkadaş satırının hedefi. Ş5 bağlamazsa satır konuşmayı kendisi açar ve tam
   * sayfa gezinmesi yapar — `useRouter()` yalnız Next çalışma zamanında var ve bu
   * bileşen sunucuda çizilebilir kalmalı (emsal: `settings-sections.test.tsx` notu).
   */
  readonly onOpenUser?: ((userId: string) => void) | undefined;
  readonly variant: "dm" | "group";
};

export function ProfileTabGeneral(props: ProfileTabProps): React.JSX.Element {
  return props.variant === "dm" ? (
    <DmGeneralTab conversationId={props.conversationId} onOpenUser={props.onOpenUser} />
  ) : (
    <GroupGeneralTab conversationId={props.conversationId} />
  );
}

function TabBody({ children }: { readonly children: React.ReactNode }) {
  return (
    <div
      className="flex flex-col"
      data-testid="profile-tab-general"
      style={{ gap: pxToRem(profilePanel.bodyGap) }}
    >
      {children}
    </div>
  );
}

/** §15.3.1. Metin boşsa bölüm yoktur; boş bir başlık bırakılmaz. */
function ProfileAboutSection({
  failed,
  label,
  loading,
  text,
}: {
  readonly failed: boolean;
  readonly label: string;
  readonly loading: boolean;
  readonly text: string | null;
}) {
  const { t } = useI18n();

  if (failed) {
    return (
      <p
        className="text-[hsl(var(--text-muted))]"
        data-testid="profile-about-error"
        style={{ fontSize: pxToRem(profilePanel.dateCardSubtitleFontSize) }}
      >
        {t("messages.profile.error.load")}
      </p>
    );
  }

  if (loading) {
    return (
      <section data-testid="profile-about">
        <ProfileSectionLabel>{label}</ProfileSectionLabel>
        <Skeleton
          style={{
            height: pxToRem(profilePanel.aboutFontSize * profilePanel.aboutLineHeight * 2),
            marginTop: pxToRem(profilePanel.aboutMarginTop),
          }}
        />
      </section>
    );
  }

  if (text === null || text.trim().length === 0) {
    return null;
  }

  return (
    <section data-testid="profile-about">
      <ProfileSectionLabel>{label}</ProfileSectionLabel>
      <p
        className="text-[hsl(var(--text-secondary))]"
        data-testid="profile-about-text"
        style={{
          fontSize: pxToRem(profilePanel.aboutFontSize),
          lineHeight: profilePanel.aboutLineHeight,
          marginTop: pxToRem(profilePanel.aboutMarginTop),
          textWrap: "pretty",
        }}
      >
        {text}
      </p>
    </section>
  );
}

function DmGeneralTab({
  conversationId,
  onOpenUser,
}: {
  readonly conversationId: string;
  readonly onOpenUser: ((userId: string) => void) | undefined;
}) {
  const { t } = useI18n();
  const profile = useQuery(dmProfilePanelQueryOptions(conversationId, true));

  /**
   * "Bu kişinin DM'i" bir kimlik değil, bir yazma: 1:1 konuşma yoksa açılır.
   * `friends-view.tsx`'in `Mesaj gönder` düğmesi aynı ucu çağırıyor; ikinci bir yol
   * açmak iki farklı konuşma kimliği üretebilirdi.
   */
  const openConversation = useMutation({
    mutationFn: (userId: string) => createDMConversationRequest(userId),
    onSuccess: (conversation) => {
      if (typeof window !== "undefined") {
        window.location.assign(messagesConversationHref(conversation.id));
      }
    },
  });

  const loading = profile.isPending;
  const failed = profile.isError;
  const data = profile.data ?? null;

  return (
    <TabBody>
      <ProfileAboutSection
        failed={failed}
        label={t("messages.profile.section.about")}
        loading={loading}
        text={data?.bio ?? null}
      />

      <ProfileBadgeGrid badges={data?.badges ?? []} failed={failed} loading={loading} />

      {/* Tarih kartı rozetlerin **altında** — §15.3.3 ve kabul kriteri. */}
      <ProfileRelationshipCard
        facts={
          data?.friendship
            ? {
                durationMonths: data.friendship.durationMonths,
                kind: "friendship",
                metViaServerName: data.friendship.metViaServerName,
                since: data.friendship.since,
              }
            : null
        }
        failed={failed}
        loading={loading}
      />

      <ProfileMutualServers failed={failed} loading={loading} servers={data?.mutualServers ?? []} />

      <ProfileMutualFriends
        failed={failed}
        friends={data?.mutualFriends ?? []}
        loading={loading}
        onSelect={onOpenUser ?? ((userId: string) => openConversation.mutate(userId))}
        total={data?.mutualFriendTotal ?? 0}
      />
    </TabBody>
  );
}

function GroupGeneralTab({ conversationId }: { readonly conversationId: string }) {
  const { t } = useI18n();
  const profile = useQuery({
    queryFn: () => fetchGroupProfilePanel(conversationId),
    queryKey: groupProfileQueryKeys.panel(conversationId),
    // DM koluyla aynı pencere: aynı panelin iki kolu iki farklı anda tazelenmemeli.
    staleTime: DM_PROFILE_PANEL_STALE_TIME_MS,
  });

  const loading = profile.isPending;
  const failed = profile.isError;
  const data = profile.data ?? null;

  return (
    <TabBody>
      <ProfileAboutSection
        failed={failed}
        label={t("messages.profile.section.groupDescription")}
        loading={loading}
        text={data?.description ?? null}
      />

      <ProfileRelationshipCard
        facts={
          data ? { createdAt: data.createdAt, kind: "group", ownerName: data.ownerName } : null
        }
        failed={failed}
        loading={loading}
      />

      <ProfilePinnedList failed={failed} loading={loading} pins={data?.pinnedMessages ?? []} />
    </TabBody>
  );
}
