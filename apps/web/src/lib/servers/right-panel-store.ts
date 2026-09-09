"use client";

import { useSyncExternalStore } from "react";

/**
 * Sağ panelin **içerik seçimi** — SPEC-SUNUCU §10'un `panel` alanı.
 *
 * Panel üç içerikten birini gösteriyor ve seçimi paneli açan düğme veriyor: §3.1'in kanal
 * başlığındaki `ara` ve `Üyeler` düğmeleri. Yani seçim iki ayrı ağaçta yaşıyor — düğmeler
 * `chat/chat-area.tsx`'te, panel `shell/wizards-shell.tsx`'te — ve ikisini saran ortak bir
 * sağlayıcı yok. `use-layer-stack.ts` aynı sorunu aynı biçimde çözüyor: modül düzeyinde bir
 * store, `useSyncExternalStore` ile okunur ve sunucuda render edilirken varsayılanı verir.
 *
 * **`voice` burada yok** ve bu bilinçli. SPEC §10 `panel` için üç değer tanımlıyor
 * (`members | search | null`); ses kanalının katılımcı listesi ayrı bir seçim değil,
 * `members` içeriğinin ses kanalındaki hâli (`Sunucu.dc.html` satır 2137: aynı `panel`
 * değeriyle yalnız `view` değişiyor). Dördüncü bir değer eklemek, kullanıcı ses kanalına
 * geçtiğinde birinin bu değeri güncellemeyi unutabileceği bir durum yaratırdı; içeriği
 * kanal türünden türetmek o durumu imkânsız kılar.
 *
 * Panelin **açık/kapalı** olması bu store'un işi değil: onu `useAppStore.memberPanelCollapsed`
 * taşıyor ve kullanıcının Görünüm ayarındaki tercihiyle (`settings.row.y5`) kalıcıdır.
 */

export type ServerRightPanelContent = "members" | "search";

const DEFAULT_CONTENT: ServerRightPanelContent = "members";

let content: ServerRightPanelContent = DEFAULT_CONTENT;
const listeners = new Set<() => void>();

function emit(next: ServerRightPanelContent): void {
  if (next === content) {
    return;
  }

  content = next;
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ServerRightPanelContent {
  return content;
}

function getServerSnapshot(): ServerRightPanelContent {
  return DEFAULT_CONTENT;
}

export function setServerRightPanelContent(next: ServerRightPanelContent): void {
  emit(next);
}

/** Test ve rota değişimi için: seçim üye listesine döner. */
export function resetServerRightPanelContent(): void {
  emit(DEFAULT_CONTENT);
}

export function useServerRightPanelContent(): ServerRightPanelContent {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
