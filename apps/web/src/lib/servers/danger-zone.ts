/**
 * `Sunucu ayarları › Tehlike bölgesi` — SPEC-SUNUCU §8.9'un saf katmanı.
 *
 * İki kartın da tek bir sorusu var: **düğme aktif mi**. Cevap iki yerde birden doğru olmak
 * zorunda (düğmenin `disabled` hâli ve alt satırın metni) ve ikisi ayrı yazılırsa bir gün
 * "Sahiplik X kullanıcısına geçecek" yazan ve pasif duran bir düğme çıkar. Karar bu yüzden
 * tek fonksiyonda ve testli.
 *
 * 00 §5: bölümün tamamı **yalnız sahibe** render edilir. Kapıyı bileşen tutar (`null` döner),
 * bu dosya kapıdan geçmiş kullanıcının kararlarını verir.
 */

import type { WorkspaceAccessLevel } from "@wizards/types";

export type TransferOwnershipCandidate = {
  readonly accessLevel: WorkspaceAccessLevel;
  readonly avatarUrl: string | null;
  readonly displayName: string;
  readonly userId: string;
  readonly username: string;
};

/**
 * `YENİ SAHİP` radyo listesi — sahip **dışındaki** üyeler.
 *
 * Sıra listedeki sırayı korur: üye listesi sunucudan rol/isim düzeniyle geliyor ve radyo
 * listesini yeniden sıralamak, aynı iki adı iki bölümde iki farklı yerde göstermek olurdu.
 */
export function listTransferCandidates(
  members: readonly TransferOwnershipCandidate[],
): readonly TransferOwnershipCandidate[] {
  return members.filter((member) => member.accessLevel !== "OWNER");
}

export type TransferOwnershipState = {
  readonly acknowledged: boolean;
  readonly targetUserId: string | null;
};

export const TRANSFER_OWNERSHIP_INITIAL_STATE: TransferOwnershipState = {
  acknowledged: false,
  targetUserId: null,
};

export type TransferOwnershipNote = "selectMember" | "acknowledge" | "ready";

/**
 * Alt satırın metni ve tonu. SPEC üç durumu **sırayla** veriyor: önce "üye seç", sonra
 * "onayı aç", sonra "Sahiplik <ad> kullanıcısına geçecek". Sıra önemli — onay açık ama üye
 * seçilmemişse kullanıcıya eksik olanı söylemeliyiz, elindekini değil.
 */
export function selectTransferNote(state: TransferOwnershipState): TransferOwnershipNote {
  if (!state.targetUserId) {
    return "selectMember";
  }

  return state.acknowledged ? "ready" : "acknowledge";
}

/** Düğme **ancak ikisi de tamamken** aktif (SPEC §8.9, 00 §6). */
export function canTransferOwnership(state: TransferOwnershipState): boolean {
  return Boolean(state.targetUserId) && state.acknowledged;
}

/**
 * Silme onayı — yazılan metin sunucu adına **birebir** eşit mi.
 *
 * Kırpma yapılır, çünkü `DeleteServerSchema.confirmationName` `.trim()` uyguluyor ve uç
 * kırpılmış metni kabul ediyor (Ş1 §2.4): istemci uçtan **daha katı** olursa kullanıcı
 * ucun kabul edeceği bir metinle pasif bir düğmeye bakar. Büyük/küçük harf farkı ise
 * kırpılmaz — uç onu reddediyor ve testi bunu kilitliyor.
 */
export function canDeleteServer(confirmation: string, serverName: string): boolean {
  const expected = serverName.trim();

  return expected.length > 0 && confirmation.trim() === expected;
}
