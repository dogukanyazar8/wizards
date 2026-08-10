# Faz 5 — 6d + 6e: Sunucu profili + etkinlik yönetimi + paket kapanışı

> Önce `00-ortak-baglam.md` oku. Branch `uat`. caveman ultra. Kararsız kalırsan sor. Cihaz testini kullanıcı yapar. İzinsiz commit yok.

**Ön koşul:** Faz 4 landed, `01`–`04` raporları okundu. Genişletilmiş `ServerPublicProfile` alan listesi `01-rapor.md`'den alınır.
**Tasarım:** HTML `212–278` (6d), `281–321` (6e). PROMPT.md `366–417`.
**Hedef:** eski "Topluluk" kartını tek bir 6d/6e gövdesiyle değiştir, iki rotayı ondan besle, etkinlik özelliğini mobilde tamamla, paketi kapat.

---

## A0. Faz 3/4'ten devralınan durum — önce oku

`03-rapor.md` §2/§6 ve `04-rapor.md` §2/§8 bağlayıcı. Özet:

### A0.1 — Dört tercih alanı zaten iki cache'te

`starred` / `muted` / `notificationLevel` / `inviteAddress` **bootstrap sunucu özetinde** ve `ServerPublicProfile`'da birlikte yaşıyor. Profil ekranı bunları **ikinci bir uçtan çekmez**; yazma tek yoldan:

