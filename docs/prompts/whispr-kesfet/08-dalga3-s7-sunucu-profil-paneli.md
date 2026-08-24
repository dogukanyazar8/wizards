# Dalga 3 · Ş7 — Sunucu profili paneli (326 px)

**Ön koşul:** Ş5 (sayfa iskeleti) + Ş6 (kart dilleri) + Ş3 (profil ucu genişletmesi).
**Paralel:** Ş8, Ş9. **Kapı:** `server-profile-panel.test.tsx` yeşil.

---

## Sahiplenilen dosyalar

```
apps/web/src/components/discover/server-profile-panel.tsx   (+ .test.tsx)
apps/web/src/components/discover/server-profile-stat.tsx
apps/web/src/components/discover/server-profile-mutual-row.tsx
```

`components/shell/server-member-panel.tsx` **okunur** (iskelet dili: başlık + kaydırılan gövde +
sabit ayak), değiştirilmez.

`DiscoverPage`'e eklenen prop: `panelServerId: string | null`. Sayfa paneli
`panel !== null` iken çizer ve `discoverQueryKeys.profile(serverId)` sorgusunu açar.

---

## 1. Kabuk

```
width 326, background H(surface-panel), border-left 1px H(border/.45)
başlık: pad 15/16/13, border-bottom 1px H(border/.45)
  "SUNUCU PROFİLİ" 600/10.5/display/.15em/uppercase H(text-muted)
  kategori pili: pad 3/8, r 999, kategori/.14 zemin + tam ton, 600/10
  kapat 30×30 r 10, sağa yaslı, aria-label
gövde: gap 14, pad 15/16, overflow-y auto
ayak: border-top 1px H(border/.5); birincil CTA flex 1 h 36 + "Paylaş"
```

`category === null` ise kategori pili **çizilmez** (Ş3 §B.3) ve profil bloğunun tonu
`--primary`'e düşer.

---

## 2. Profil bloğu

```
pad 15, r 18, background kategori tonu /.07, border 1px kategori tonu /.3
54×54 tile: r 17, tone/.14 zemin + tam ton, 600/19/display
  ← negatif margin YOK, halka YOK; arka planla çakışmaz
ad 600/16.5/1.25/display, nowrap + ellipsis
meta: "{online} çevrimiçi" (success nokta) · 3px ayırıcı · "{members} üye"
açıklama 12.5/1.6
etiketler r 999, H(surface-card) + H(border/.6) kenar, nowrap
```

**Mavi doğrulama ikonu yoktur** (K10). Kabul kriteri ayrıca "54 px tile arka planla
**çakışmıyor**" diyor — sunucu kartındaki `-19px` + `3px` halka dili buraya **taşınmaz**.

---

## 3. İstatistik ızgarası

```
grid-template-columns: repeat(3, 1fr), gap 8
kutu: pad 11/12, r 14, H(surface-card), border 1px H(border/.6)
değer 600/15/display · etiket 10.5 H(text-muted)
```

| Kutu            | Kaynak                                                    |
| --------------- | --------------------------------------------------------- |
| `{n} Kanal`     | `channelCount`                                            |
| `{n} Sesli oda` | `voiceRoomCount` (Ş3 §B.2) — `voiceActiveCount` **değil** |
| `{yıl} Kuruluş` | `createdAt`'ın yılı                                       |

Değer bir sayı, etiket bir kelime: erişilebilir metin `"{n} kanal"` biçiminde birleşiktir
(`aria-label` kutuda, parçalar `aria-hidden`).

---

## 4. Kanallar listesi

Etiket + sayı başlığı, sonra satırlar:

```
satır: pad 8/9, r 11; 14 px hash ikonu; ad 500/12.5 ellipsis; sağda hareket sayısı 500/11
```

