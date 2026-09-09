# Ş10 — Sunucu oluştur — 940 (Dalga 4)

> Önce oku: `00-ortak-baglam.md`, `SPEC-SUNUCU.md` §7 (tamamı), §8.2 (etiket mantığı ortak).
> Bağımlılık: **Ş0**, **Ş1** (iconColor), Ş8 (kabuk + `DiscoveryTagPicker` + `ToggleRow` +
> `OptionChipGroup`). Paralel: Ş8, Ş9.

---

## Görev

Ray'deki `+` düğmesinden açılan 940 px'lik sunucu oluşturma penceresini yaz: sol form + sağ
**canlı önizleme** kolonu (296). Mevcut `serverModal` akışı bu pencereyle değiştirilir.

Başlık: **Sunucu oluştur** — "Sadece bir ad yeter. Kalan her şeyi sonradan değiştirebilirsin."

---

## 1. Form (§7)

**1 · `SUNUCU İKONU` + `Opsiyonel`**
Solda `68 r22` renkli ikon (kısa ad). Sağda açıklama "Tek görsel, en fazla 4 MB. Yüklemezsen kısa
adından renkli bir ikon üretilir.", altında **6 renk swatch'ı** (`26 r9`, seçilinin çerçevesi
`2px foreground`) — sıra: `primary · info · success · warning · danger · accent-2` — ve
`Görsel yükle` / `Kaldır` düğmeleri.
Renk seçilmezse kısa addan **deterministik** türetilir (harf kodları toplamı % palet uzunluğu) ve
`iconColor` `null` gönderilir (Ş1 sözleşmesi).
Görsel yükleme mevcut `uploadthing` akışını kullanır; yeni yükleme yolu açılmaz.

**2 · `SUNUCU ADI`** + `Zorunlu` + `0/64`, örnek "Örn. Whispr Topluluğu", ipucu "Üyelerin göreceği
tam ad. 2–64 karakter." | **`KISA AD`** + `0/4`, ortalanmış, placeholder addan türetilen baş
harfler, ipucu "Rayda görünür". Kısa ad kullanıcı yazana kadar addan **otomatik** türer.

**3 · `AÇIKLAMA`** + `Opsiyonel` + `0/160` — "Sunucunun ne için olduğunu tek cümleyle anlat."

**4 · `ERİŞİM`** (radyo, 3 seçenek):

| Seçenek               | İkon   | Açıklama                                                        | Sözleşme                             |
| --------------------- | ------ | --------------------------------------------------------------- | ------------------------------------ |
| Özel                  | kilit  | Yalnızca davet bağlantısıyla katılınır.                         | `isPublic:false, discoverable:false` |
| Herkese açık          | küre   | Bağlantıyı bilen herkes katılabilir, Keşfet'te listelenmez.     | `isPublic:true, discoverable:false`  |
| Keşfet'te listelensin | pusula | Herkese açık ve topluluk dizininde aranabilir. **(varsayılan)** | `isPublic:true, discoverable:true`   |

`CreateServerSchema` bugün `isPublic`/`discoverable` taşımıyor (yalnız `AdminCreateServerSchema`
taşıyor). Ş0'da alan eklenmediyse: oluşturmadan hemen sonra `PATCH` ile ayarlanır ve bu **rapora
yazılır**; tercih edilen çözüm sözleşmeye eklemektir — Ş0 raporuna bakılır.

**5 · `KEŞİF ETİKETLERİ`** — Ş8'in `DiscoveryTagPicker`'ı **aynı bileşen** olarak kullanılır
(PROMPT §3). Keşfet dışı bir erişim seçiliyse metin "Yalnızca Keşfet'te listelenen sunucularda
kullanılır…" olur ve blok `opacity: .6`'ya düşer.