- Yazım: `runMobileServerUserSettingsUpdate` (optimistic + geri alma + hata toast'ı + tercih adı bazında in-flight koruması). Profil ekranı yıldız/sessize alma gösterecekse **aynı fonksiyonu** çağırır, ikinci mutasyon yazmaz.
- Cache: `patchMobileServerUserSettingsCaches` yalnız gönderilen anahtarları yazar; `muted` ile `notificationLevel` bağlanamaz (testle kilitli).

### A0.2 — Profil "⋯" menüsü = mevcut 6c bileşeni

`workspace-server-menu-sheet.tsx` yeniden kullanılır. **Tek panel, iki katman** modeli (bildirim seviyesi aynı `BottomSheet` içinde içerik değişimiyle geliyor) bozulmaz — üst üste iki overlay yok.

Test tuzağı (04-rapor §8.7): `mobile-servers-6c.test.tsx` `BottomSheet`'i mock'luyor. Profil testleri aynı bileşeni render ediyorsa **aynı mock kalıbı** gerekir.

Menüde korunan testID'ler: `mobile-server-profile-open-<id>`, `mobile-server-members-open-<id>`, `mobile-server-settings-open-<id>`, `mobile-server-invite-share-<id>` (hızlı aksiyon kartında).

### A0.3 — Kategori sırası düzeltildi

Faz 3 §A0.3 profil sorgusuna `orderBy: [{ category: { position: "asc" } }, { position: "asc" }, { id: "asc" }]` ekledi. `groupMobileProfileChannelsByCategory`'nin "ilk görülme = tasarımın sırası" sözleşmesi **artık doğru**. §C2'de yeniden sıralama yapma.

### A0.4 — Etiket düzenleme sunucu ayarlarında, profilde değil

Faz 4 §E mobil etiket editörünü `mobile-server-settings-screen.tsx`'e koydu (`mobile-server-tags-card`, yalnız `canManageServer`). 6d profilde etiketler **salt okunur çip**; dokunma keşif aramasına gider. Profile editör koyma.

Not: etiket girişinde slugify yok — boşluklu metin `ServerTagSchema` tarafından reddediliyor (04-rapor §2.8). Profil bunu değiştirmez.

### A0.5 — Sahip ayrılma öğesi görmez

Faz 4 kararı: ayrılma satırı sahipte **hiç render edilmiyor** (servis zaten reddediyor; 400 dönecek buton gösterilmiyor). "Önce sahipliği devret" uyarısı karşılıksız kaldı, ürün kararı beklemede. 6e bu kuralı **aynen** izler.

### A0.6 — Etkinlik ekranları: yalnız param tipleri var

`ServerEvents` ve `ServerEventForm` param tipleri `mobile-navigation-types.ts:107/109`'da. **Ekran, navigator kaydı ve container yok** — §D'nin üç dosyalı kaydı hâlâ yapılacak.

### A0.7 — Taban çizgileri (Faz 4 sonu)

`types 213` · `web 2144` · `mobil node 1729` · `jest 132 süit / 1214 test`. Düşerse regresyon.

### A0.8 — Alt aksiyon çubuğu kararı (kullanıcı, 2026-08-10)

**Tek sabit çubuk, 6d'nin üçlüsü:** `Sunucuyu aç` + bildirim + bağlantı. Scroll'a göre değişmez. 6e'nin ayrıl butonu **çizilmez** — ayrılma 6c menüsünde ve sunucu ayarlarında zaten var, üçüncü yol açılmaz. §C6 bu kararla kapandı.

---

## A. Yapısal karar (kullanıcı, bağlayıcı)

Bugün `apps/mobile/src/app/screens/about/about-community-invite-screen.tsx` (26.4 KB) **tek gövdeyi iki rotaya** servis ediyor: `ServerProfile` (serverId) ve `CommunityInvite` (davet önizleme). Yeni 6d/6e gövdesi **ikisini birden** karşılar; eski gövde **silinir**.

- Yeni dosyalar: `apps/mobile/src/app/screens/server-profile/server-profile-screen.tsx` + `.styles.ts` (+ gerekirse bölüm bileşenleri). Repo kalıbı: ekran + ayrı `.styles.ts` (`mobile-server-settings-screen.styles.ts` gibi).
- `about-screen-shells.tsx:63–64` export'ları yeni gövdeye yönlenir; `MobileCommunityInviteScreen` ve `MobileServerProfileScreen` aynı bileşenin iki kaynak varyantı olur (`{ source: "server", serverId }` / `{ source: "invite", slug }`).
- Eski gövde silinir; kullanılmayan stil/kopya anahtarları da silinir.

**Üye-olmayan varyantı** tasarımda tanımlı: birincil buton `Sunucuya katıl`, bildirim butonu gizli, özel kanallar kilitli ve %50 opak/dokunulamaz, `Katılımın` satırı gizli.

---

## B. 6d — Üst bölüm

### B1 — Banner ve header

- Banner `height: 186`, `linear-gradient(135deg, #6D5DF6 0%, #4F46E5 52%, #3B2FC4 100%)`. RN'de `expo-linear-gradient` (repoda kullanılan gradyan çözümü neyse o).
- Sağ üstte `190×190` daire `rgba(255,255,255,.10)`, `top: -30, right: -40`.
- Sunucunun kendi `bannerUrl`'i varsa gradyan yerine görsel + üstüne `rgba(20,23,42,.25)` katman.
- Status bar içeriği **beyaz** (banner üstünde). Kaydırıldığında kompakt beyaz header'a dönerken **koyu**ya döner — `StatusBar` stilini scroll pozisyonuna bağla.
- Header butonları `36×36 r13`, `rgba(255,255,255,.18)`, ikon `17 #fff`: solda **geri**, sağda **paylaş** ve **"⋯"** (6c menüsünü açar). Kapsayıcı `padding: 6px 16px 0`, `gap: 8`.

### B2 — Kimlik bloğu

Beyaz/`#F6F7FB` sayfa `top: 150`, üst köşeler r26, yatay `16`.

- **Logo** `74×74 r24`, `4px #F6F7FB` çerçeve, `marginTop: -30` (banner'a taşar), fallback `24/800`.
- Logonun sağında durum çipleri (`alignItems: flex-end`, `paddingBottom: 6`, `gap: 6`):
  - `● 1 çevrimiçi` — `#E7F6EE`, `6×6 #22A366` nokta, `11/800 #1B8552`
  - Ortam/rozet çipi `UAT` — `#FFF3E4`, `11/800 #B45309`. **Opsiyonel**; kaynağı yoksa render edilmez. Kaynak: sunucu etiketlerinden ayrı bir "ortam etiketi" **yoktur** — bu çipi `tags` içinden türetme; veri yoksa **gizle** ve rapora yaz.
- **Ad**: `22/800`, `lineHeight 25.3`, `letterSpacing -0.44`, 2 satır clamp (`getMobileServerNameLayout(name, "card")` yerine profil varyantı). Yanında `17px` **doğrulama rozeti** (primary madalya + beyaz check) — yalnız `verified === true`.
- **Davet adresi**: `12.5/600 #6B7194` + `13px` kopyala ikonu `#4F46E5`. Dokunma → panoya kopyala + **success toast** (Bölüm 3: "Bağlantı kopyalandı"). `inviteAddress` null ise satır gizlenir.
- **Açıklama**: `13 / lineHeight 19.5 / #4C5270`, en fazla 3 satır + **"Devamı"**. Açıklama yoksa blok **gizlenir** (boş kart bırakma — kabul kriteri 19).
- **Etiketler**: `#EEF0FE` r9 `padding 5px 10px`, `11/700 #4F46E5`. Dokunma → sunucu keşif aramasına gider (`Discover` rotası, arama terimi = etiket). Etiket yoksa blok gizlenir.

### B3 — İstatistik kartı

Beyaz r18, `1px #E7E9F4`, 4 eşit hücre, aralarında `1px #EDEFF8` ayraç, hücre `padding: 12px 0`, `gap: 2`. Değer `17/800`, etiket `10.5/600 #8A90B0`.

`Üye` · `Kanal` · `Seste` (değer `#22A366`) · `Bu hafta`.

`getMobileServerProfileStats` (Faz 2 B3) besler. `weeklyMessageCount === null` → değer `—`, kart yine görünür.

### B4 — Arkadaşlar satırı

Beyaz r16, `padding: 10px 12px`, `marginTop: 10`, `gap: 10`. Avatarlar `26×26 r50%`, `2px #fff`, `marginLeft: -9`, `9.5/800`. Metin `Arkadaşlarından **3 kişi** bu sunucuda` — `12.5/600 #4C5270`, sayı `800 #1E2235`. Sağda chevron `14 #C0C5DC` → ortak arkadaş listesi.

`mutualFriendCount === 0` → **satır gizlenir**.

### B5 — Yaklaşan etkinlik kartı

Beyaz r16, `padding: 11px 12px`, `marginTop: 8`, `gap: 11`.

- Sol tarih bloğu `width: 42`, `#EEF0FE` r12, `padding: 5px 0`, `gap: 1`: etiket `BUGÜN` `9.5/800 ls .57 #4F46E5`, saat `14/800 #4F46E5`. `formatMobileEventDateBlock` (Faz 2 B3).
- Orta: etkinlik adı `13.5/800`; alt satır `{channelName} · {n} kişi katılıyor` `11.5/600 #6B7194`.
- Sağda pill `#EEF0FE` r11 `padding 7px 12px`, `11.5/800 #4F46E5`: `resolveMobileEventAction` sonucuna göre **Katıl** (≤15 dk / başladı → etkinliğin `channelId`'sine bağlanır) veya **Hatırlat** (>15 dk → interest toggle).
- `upcomingEvent === null` → **kart gizlenir**.

### B6 — KANALLAR ön izleme

Bölüm başlığı `KANALLAR` + toplam sayı (`10.5/800 ls 1.26 #8A90B0` + `10.5/700 #C0C5DC`), `padding: 14px 4px 6px`.

Altında ilk kanallar **tek kart** içinde: beyaz r16, `1px #E7E9F4`, satır `padding: 10px 11px`, `gap: 10`, ayraç `1px #EDEFF8`.

- İkon kutusu `28×28 r9`: ses → `#E7F6EE` + `#22A366`; metin → `#F6F7FB` + `#6B7194`; ikon `13`.
- Ad `13.5/700`.
- Sağda durum: ses kanalı `{n} kişi` `11/700 #22A366`; metin kanalı son etkinlik `31 Tem` `11/600 #9AA0BC`.

`getMobileProfileChannelPreview` (Faz 2 B3) besler. Kaydırınca 6e'deki tam liste gelir.

### B7 — Alt aksiyon çubuğu (sabit)

Beyaz, üstte `1px #E7E9F4`, `padding: 12px 16px 26px`, `gap: 9`, elevation `0 -8px 24px rgba(30,34,53,.06)`.

- **"Sunucuyu aç"** — esneyen (`flex: 1`) primary, `height: 50`, r17, `15/800 #fff`, elevation `0 8px 18px rgba(79,70,229,.32)`.
- **Bildirim** `50×50 r17`, `#F6F7FB` + `1px #E7E9F4`, zil `19 #4F46E5` → bildirim ayarları (Faz 4 D1 ile aynı yüzey).
- **Bağlantı** `50×50 r17`, zincir → davet bağlantısını kopyala/paylaş (2a).
- Üye değilse: birincil buton **"Sunucuya katıl"**, bildirim butonu **gizlenir**.

---

## C. 6e — Alt bölüm (aynı ekranın kaydırılmış hâli)

### C1 — Kompakt yapışkan header

Kaydırınca banner daralır ve bu header'a dönüşür: beyaz, altında `1px #E7E9F4`, `padding: 6px 16px 10px`, `gap: 10`.

- Geri `34×34 r12`, `#F6F7FB` + `1px #E7E9F4`, ikon `16 #1E2235` 2.4
- Sunucu avatarı `28×28 r10`, `10.5/800`
- Ad `15/800`, **tek satır + ellipsis** (6f: `sticky` bağlamı)
- "⋯" `34×34 r12`, ikon `16` fill `#4F46E5`

Geçiş sürekli olmalı (banner yüksekliği → header opacity), zıplama yok.

### C2 — Kategorili kanal listesi

Her kategori için başlık `KATEGORİ ADI + sayı` (`padding: 12px 4px 6px` ilk, `13px 4px 6px` sonrakiler) — **chevron yok**, profil listesi daraltılamaz.

Altında beyaz kart r16, `1px #E7E9F4`, satır `padding: 10px 11px`, ayraç `1px #EDEFF8`:

- **Metin kanalı**: `#` ikonu + ad + son etkinlik tarihi `11/600 #9AA0BC`.
- **Ses kanalı**: hoparlör + ad + sağda katılımcı avatarları (`20×20 r50%`, `2px #fff`, `marginLeft: -7`, `8/800`) veya `Boş` `11/600 #9AA0BC`.
- **Özel kanal**: sağda kilitli **Özel** çipi — `#F1F2F8` r7 `padding 3px 7px`, kilit `9 #8A90B0`, metin `9.5/800 #8A90B0`.

> **Faz 1'de düzeltildi — tasarımın "üye değilse satır %50 opak ve dokunulamaz" hâli ulaşılamaz.** `isPrivate`, kanalın **@everyone'a kapalı** olması demektir; liste ise **görüntüleyenin** `VIEW_CHANNEL` iznine göre süzülür (`server-public-profile-service.ts:275–279`). Üye olmayan bu kanalı hiç görmez — ad sızmaz. Dolayısıyla "Özel" çipi yalnız **rolüyle erişebilen üyede** görünür ve satır tam opak, dokunulabilirdir. Soluk/kilitli varyantı yazma.

`groupMobileProfileChannelsByCategory` (Faz 2 B3) besler.

### C3 — "Kalan n kanalı gör"

Beyaz buton r14, `1px #E7E9F4`, `padding: 10px 0`, `marginTop: 9`, `12.5/800 #4F46E5` + chevron `13`. Açınca kalan kategoriler eklenir (tek yönlü, kapanmaz). Kalan 0 ise buton yok.

### C4 — YÖNETİCİLER

Beyaz kart r16. Satır `padding: 10px 11px`, `gap: 10`:

- Avatar `32×32 r11`, `11.5/800`; çevrimiçiyse sağ altta `10×10 r50% #22A366` + `2px #fff`.
- Kullanıcı adı `13.5/800`; alt satır durum/son görülme `11/600 #8A90B0` (`Çevrimiçi` / `2 saat önce`).
- Sağda rol çipi `9.5/800 ls .38 r8 padding 4px 8px`: **SAHİP** `#FFF3E4`/`#B45309`, **YÖNETİCİ** `#EEF0FE`/`#4F46E5`.
- Dokunma → kullanıcı profili popover'ı (mevcut profil kartı bileşeni — yenisini yazma).

Kaynak `ServerPublicProfile.admins` (Faz 1 B2). Presence `AppSession.lastSeenAt` türevi; `lastMessageAt` kullanma.

### C5 — HAKKINDA

Beyaz kart r16, satır `padding: 11px 12px`, ayraç `1px #EDEFF8`. Etiket `13/600 #6B7194`, değer `13/700`:

- **Oluşturulma** — `12 Mart 2025` (locale'e göre biçimlendirilmiş tarih)
- **Katılımın** — `4 ay önce`; üye değilse **satır gizlenir**
- **Erişim** — `Davetle` / `Herkese açık` / `Onaylı` (`getMobileServerAccessLabel`)

### C6 — Alt aksiyon çubuğu — kapandı, ayrı 6e varyantı yok

Kullanıcı kararı (A0.8): **tek sabit çubuk, 6d'nin üçlüsü.** Scroll pozisyonuna göre değişmez.

- 6e'nin `#FDECEC` zeminli ayrıl butonu **çizilmez**. Ayrılma 6c menüsünde ve sunucu ayarlarında var; üçüncü yol açılmaz (ve sahipte hiçbirinde görünmez — A0.5).
- Tasarımdan bilinçli sapma; rapora yaz.

---

## D. Etkinlik yönetimi (mobil)

Faz 1 uçları açtı, web admin yüzeyi orada. Mobil tarafta:

1. **Etkinlik listesi ekranı** (`ServerEvents`) — 6d kartının "tümünü gör" yolu ve yönetici girişi. Yaklaşan + geçmiş ayrımı. Rota kaydı **üç dosya** (00 §4 / Faz 2 B6): param tipi (zaten var), `mobile-navigator.tsx`, `mobile-screen-containers.tsx`.
2. **Etkinlik formu** (`ServerEventForm`) — oluştur/düzenle. Alanlar: ad, açıklama, kanal seçimi, başlangıç, bitiş (opsiyonel), tip. Doğrulama Faz 1 şemasından. Yalnız `canManageServer`.
3. **İptal** — onay dialogu, `cancelMobileServerEvent`.
4. **İlgi/hatırlat** — 6d karttaki `Hatırlat` ve liste satırlarındaki toggle aynı mutasyona gider, idempotent (Faz 1 B3).

Etkinlik yoksa liste boş durumu + yetkiliye "Etkinlik oluştur" CTA'sı; yetkisize düz boş durum.

---

## E. Silinecekler

1. `apps/mobile/src/app/screens/about/about-community-invite-screen.tsx` eski gövdesi ve `.styles.ts`'inin kullanılmayan kısımları.
2. Bu gövdeye özel, artık çağrılmayan kopya anahtarları.
3. Eski gövdenin testleri — yerine yeni gövdenin testleri.

---

## F. Yapılmayacaklar

- Etkinlik için tekrarlayan etkinlik, takvim entegrasyonu, push hatırlatma yazmak.
- `ScheduledEvent.imageUrl` için yükleme akışı kurmak.
- Ortak arkadaş listesi ekranını yeniden tasarlamak — mevcut yüzeye bağla.
- Kullanıcı profili popover'ını değiştirmek.
- Keşif ekranını yeniden tasarlamak; etiket dokunuşu yalnız arama terimi geçirir.
- Banner düzenleme/yükleme akışı eklemek (profil banner repositioning ayrı bir iş).

---

## G. Kapı

```bash
pnpm --filter @wizards/mobile typecheck
```

```bash
pnpm --filter @wizards/mobile test
```

`apps/mobile` dizininden (tam süit — taban çizgisi A0.7: **132 süit / 1214 test**):

```bash
npx jest
```

Tam paket kapısı:

```bash
pnpm --filter @wizards/types test
```

```bash
pnpm --filter @wizards/web test
```

```bash
graphify update .
```

### Paket kabul kriterleri (PROMPT.md 14–20 + bu paketin kararları)

| #   | Kriter                                                                                                                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | **A0 uyumu:** profil dört tercih alanını ikinci uçtan çekmiyor; yazım `runMobileServerUserSettingsUpdate`'ten; profil "⋯" mevcut 6c bileşenini iki-katman modelini bozmadan açıyor; kategori yeniden sıralanmıyor; profilde etiket editörü yok; sahipte ayrılma öğesi yok; alt çubuk tek ve sabit |
| 14  | Kategori başlıklarında hiçbir `+` yok; kod tabanında buton ve handler kaldırıldı; tek giriş noktası "+ Kanal" FAB'ı                                                                                                                                                                               |
| 15  | Uzun ad testi: `"Türkiye Mobil Uygulama Geliştiricileri ve Tasarımcıları Topluluğu Resmî Sunucusu"` 390px'te iki satır + `…`, butonlar kaymıyor, ad 96px'e sıkışmıyor                                                                                                                             |
| 16  | Başlıkta en fazla iki ikon butonu (ara + "⋯"); bilgi/davet/ayarlar menüden erişilebiliyor; eski header butonları silindi                                                                                                                                                                          |
| 17  | Filtre şeridi doğru filtreliyor, okunmamış sayısı canlı veriden, seçim kullanıcı+sunucu başına saklanıyor                                                                                                                                                                                         |
| 18  | Kapalı kategoriler döndürülmüş chevron + soluk başlık + (okunmamış varsa) primary nokta; boş kategoriler listede                                                                                                                                                                                  |
| 19  | 6d/6e birebir; doğrulama rozeti, adres kopyalama, 4'lü istatistik, arkadaşlar, etkinlik kartı, kategorili kanal listesi, yöneticiler, hakkında **gerçek API'den**; veri yoksa blok **gizli** (boş kart yok)                                                                                       |
| 20  | Alt aksiyon çubuğu sabit; üye olmayanda birincil buton `Sunucuya katıl`. **"Özel kanallar kilitli" maddesi düştü** — üye olmayan o kanalları hiç görmüyor (Faz 1 doğrulaması, bkz. §C2 notu)                                                                                                      |
| +   | Tek gövde iki rotayı besliyor; eski `about-community-invite-screen` gövdesi silindi                                                                                                                                                                                                               |
| +   | Etkinlik CRUD + ilgi uçtan uca; `Katıl`/`Hatırlat` 15 dk eşiği iki istemcide aynı fonksiyondan                                                                                                                                                                                                    |
| +   | Tüm dokunma hedefleri ≥ 44px; sheet'ler sürüklenerek kapanıyor                                                                                                                                                                                                                                    |
| +   | Tüm geçici mesajlar Bölüm 3 toast bileşeninden geçiyor                                                                                                                                                                                                                                            |

## H. Rapor

`docs/prompts/sunucular-6a-6f/raporlar/05-rapor.md` — 00 §8. Ek olarak:

- Yirmi kabul kriterinin madde madde durumu (geçti / geçmedi / kapsam dışı + gerekçe).
- Silinen eski gövdenin satır sayısı ve yerine gelen dosya haritası.
- 6e alt çubuk kararının sonucu (kullanıcı ne dedi).
- `UAT` ortam çipinin kaynağı bulunamadıysa nasıl ele alındı.
- **Cihaz test listesi** — kullanıcının elle koşacağı senaryolar:
  1. Uzun adlı sunucu: 6a başlık, 6b kart, 6c kimlik, 6d ad, 6e yapışkan başlık — beşi de 6f tablosuna uyuyor mu
  2. Yetkisiz hesap: FAB yok, `Sunucu ayarları` yok, etiket düzenleyici yok
  3. Üye olmayan hesap davet linkiyle: `Sunucuya katıl`, bildirim butonu yok, özel kanallar kilitli
  4. Sahip hesabı: ayrılmaya çalış → devir uyarısı
  5. Canlı ses kanalı: filtre `Sesli`, canlı üstte, `Katıl` bağlanıyor; boş ses kanalı satırı butonsuz
  6. Sessize al + Yıldızla: uçak modunda dene (hata geri alma), yıldızdan sonra rail sıralaması
  7. Etkinlik: 20 dk sonrası (`Hatırlat`) ve 10 dk sonrası (`Katıl`) iki etkinlik
  8. Koyu tema: 6a–6e beş ekran
  9. Küçük ekran (≤360px) ve büyük yazı tipi ayarı
  10. Kategori daralt/aç + filtre seçimi uygulamayı kapat-aç sonrası korunuyor mu
