"use client";

import React, { useState } from "react";
import { Ban, Flag, LogOut, Trash, Trash2 } from "lucide-react";
import type { DMParticipantRole } from "@wizards/types";
import { Button } from "@wizards/ui";

import { Modal } from "@/components/ui/modal";
import { useI18n } from "@/components/providers/locale-provider";
import { MESSAGES_METRICS, hairline, pxToRem } from "@/lib/messages/metrics";
import { cn } from "@/lib/utils";

/**
 * §15.5.3 — tehlike ve yönetim satırları.
 *
 * **Yetkisi olmayan satır çizilmez.** Pasif bir `Grubu sil` düğmesi bir yönetim
 * arayüzünde bilgi değil, davettir: sunucu 403 dönene kadar denemeye çağırır.
 * Ş2 kararı gereği silme yalnız `OWNER`'ın işidir (`ADMIN` uçta 403 alır), yani
 * satır yalnız sahibe çizilir.
 *
 * **Her yıkıcı eylem onay ister.** Onay `components/ui/modal.tsx` üzerine kurulu
 * — `friends-view.tsx` içindeki mevcut onay akışının birebir kalıbı (Modal +
 * iptal/onayla düğme çifti). Yeni bir modal ilkeli yazılmadı; kabuğun odak
 * tuzağı, `Esc` kapanışı ve tetikleyiciye dönen odağı bedavaya geliyor.
 */

const { profilePanel } = MESSAGES_METRICS;

export type DangerActionKind = "block" | "clearHistory" | "deleteGroup" | "leaveGroup" | "report";

export type DangerActionDescriptor = {
  readonly kind: DangerActionKind;
  readonly labelKey: string;
  /** `danger` kırmızı zeminli satır; `neutral` kart zeminli satır (§15.5.3). */
  readonly tone: "danger" | "neutral";
};

const DESCRIPTORS: Readonly<Record<DangerActionKind, DangerActionDescriptor>> = Object.freeze({
  block: { kind: "block", labelKey: "messages.profile.danger.block", tone: "danger" },
  clearHistory: {
    kind: "clearHistory",
    labelKey: "messages.profile.danger.clearHistory",
    tone: "neutral",
  },
  deleteGroup: {
    kind: "deleteGroup",
    labelKey: "messages.profile.danger.deleteGroup",
    tone: "danger",
  },
  leaveGroup: {
    kind: "leaveGroup",
    labelKey: "messages.profile.danger.leaveGroup",
    tone: "danger",
  },
  report: { kind: "report", labelKey: "messages.profile.danger.report", tone: "neutral" },
});

/** Onay isteyen eylemlerin tamamı — hiçbiri onaysız koşmaz. */
export const DANGER_ACTION_KINDS: readonly DangerActionKind[] = Object.freeze([
  "block",
  "clearHistory",
  "deleteGroup",
  "leaveGroup",
  "report",
] satisfies readonly DangerActionKind[]);

/**
 * Bu görüntüleyicinin gerçekten yapabileceği eylemler.
 *
 * Rol bilinmiyorsa (panel hâlâ yükleniyor) yalnız herkesin yapabildiği satır
 * çizilir: bilinmeyen bir rol yönetici sayılmaz. Sunucu yetkiyi zaten yeniden
 * türetiyor; buradaki liste bir düzen kararıdır, bir güvenlik kapısı değil.
 */
export function resolveDangerActions(input: {
  variant: "dm" | "group";
  viewerRole?: DMParticipantRole | undefined;
}): readonly DangerActionDescriptor[] {
  if (input.variant === "dm") {
    return [DESCRIPTORS.block, DESCRIPTORS.report];
  }

  const actions: DangerActionDescriptor[] = [];

  if (input.viewerRole === "OWNER" || input.viewerRole === "ADMIN") {
    actions.push(DESCRIPTORS.clearHistory);
  }

  actions.push(DESCRIPTORS.leaveGroup);

  if (input.viewerRole === "OWNER") {
    actions.push(DESCRIPTORS.deleteGroup);
  }

  return actions;
}

export type DangerConfirmCopy = {
  /** Onay düğmesinin metni. */
  readonly actionKey: string;
  /**
   * Gövde satırları. `{name}` taşıyan anahtarlara özne adı verilir; taşımayan
   * satırlar sabittir. İlk satır her zaman öznenin kendisidir ki `Grubu sil`
   * onayı **grup adını içersin**.
   */
  readonly bodyKeys: readonly string[];
  /** `null` ise başlık satır etiketidir; dize ise `{name}` ile araya girer. */
  readonly titleKey: string | null;
};

/**
 * Onay metinleri.
 *
 * Sözlükte yıkıcı satırlar için ayrılmış bir onay bloğu **yok**; engelleme için
 * olan (`friends.confirm.block.*`) tam olarak bu diyaloğu tarif ediyor ve
 * kullanılıyor. Kalan dördü satır etiketi + özne adıyla soruluyor —
 * `friends-view.tsx` içindeki mevcut onayın kalıbı da bu. Eksik anahtarlar
 * şeridin raporunda listelendi; JSX'e gömülü metin yazılmadı (kural 3).
 */
