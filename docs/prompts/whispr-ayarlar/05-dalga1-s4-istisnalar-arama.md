# Dalga 1 · Ş4 — İstisnalar (üç tablodan tek liste) + Ayarlar arama indeksi

**Ön koşul:** Ş0 kapısı yeşil. **Paralel:** Ş1, Ş2, Ş3.

İki bağımsız iş; ikisi de küçük ve ikisi de başka şeritleri bekletmemeli.

Önce `00-ortak-baglam.md` okunur.

---

## Sahiplenilen dosyalar

- `apps/web/src/lib/notifications/exceptions-service.ts` (yeni) + `.test.ts`
- `apps/web/src/app/api/v1/users/me/notification-exceptions/route.ts` + `route-logic.ts` + `.test.ts` (yeni)
- `apps/web/src/lib/settings/exceptions-client.ts` (yeni)
- `apps/web/src/lib/settings/search-index.ts` (yeni — ağaçtan üretim) + `.test.ts`
- `apps/web/src/lib/settings/search.ts` (yeni — eşleme + sıralama) + `.test.ts`

**Okunur, yazılmaz:** `lib/settings/tree.ts`, `lib/workspace/server-user-settings-service.ts`,
`lib/workspace/channel-settings.ts`, DM sessize alma yolu.

---

## A. İstisnalar (K4)

### 1. Okuma — tek liste, üç kaynak

```ts
type NotificationException = {
  id: string; // `${scope}:${scopeId}`
  scope: "server" | "channel" | "dm";
  scopeId: string;
  name: string; // sunucu adı · #kanal · konuşma adı
  iconUrl: string | null;
  level: "all" | "mentions" | "important" | "muted" | "off";
  mutedUntil: string | null; // ISO
};
```

| Kaynak                | Süzgeç                                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `UserServerSettings`  | `muted = true` **veya** `messageNotifications != 'DEFAULT'` **veya** `suppressEveryone` **veya** `suppressRoles` |
| `UserChannelSettings` | `muted = true` **veya** `messageNotifications != 'DEFAULT'`                                                      |
| `DMParticipant`       | `notifyLevel != 'ALL'`                                                                                           |

**Varsayılan satır istisna değildir.** `DEFAULT` seviyeli ve susturulmamış satır listeye girmez —
aksi hâlde her sunucu üyeliği bir "istisna" gibi görünür.

**Süresi geçmiş sessize alma temizlenir:** `mutedUntil < now` olan satır listeden düşer ve
okuma sırasında `muted = false` olarak **tembel** düzeltilir (yazma yan etkisi tek yerde,
`exceptions-service.ts` içinde, ayrı bir işlemle).

Sıralama: `scope` (server → channel → dm), sonra `name` (`tr` collation).

### 2. Yazma — kendi kaynağına

**Yeni yazma ucu açılmaz.** `Düzenle` ve kaldır düğmeleri mevcut uçlara gider:

| Kapsam    | Uç                                                                  |
| --------- | ------------------------------------------------------------------- |
| `server`  | `PATCH /api/v1/servers/[serverId]/user-settings` (mevcut)           |
| `channel` | `PATCH /api/v1/channels/[channelId]/notification-settings` (mevcut) |
| `dm`      | mevcut DM bildirim tercihi ucu                                      |

`exceptions-client.ts` bu üç yolu tek bir `updateException(scope, scopeId, patch)` arkasına alır;
Ş9 üç ayrı çağrıyı bilmez.

### 3. Uç

| Uç                                             | Çıktı                                |
| ---------------------------------------------- | ------------------------------------ |
| `GET /api/v1/users/me/notification-exceptions` | `{ items: NotificationException[] }` |

Sayfalama yok — istisna sayısı doğası gereği küçük; 200'den fazlaysa kesilir ve `truncated: true`
döner (Ş9 bunu `+{n} daha` olarak yazar).

`Yüzeyler` sekmesindeki özet kutusunun `Aktif istisna` sayısı **bu ucun** uzunluğudur; ikinci
bir sayaç kurulmaz.

---

## B. Ayarlar arama (sapma #7)

### 4. İndeks ağaçtan üretilir

Statik `SET_HITS` dizisi **kullanılmaz** — referanstaki dizi var olmayan bir sekmeye
(`'notif', 'ozet'`) işaret ediyor. İndeks `SETTINGS_TREE`'den türetilir:

```ts
type SettingsSearchEntry = {
  rowKey: string;
  section: SettingsSection;
  tab: SettingsTab;
  titleKey: string;
  descriptionKey?: string;
  groupTitleKey?: string;
  /** Eşleme için normalize edilmiş metin; i18n çözümünden sonra kurulur. */
  haystack: string;
};
export function buildSettingsSearchIndex(t: Translator): SettingsSearchEntry[];
```

`haystack` = başlık + açıklama + grup başlığı + seçenek etiketleri, **Türkçe uyumlu**
normalizasyon (küçük harf, `İ/ı` doğru, aksan kaldırma) sonrası.

### 5. Eşleme ve sıralama

```ts
export function searchSettings(index, query, limit = 20): SettingsSearchEntry[];
```

- Boş / 2 karakterden kısa sorgu → boş sonuç.
- Sıralama: başlıkta tam kelime başı eşleşmesi → başlıkta içerme → açıklamada içerme →
  seçenekte içerme. Eşitlikte ağaçtaki sıra.
- Sonuç satırı `Bölüm › Grup` yolunu yazar; yol i18n'den kurulur.

### 6. Türkçe normalizasyon tuzağı

`"İ".toLowerCase()` çoğu ortamda `"i̇"` (birleşik nokta) üretir; `"I".toLowerCase()` `"i"` verir
ama Türkçede `"ı"` olmalı. Normalizasyon `toLocaleLowerCase("tr")` kullanır **ve** birleşik
noktayı düşürür. Test: `Bİldİrİm`, `BILDIRIM`, `bildirim` üçü de aynı sonucu bulmalı.

---

## Kabul

**İstisnalar**

- [ ] Üç kaynaktan gelen satırlar tek listede, doğru `scope` ile.
- [ ] `DEFAULT` seviyeli ve susturulmamış satır listede **yok**.
- [ ] `mutedUntil` geçmiş satır listede yok ve tembel düzeltme bir kez çalışıyor.
- [ ] Aynı sunucu hem `muted` hem `suppressEveryone` ise listede **bir kez**.
- [ ] Sıralama `tr` collation ile; `Ç` ve `C` doğru sırada.
- [ ] `truncated` bayrağı 200 üstünde çıkıyor.
- [ ] Yeni yazma ucu **açılmadı**; `updateException` üç mevcut uca yönlendiriyor.

**Arama**

- [ ] İndeks `SETTINGS_TREE`'den üretiliyor; statik `SET_HITS` dizisi kodda **yok**.
- [ ] Hiçbir sonuç var olmayan sekmeye götürmüyor (170 satırın tamamı için tarama testi).
- [ ] `Bİldİrİm` / `BILDIRIM` / `bildirim` aynı sonuç kümesini veriyor.
- [ ] 2 karakterden kısa sorgu boş dönüyor.
- [ ] Sıralama önceliği dört kademede doğru.
- [ ] `Bölüm › Grup` yolu i18n'den kuruluyor; sabit Türkçe metin yok.

## Kapı

```
pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
```

Rapor: `docs/prompts/whispr-ayarlar/raporlar/05-s4-rapor.md`
