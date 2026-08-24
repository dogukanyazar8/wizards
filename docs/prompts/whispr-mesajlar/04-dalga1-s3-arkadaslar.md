# Dalga 1 · Ş3 — Arkadaşlar görünümü

**Ön koşul:** Dalga 0 kapısı yeşil. **Paralel:** Ş1, Ş2, Ş4 ile aynı anda.

Kapsam: SPEC-MESAJLAR §4'ün tamamı — dört sekmenin dördü, satır menüsü, öneriler, sıralama,
boş/bilgi şeritleri. Ekranlar: `screens/01`–`04`.

---

## Sahiplenilen dosyalar

```
apps/web/src/components/friends/friends-view.tsx
apps/web/src/components/friends/friends-view.test.tsx        (yeni)
apps/web/src/components/friends/friends-tabs.tsx             (yeni)
apps/web/src/components/friends/friend-row.tsx               (yeni — FriendCard'ın yerini alır)
apps/web/src/components/friends/friend-row-menu.tsx          (yeni)
apps/web/src/components/friends/friend-suggestion-row.tsx    (yeni)
apps/web/src/components/friends/friends-add-card.tsx         (yeni)
apps/web/src/components/friends/friends-requests.tsx         (yeni)
apps/web/src/components/friends/friends-blocked.tsx          (yeni)
apps/web/src/components/friends/friend-card.tsx              (silinir — kullanımı Ana Sayfa'da
                                                              DEĞİL, doğrula: home-friends-strip
                                                              kendi kartını kullanıyor)
apps/web/src/lib/friends/client.ts                           (yeni — Ş2 sözleşmesini çağırır)
apps/web/src/lib/friends/sort.ts + sort.test.ts              (yeni)
```

**Dokunulmaz:** `friends-sidebar.tsx` (eski ray, Mesajlar rotasında kullanılmaz), `components/home/**`.

> `friend-card.tsx` silinmeden önce `graphify query "FriendCard kullanımı"` ile referansları
> doğrula. Ana Sayfa'nın Arkadaşlar şeridi kendi bileşenini kullanıyor; başka bir yerde
> kullanılıyorsa **silme**, yalnız Mesajlar'da kullanma.

---

## Sözleşme (Ş2'den okuduğun)

Ş2 bitmeden çalışabilmek için `lib/friends/client.ts` fonksiyonları **imzasıyla** yazılır ve
gövdesi `TODO(api):` işaretli bir fikstür döndürür. Ş2 kapandığında yalnız gövdeler değişir,
bileşenler değişmez.

---

## İş

### 1. Başlık bloğu (SPEC §4)

Padding `20 26 14`, alt kenar `1px --border/0.45`. `Arkadaşlar` 600/22 display + üç sayaç çipi
(radius 999, padding `4 10`, 600/11.5):

| Çip                  | Ton          | Davranış                                  |
| -------------------- | ------------ | ----------------------------------------- |
| `{n} çevrimiçi`      | success tint | tıklanabilir değil (metin)                |
| `{n} çevrimdışı`     | nötr         | tıklanabilir değil                        |
| `{n} bekleyen istek` | primary tint | **Bekleyen sekmesine götürür** (SPEC §10) |

Üçüncü çip tıklanabilir olduğu için gerçek `button`. İlk ikisi `<span>` ve `role` almaz.

### 2. Sekme grubu (karar #8)

Dört sekme: `Tümü` · `Arkadaş ekle` · `Bekleyen` (sayaç) · `Engellenenler`. Dış kutu radius 13,
padding 4, `--surface-secondary` + `1px --border/0.55`; buton h 33, padding `0 13`, radius 10,
600/12.5; seçili `--primary` + `#fff`.

- `online` sekmesi **düşer**. `?dmTab=online` derin bağlantısı `all`'a yönlendirilir (mevcut
  `isFriendsTabId` genişletilir: tanınan ama artık çizilmeyen değer → `all`). Eski bağlantı 404
  vermez, sessizce doğru sekmeye düşer.
- Sekme grubu `role="tablist"`, butonlar `role="tab"` + `aria-selected`, paneller
  `role="tabpanel"` + `aria-labelledby`. Ok tuşlarıyla gezinme (`ArrowLeft/Right`, `Home`, `End`).

### 3. Arama + sıralama satırı

- Arama alanı placeholder `messages.friends.searchPlaceholder`
  (`Arkadaş ara — isim, kullanıcı adı veya ortak sunucu`). Süzme: ad + `@kullanıcı` + ortak sunucu
  adı, hepsi `toLocaleLowerCase("tr-TR")` ile — `I/ı` tuzağı.