export function dangerConfirmCopy(kind: DangerActionKind): DangerConfirmCopy {
  if (kind === "block") {
    return {
      actionKey: "friends.confirm.block.action",
      bodyKeys: ["friends.confirm.block.description", "friends.confirm.block.safety"],
      titleKey: "friends.confirm.block.title",
    };
  }

  return { actionKey: DESCRIPTORS[kind].labelKey, bodyKeys: [], titleKey: null };
}

function DangerIcon({ kind }: { kind: DangerActionKind }) {
  const style = {
    height: pxToRem(profilePanel.dangerIconSize),
    width: pxToRem(profilePanel.dangerIconSize),
  };

  switch (kind) {
    case "block":
      return <Ban style={style} />;
    case "clearHistory":
      return <Trash style={style} />;
    case "deleteGroup":
      return <Trash2 style={style} />;
    case "leaveGroup":
      return <LogOut style={style} />;
    default:
      return <Flag style={style} />;
  }
}

export type ProfileDangerActionsProps = {
  actions: readonly DangerActionDescriptor[];
  /** Koşan eylem; satır bekler ve tekrar tıklanamaz. */
  busyKind?: DangerActionKind | null | undefined;
  /** Onay verildikten **sonra** çağrılır. */
  onRun: (kind: DangerActionKind) => void;
  /** Onay gövdesinin ilk satırı: grup adı ya da karşı tarafın adı. */
  subjectName: string;
};

export function ProfileDangerActions({
  actions,
  busyKind = null,
  onRun,
  subjectName,
}: ProfileDangerActionsProps) {
  const { t } = useI18n();
  const [pendingKind, setPendingKind] = useState<DangerActionKind | null>(null);

  if (actions.length === 0) {
    return null;
  }

  const copy = pendingKind === null ? null : dangerConfirmCopy(pendingKind);
  const title =
    pendingKind === null
      ? ""
      : copy?.titleKey
        ? t(copy.titleKey, { name: subjectName })
        : t(DESCRIPTORS[pendingKind].labelKey);

  return (
    <>
      <div
        className="flex flex-col"
        data-testid="profile-danger-actions"
        style={{ gap: pxToRem(profilePanel.dangerListGap) }}
      >
        {actions.map((action) => {
          const danger = action.tone === "danger";
          const busy = busyKind === action.kind;

          return (
            <button
              className={cn(
                "flex items-center text-left transition-[background-color,color] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
                danger
                  ? "hover:bg-[hsl(var(--danger)/0.16)]"
                  : "hover:bg-[hsl(var(--surface-soft))] hover:text-[hsl(var(--foreground))]",
                busy ? "cursor-progress opacity-60" : "cursor-pointer",
              )}
              data-testid={`profile-danger-${action.kind}`}
              disabled={busy}
              key={action.kind}
              onClick={() => setPendingKind(action.kind)}
              style={{
                background: danger ? "hsl(var(--danger)/0.08)" : "hsl(var(--surface-card))",
                borderColor: danger ? "hsl(var(--danger)/0.35)" : "hsl(var(--border)/0.7)",
                borderRadius: pxToRem(profilePanel.dangerRadius),
                borderStyle: "solid",
                borderWidth: hairline(),
                color: danger ? "hsl(var(--danger))" : "hsl(var(--text-secondary))",
                fontSize: pxToRem(profilePanel.dangerFontSize),
                fontWeight: danger ? 600 : 500,
                gap: pxToRem(profilePanel.dangerGap),
                lineHeight: 1,
                padding: pxToRem(profilePanel.dangerPadding),
              }}
              type="button"
            >
              <DangerIcon kind={action.kind} />
              {t(action.labelKey)}
            </button>
          );
        })}
      </div>

      <Modal
        closeLabel={t("common.cancel")}
        onClose={() => setPendingKind(null)}
        open={pendingKind !== null}
        title={title}
      >
        {pendingKind === null || copy === null ? null : (
          <div className="flex flex-col gap-4" data-testid="profile-danger-confirm">
            {/*
              Öznenin adı her onayda ilk satırdır: `Grubu sil` onayının grup adını
              taşıması SPEC şartı, ve aynı cümle diğer dördünde de "hangi sohbet"
              sorusunu kapatıyor.
            */}
            <p className="text-[hsl(var(--foreground))]" data-testid="profile-danger-subject">
              {subjectName}
            </p>
            {copy.bodyKeys.map((key) => (
              <p className="text-[hsl(var(--text-secondary))]" key={key}>
                {t(key, { name: subjectName })}
              </p>
            ))}
            <div className="flex justify-end gap-2">
              <Button
                data-testid="profile-danger-cancel"
                onClick={() => setPendingKind(null)}
                size="sm"
                type="button"
                variant="outline"
              >
                {t("common.cancel")}
              </Button>
              <Button
                className="bg-[hsl(var(--danger))] text-white"
                data-testid="profile-danger-submit"
                onClick={() => {
                  onRun(pendingKind);
                  setPendingKind(null);
                }}
                size="sm"
                type="button"
              >
                {t(copy.actionKey)}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
