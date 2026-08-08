# Faz 6 — Web / desktop (Görev 18, 19)

> **Önce oku:** `docs/prompts/grup-sohbeti/00-ortak-baglam.md`.
> **Önkoşul:** Faz 3–5 tamam. Web uçları (`/api/v1/dm/groups...`), realtime olayları,
> `packages/types/src/group-dm-selection.ts` seçim modeli ve `DMMessagePayload`'ın
> sistem alanları hazır.

Web tarafında grup farkındalığı **sıfır** — mobilde hazır gelen satır/başlık/avatar
mantığının hiçbiri burada yok. Dört yüzeyin dördü de yeni yazılır.

Web'de **vitest yok**. `apps/web/src` altındaki tüm `*.test.ts` ve `*.test.tsx`
dosyaları `node --import tsx --test` ile koşar
(`apps/web/scripts/run-node-tests.mjs`). Yeni bileşen testleri de aynı runner'a
yazılır; örnek için `apps/web/src/components/dm/dm-call-notice.test.tsx`'e bak.

---

## Görev 18 — Sidebar grup satırı ve oluşturma diyaloğu

### Dosyalar

- Değiştir: `apps/web/src/components/dm/dm-sidebar.tsx`
- Oluştur: `apps/web/src/components/dm/group-create-dialog.tsx`
- Oluştur: `apps/web/src/components/dm/group-create-dialog.test.tsx`

### 18.1 Seçim mantığı yeniden yazılmaz

Diyalog, mobil ekranın kullandığı **aynı** fonksiyonları `@wizards/types`'tan
import eder:

```ts
import {
  canAdvanceToIdentity,
  canSubmitGroup,
  createInitialGroupCreateState,
  getGroupSelectionCount,
  isGroupSelectionFull,
  toGroupCreateRequest,
  toggleGroupMember,
  GROUP_DM_NAME_MAX_LENGTH,
  type GroupCreateState,
} from "@wizards/types";
```

Seçim, sınır veya ad-kırpma mantığı web'de **yeniden uygulanmaz**. Bu kural
bilinçli: iki yüzeyde iki uygulama iki sapma demektir.

### 18.2 `group-create-dialog.tsx`

Mevcut `apps/web/src/components/shell/workspace-modals.tsx` diyalog desenini izler.
Tek diyalog, iki aşama, mobil ekranla birebir aynı kurallar:

- Aşama 1: arkadaş çoklu seçim + arama + seçilenler çip şeridi + `{n}/32` sayacı;
  31 seçimden sonra seçili olmayanlar devre dışı
- Aşama 2: ad (opsiyonel, `maxLength={GROUP_DM_NAME_MAX_LENGTH}`), fotoğraf
  (opsiyonel, `groupIconUploader` üzerinden), seçilen üyelerin özeti
- "İleri" en az 2 seçimle açılır; "Oluştur" yalnızca kimlik aşamasında etkin
- Başarıda yeni sohbete gidilir

`POST /api/v1/dm/groups` gövdesi `toGroupCreateRequest(state, iconUrl)` ile üretilir —
elle nesne kurulmaz.

### 18.3 `dm-sidebar.tsx`

- Mevcut yeni-DM kontrolünün yanına `+` butonu → diyaloğu açar
- **Grup satırı:** `conversation.name`; yoksa üye adlarının birleşimi.
  `conversation.iconUrl` yoksa avatar yığını. Üye sayısı rozeti.
- **Grup önizlemesinde yazar öneki:** gönderen mevcut kullanıcıysa `"Sen: "`,
  değilse gönderenin görünen adı + `": "`. (Mobildeki
  `apps/mobile/src/app/screens/dm-inbox.tsx:457` kuralının aynısı.)
- Arama `conversation.name` **ve** üye adları üzerinde çalışır

### 18.4 Testler

- İki arkadaş seçilene kadar "İleri" kapalı
- 31 seçimden sonra 32.'si listeyi büyütmüyor
- Boş ad gövdeye yazılmıyor (gövde yalnızca `userIds` taşıyor)
- `"  Takım  "` → `"Takım"` olarak gönderiliyor
- Grup satırı adsızken üye adlarını, adlıyken adı gösteriyor
- Grup önizlemesi yazar önekini taşıyor

---

## Görev 19 — Detay paneli ve sohbet yüzeyi

### Dosyalar

- Oluştur: `apps/web/src/components/dm/dm-system-message.tsx`
- Oluştur: `apps/web/src/components/dm/dm-system-message.test.tsx`
- Değiştir: `apps/web/src/components/dm/dm-details-panel.tsx`
- Değiştir: `apps/web/src/components/dm/dm-conversation.tsx`

### 19.1 `dm-system-message.tsx`

Mobil `formatGroupSystemMessage`'ın web karşılığı. Ortalanmış sönük satır; balon
değil, avatar yok, zaman damgası yok. `systemType` null ise `null` döner.

Metin altı `systemType` için yerelleştirilmiş şablonlardan kurulur; aktör mevcut
kullanıcıysa adı yerine "Sen"/"You". Hedef adları `systemTargetUserIds`'den
katılımcı listesiyle çözülür; listede olmayan id atlanır.

Testler (5): oluşturma · "Sen" ikamesi · çoklu hedef · yeniden adlandırmada
`systemValue` · `systemType: null` → hiçbir şey render edilmiyor.

### 19.2 `dm-details-panel.tsx` — grup kipi

Grupta: üye listesi (sahip rozetli), üye ekleme, üye çıkarma, gruptan ayrılma,
ad ve foto düzenleme. Sahip olmayan üye yalnızca listeyi ve "Gruptan ayrıl"ı görür.

1:1 kipi **değişmez**.

### 19.3 `dm-conversation.tsx`

- Sistem mesajı dalı normal balondan **önce** çalışır
- Başlık: grup adı + üye sayısı; grupta 1:1'deki presence göstergesi gizlenir

### 19.4 Realtime

Web sorgu katmanı (`apps/web/src/hooks/use-messages.ts` ve DM sidebar sorguları)
Faz 3'ün üç olayına karşılık gelen invalidation'ı alır:

- `dm:conversation:created` → sohbet listesi
- `dm:conversation:members_changed` → sohbet listesi + o sohbetin detayı
- `dm:conversation:removed` → satır düşer, açıksa sohbet kapanır

---

## Faz 6 kabul kriterleri

- [ ] Diyalog seçim mantığını `@wizards/types`'tan import ediyor, yeniden yazmıyor
- [ ] Sidebar `+` butonu, grup satırı (ad fallback + avatar yığını + üye rozeti),
      yazar önekli önizleme, grup adı/üye adı araması
- [ ] Detay paneli grup kipi sahip/üye ayrımını uyguluyor; 1:1 kipi bozulmamış
- [ ] Sistem mesajı 6 tipin hepsini yerelleştirilmiş çiziyor, `null`'da hiçbir şey
- [ ] Sohbet başlığı grupta ad + üye sayısı gösteriyor, presence gizli
- [ ] Üç realtime olayı web'de de invalidate ediyor
- [ ] `pnpm --filter @wizards/web test` yeşil (bilinen eşzamanlı-oturum kırıkları hariç)
- [ ] `pnpm --filter @wizards/web typecheck` bilinen e2e hatası dışında 0
- [ ] En az bir deliberate-failure kanıtı: seçim tavanının web diyaloğunda da
      31'de kilitlendiği

## Rapor

`.superpowers/sdd/groupdm/task-18-report.md`, `task-19-report.md`.