- Sıralama kontrolü `Duruma göre` (600/12.5, `--text-secondary`, ok ikonu) → menü:
  `Duruma göre` · `Ada göre` · `Son etkileşim`. Seçim `updateFriendsSort` ile kalıcı (karar #8).
  Sıralama saf fonksiyonu `lib/friends/sort.ts`:
  - `status`: online → idle → dnd → offline, her grupta ada göre.
  - `name`: `Intl.Collator("tr")` — `Çelik` `Demir`'den önce gelir.
  - `recent`: son DM `lastMessageAt` azalan, hiç konuşulmamışlar sona ada göre.
    Üçü de test edilir.

### 4. `Tümü` sekmesi

İki bölüm; her bölüm başlığı etiket + sayı + ince çizgi.

- **Çevrimiçi:** satır padding `9 12`, radius 14, hover `--surface-soft/0.7`; 44px avatar +
  presence noktası; ad 600/14 + `@kullanıcı` 12 muted; durum satırı 12.5, rengi presence ile
  eşleşir (success'te muted — tasarımın kuralı bu, `Selin` satırı muted).
  - Durum metni Ana Sayfa'nın karar #5'iyle **aynı türetmeyi** kullanır: ses > DND > boşta süresi >
    customStatus. İkinci bir türetme yazma; `lib/home/presentation.ts` içindeki fonksiyonu
    içe aktar.
- **Satır eylemleri** (sağda, `--act` değişkeniyle her zaman ya da hover'da):
  `Mesaj` butonu (h 36, radius 11, `--primary/0.14` zemin, primary metin) → DM açar/kurar;
  sesli ara ve görüntülü ara ikon butonları 34×34 radius 11 → `dm:call:start` (`video` bayrağıyla);
  sonra `...`.
- **`...` menüsü** 212px radius 14: `Profili gör` · `Sunucuya davet et` · `Sessize al` · ayırıcı ·
  `Engelle` (danger) · `Arkadaşlıktan kaldır` (danger).
  - `Profili gör` → mevcut `UserProfilePopover`.
  - `Sunucuya davet et` → **yönetilen sunucu listesi alt menüsü**. Kullanıcının davet üretme
    yetkisi olan sunucular; yetki olmayan sunucu listelenmez. Yetki yoksa satır tamamen çizilmez
    (pasif satır değil).
  - `Engelle` ve `Arkadaşlıktan kaldır` **onay ister** (mevcut `ConfirmDialog` yeniden kullanılır).
  - Menü `Esc` ve dışına tıklamayla kapanır; aynı anda tek menü (Ş0.3'ün `reduceMessagesScreen`
    kuralı — `openMenu` tek slot).
- **Çevrimdışı:** aynı satır, avatar `opacity .62`, alt satır son görülme
  (`{n} saat önce görüldü` / `Dün 23:10` / `3 gün önce` / `1 hafta önce` — biçimlendirme
  `lib/home/presentation.ts`'in mevcut göreli zaman fonksiyonuyla, yenisi yazılmaz).
  Sağda yalnız `Mesaj` + `...`.

### 5. `Arkadaş ekle` sekmesi

Kart padding 22, radius 18, `--surface-card`, `1px --border/0.6`:
başlık `Arkadaş ekle`, açıklama
`Kullanıcı adını etiketiyle birlikte yaz. Büyük küçük harf duyarlı değil.`,
giriş placeholder `kullaniciadi#1234` + `İstek gönder` (primary).

- Mevcut `friends-view.tsx`'in doğrulama/hata eşlemesi (`getAddFriendErrorMessage`) korunur.
- Altında `Ortak sunuculardan öneriler` bölümü — `fetchFriendSuggestions()`. Her satır:
  ad · sunucu adı · `{n} ortak arkadaş` + `Ekle` butonu. `Ekle` iyimser: satır anında
  "istek gönderildi" hâline geçer, hata dönerse geri alınır ve nedeni gösterilir.
- Öneri yoksa tek satır muted boş durum.

### 6. `Bekleyen` sekmesi

- `Gelen istekler` `{n}`: her satırda `Kabul et` (primary) ve `Yoksay`.
  Alt satır: `{sunucu} üzerinden · {göreli zaman}`.
- `Giden istekler` `{n}`: `İstek {n} gün önce gönderildi · yanıt bekleniyor`, sağda
  `İsteği iptal et`.
- İkisi de iyimser güncellenir; `friends:updated` socket olayı geldiğinde liste yenilenir
  (mevcut abonelik korunur).

### 7. `Engellenenler` sekmesi

`Engellenenler` `{n}` — satırlar `{ad} · {tarih} tarihinde engellendi`, avatar `opacity .5`,
sağda `Engeli kaldır`. Listenin altında 12 muted açıklama:
`Engellediğin kişiler sana mesaj gönderemez, aramalarında görünmezsin. Ortak sunucularda mesajları gizlenir.`

Tarih biçimi `12 Mart 2026` — `Intl.DateTimeFormat` ile, kullanıcının `UserDateFormat` tercihine
saygı duyar.

### 8. Boş durumlar

Dördü de "ilgili alanın ortasında tek satır muted metin" (SPEC §10 son paragraf): arkadaş yok,
bekleyen istek yok, engelli yok, arama sonucu yok. Ayrı illüstrasyon yok — mevcut
`EmptyChatIllustration` bu sekmelerde **kullanılmaz**.

### 9. Skeleton

`MESSAGES_DENSITY_BY_SCALE[scale].friendRows` kadar satır. Sohbet rayı geciktiğinde arkadaş
listesi beklemez, tersi de geçerli (PROMPT §8).

---

## Test

`friends-view.test.tsx`:

- Dört sekme çizilir, `online` çizilmez; `?dmTab=online` → `all` seçili.
- `3 bekleyen istek` çipi tıklanınca `pending` sekmesi açılır.
- Satır menüsü: aynı anda tek menü; `Esc` kapatır; `Engelle` onay ister.
- Yetkisiz kullanıcıda `Sunucuya davet et` satırı **hiç** çizilmez.
- Çevrimdışı satırda sesli/görüntülü ara butonu yok.
- `sort.test.ts`: üç sıralamanın üçü, `Intl.Collator("tr")` ile `Çelik < Demir`.
- Öneri satırında `Ekle` iyimser geçiş + hata geri alma.

## Kapı

```bash
pnpm --filter @wizards/web test -- --test-name-pattern "(friends|sort)"
pnpm typecheck && pnpm lint
pnpm --filter @wizards/web e2e:a11y
```

Rapor: `raporlar/04-rapor.md`.