Kaynak `ServerPublicProfile.channels`. `isPrivate` kanallar **listelenmez** (uç zaten
göndermiyorsa değişiklik yok; gönderiyorsa istemcide süzülür ve bu bir `TODO(api):` olarak
raporlanır). `hasMoreChannels` doğruysa listenin altına `+{channelCount - gösterilen} kanal daha`
satırı gelir — tıklanabilir değil, bilgi satırı.

Hareket sayısı `liveCount` alanından; `null` ise sayı çizilmez.

---

## 5. Tanıdıkların — **satır listesi**

Kabul kriteri: "**avatarlar üst üste binmiyor**". Bu bir avatar yığını değildir.

```
gap 2; satır: pad 7/8, r 12
28 px avatar + 9 px durum noktası (2px H(surface-panel) kenar)
ad 500/12.5
rol pili: Yönetici → H(primary/.16)/H(primary) · Üye → H(surface-soft)/H(text-muted)
altında not: "Ortak sunucularından tanıdığın kişiler burada da üye."
```

Kaynak `mutualFriends[]` (Ş3 §B.1'de `role` + `presence` ile genişletildi). Liste boşsa bölüm
başlığı ve not **çizilmez** (boş başlık bırakılmaz).

Satır tıklanınca `UserProfilePopover` açılır.

---

## 6. Ayak CTA'sı

```
border-top 1px H(border/.5)
birincil: flex 1, h 36 — joined ? "Sunucudan ayrıl" (H(surface-tertiary)) : "Sunucuya katıl"
ikincil: "Paylaş"
```

`Sunucuya katıl` Ş3'ün `joinDiscoverServer`'ını çağırır, `Sunucudan ayrıl` `leaveDiscoverServer`'ı.
İkisi de sayfanın (Ş5) mutasyonuna prop callback ile bağlanır — panel mutasyon çağırmaz.

`Paylaş` sunucunun davet adresini (`inviteAddress`) panoya kopyalar ve toast gösterir.
`inviteAddress === null` ise buton pasiftir (`disabled` + `title`).

---

## 7. Klavye ve odak

- Açılışta odak panelin **ilk odaklanabilir öğesine** (kapat düğmesi) gider.
- `Esc` paneli kapatır (modal açıkken önce modal — sıra Ş5 §2.3'te).
- Odak tuzağı: `Tab` panelin içinde döner. Panel bir overlay değil, kolon olduğu için tuzak
  **yalnız `<1100px` overlay modunda** kurulur (Ş9); geniş ekranda panel sayfa akışının parçasıdır
  ve tuzak kurulmaz — aksi halde kullanıcı ızgaraya `Tab` ile dönemezdi.
- Kapanışta odak, paneli açan öğeye (kart veya `Önizle` butonu) döner. Açan öğenin kimliği
  sayfada (`Ş5`) tutulur; panel yalnız `onRequestClose` çağırır.
- Panel `role="complementary"` + `aria-label` = `discover.profile.label` + sunucu adı.

---

## 8. Yükleme ve hata

- Yüklenirken: başlık çizilir (sunucu adı ızgaradaki karttan `placeholderData` ile gelir), gövde
  skeleton. Panel **hiç** boş açılmaz.
- Hata: gövde yerine küçük bir hata bloğu (`Profil yüklenemedi` + `Yeniden dene`). Panel kapanmaz
  — kullanıcı paneli kendisi kapatır.

---

## 9. Testler

- 54 px tile'ın negatif margin veya `box-shadow` halkası **taşımadığı** (stil denetimi)
- `category === null` iken kategori pili yok ve blok tonu `--primary`
- `voiceRoomCount` kutusu `voiceActiveCount`'u **değil** onu gösteriyor
- `mutualFriends` boşken bölüm başlığı ve not çizilmiyor
- rol pili iki durumu doğru token'ları alıyor
- avatarların üst üste binmediği: satırlar `gap` ile ayrık, negatif margin yok
- `Esc` `onRequestClose` çağırıyor
- geniş ekranda odak tuzağı **kurulmuyor** (`Tab` panelin dışına çıkabiliyor)
- `inviteAddress === null` iken `Paylaş` pasif