**6 · Üç anahtar satırı** (`12px 14px`, `r14`, `surface-base`) — üçü de varsayılan **açık**:
`Üyeler kullanıcı ekleyebilir` ("Kapalıyken yalnızca admin ve sahipler davet gönderebilir.") ·
`GIF gönderimi` · `Dosya yükleme`. → `allowMemberAdds` / `allowGifs` / `allowFileUploads`.

**7 · Katlanır `Gelişmiş`** — kapalıyken sağda özet `2B karakter · silinme bildirimi 60 dakika`.
Açıldığında iki `OptionChipGroup`: `Mesaj karakter limiti` (2B · 250 · 40.000) ve
`Silinen mesaj bildirimi` (5 · 15 · 30 · 60 dakika · 3 · 6 · 24 saat).
**K7:** yeni sunucuda UI varsayılanı SPEC'in değeri; DB varsayılanı değiştirilmez.

## 2. Önizleme kolonu (§7)

296 px, `surface-panel`, sol kenar `border/.5`. `ÖNİZLEME` başlığı, altında üç kart:

1. **Ray satırı**: 44px ikon + ad (boşken `Yeni sunucun`) + `Rayda <KISA AD> olarak görünür`.
2. **Sunucu kartı**: erişim rozeti (`Özel` gri / `Herkese açık` success / `Keşfet'te` primary),
   40px ikon, ad, `1 çevrimiçi` (success nokta) · `1 üye`, altında açıklama — boşken muted
   "Açıklama eklersen üyeler sunucunun ne için olduğunu ilk bakışta anlar."
3. **Sunucuyu oluştur özet kartı**: `Erişim` · `Üye daveti` (Tüm üyeler / Yalnızca admin) ·
   `Medya` (GIF + dosya / Yalnızca GIF / Yalnızca dosya / Kapalı) · `Mesaj limiti`.

Üç kart da forma **canlı** bağlıdır; ayrı state tutulmaz.

## 3. Ayak

Ad 2 karakterden kısayken warning "Devam etmek için bir sunucu adı gir." + pasif düğme;
uzunsa `KISA AD · Ad · Erişim` özeti. Düğmeler: `İptal` · `Sunucuyu oluştur`.

## 4. Sonrası

- Oluşturma başarılıysa pencere kapanır, ray yeni sunucuyu gösterir ve **yeni sunucuya gidilir**
  (mevcut `getServerHref`).
- Hata: alan hatası ilgili alana, genel hata ayakta; mevcut toast düzeni.

## 5. Kırılım

`<1024px`: tek kolona düşer, önizleme kolonu forma **üstten** eklenir (SPEC §11).

---

## Sınırlar

- Sunucuya katılma (`join`) akışı değişmez.
- Yeni yükleme yolu, yeni renk paleti üretilmez.
- Sunucu ayarlarındaki Genel bölümü Ş11'de — swatch mantığı oradan **kopyalanmaz**, ortak parçadan gelir.

---

## Kabul kriterleri

- [ ] Pencere 940; sol form + 296 önizleme; `<1024px`'te tek kolon, önizleme üstte.
- [ ] 6 swatch, kısa ad otomatik türetme, `0/64` · `0/4` · `0/160` sayaçları ve %85 warning.
- [ ] Erişim radyoları üç kombinasyonu doğru gönderiyor (sözleşme ya da PATCH yolu raporlu).
- [ ] `DiscoveryTagPicker` **aynı** bileşen; Keşfet dışı erişimde blok `opacity .6` ve metin değişiyor.
- [ ] Üç anahtar varsayılan açık; `Gelişmiş` katlanır ve özet satırı canlı.
- [ ] Önizleme üç kartı da forma canlı bağlı; boş durum metinleri SPEC'teki gibi.
- [ ] Ad < 2 karakterde pasif düğme + warning; başarıda yeni sunucuya gidiliyor.
- [ ] Yeni hex yok; typecheck/lint/test yeşil.

## Rapor

`raporlar/s10-sunucu-olustur.md` — erişim alanlarının sözleşmeye eklenip eklenmediği açıkça yazılır.
