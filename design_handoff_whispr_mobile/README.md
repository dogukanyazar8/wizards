# Handoff / Uygulama Prompt'u: Whispr Mobile Redesign

> Bu dosyayı olduğu gibi Claude Code'a veya Codex'e verebilirsin. Yanındaki
> `Whispr Mobile Redesign.dc.html` dosyası **HTML ile hazırlanmış tasarım referansıdır**
> (10 ekranlık hi-fi mock). Görev bu HTML'i kopyalamak değil; bu tasarımları
> **mevcut Whispr mobil kod tabanının kendi ortamında** (mevcut framework, navigasyon,
> state ve API katmanıyla) **birebir, hiçbir görsel fark olmadan** yeniden inşa etmektir.
>
> **Gerçek kaynak `Whispr Mobile Redesign.dc.html` dosyasıdır** — tüm ölçü, renk ve
> yazı değerleri orada inline style olarak yazılıdır; tereddütte kaldığın her değeri
> HTML'den oku, tahmin etme. `screenshots/` klasöründeki PNG'ler hızlı görsel referanstır
> (düşük çözünürlüklü önizleme); piksel değerleri için HTML esas alınır.

---

## GÖREV

Whispr mobil uygulamasının tüm ekranlarını aşağıdaki spesifikasyona göre yeniden tasarla ve uygula.

**Kesin kurallar:**

1. **Dummy / sahte veri YASAK.** Tüm ekranlar uygulamanın mevcut gerçek veri kaynaklarına bağlanacak: sunucu listesi, kanal listesi, mesajlar, DM konuşmaları, bildirimler, ses odası katılımcıları, kullanıcı profili, okunmamış sayaçları, çevrimiçi durumları — hepsi mevcut API / store / websocket katmanından gelecek. README'deki örnek içerikler ("UAT ENV", "welcome-chat", "CodeX" vb.) yalnızca ekran görüntüsü referansıdır; koda hardcode edilmeyecek.
2. Mevcut kod tabanını önce keşfet: navigasyon yapısı, tema/stil altyapısı, API istemcisi, auth/oturum, mevcut ekran dosyaları. Yeni tasarımı mevcut mimariye entegre et; mimariyi gereksiz yere değiştirme.
3. Her ekran için **loading / empty / error** durumlarını gerçek veriyle uyumlu şekilde uygula (aşağıda tanımlı).
4. **Açık + koyu tema** birlikte gelecek; sistem temasını takip etsin, Profil > Görünüm'den elle seçilebilsin (Açık / Koyu / Sistem). Tema tercihi kalıcı saklanacak.
5. Mevcut izin akışı korunacak: mikrofon ve bildirim izinleri **yalnızca kullanıcı aksiyonuyla** istenir (mevcut "requires-native-permission" davranışı).
6. Metinler Türkçe; mevcut i18n altyapısı varsa string'ler oraya eklenecek.

---

## FIDELITY

**High-fidelity, birebir.** Renk, tipografi, boşluk, köşe yarıçapı ve bileşen ölçüleri piksel piksel uygulanmalı; "benzer" değil **aynı** olmalı. Referans: `Whispr Mobile Redesign.dc.html` (390×844 ekranlar, 10 adet).

## REFERANS DOSYALAR

- `Whispr Mobile Redesign.dc.html` — kanonik tasarım kaynağı (tüm değerler inline style; tarayıcıda açıp DevTools ile ölçülebilir)
- `screenshots/1a-sunucular.png` — Sunucular / kanal listesi
- `screenshots/1b-kanal-sohbet.png` — Kanal sohbet
- `screenshots/1c-mesajlar.png` — Mesajlar (DM)
- `screenshots/1d-bildirimler.png` — Bildirimler
- `screenshots/1e-ses-odasi.png` — Aktif ses odası
- `screenshots/1f-profil.png` — Profil & Ayarlar
- `screenshots/1g-sunucu-sheet.png` — Sunucu değiştirici bottom sheet
- `screenshots/1h-sol-rail-varyanti.png` — Sol rail varyantı (alternatif; **varsayılan uygulanacak olan 1a'dır**, 1h yalnızca referans)
- `screenshots/1i-koyu-sunucular.png` / `1j-koyu-sohbet.png` — Koyu tema referansları

---

## NAVIGASYON MİMARİSİ (yeni)

Alt tab bar **5 sekmeden 4 sekmeye** iner:

| Sekme | İçerik |
|---|---|
| Sunucular | Aktif sunucunun kanal listesi + sunucu değiştirici |
| Mesajlar | DM'ler (Konuşmalar / Arkadaşlar / İstekler) |
| Bildirimler | Mention, davet, ses odası olayları |
| Profil | Kimlik kartı + ayarlar |

- **"Aramalar" sekmesi kaldırılır.** Ses odaları artık: (a) kanal listesinde sesli kanallar, (b) bağlıyken kalıcı **mini ses çubuğu** (tab bar'ın üstünde, tüm sekmelerde görünür), (c) tam ekran **aktif ses odası** ekranı.
- Sol sunucu rail'i kaldırılır; sunucu değiştirme üst başlıktaki sunucu kartına dokununca açılan **bottom sheet** ile yapılır (ekran 1g).
- Tab bar: yüzer (floating) kart, `left/right:16px; bottom:18px`, radius 26px, padding 8px, beyaz/koyu yüzey, kenarlık + yumuşak gölge. Aktif sekme: lavanta pill (radius 18) + indigo ikon + 700 ağırlık etiket. Okunmamış DM varsa Mesajlar ikonunda 8px kırmızı nokta.

---

## TASARIM TOKEN'LARI

Tipografi: **Plus Jakarta Sans** (400/500/600/700/800). Mobilde paketlenmiş font olarak eklenmeli; yoksa platformun geometrik-rounded sans karşılığı.

### Açık tema
- Arkaplan `#F6F7FB` · Kart `#FFFFFF` · Kenarlık `#E7E9F4` · İnce ayraç `#F0F1F8`
- Metin `#1E2235` · İkincil `#6B7194` · Soluk `#8A90B0` / placeholder `#9AA0BC`
- Birincil (indigo) `#4F46E5` · koyu tonu `#3F38C9` · lavanta yüzey `#EEF0FE` · lavanta kenarlık `#DFE2FC`
- Başarı `#22C55E` (metin tonu `#22A366`, açık yüzeyi `#E8F8EE`, koyu metin `#1B8A55`)
- Hata/ayrıl `#E05252` (yüzey `#FCE9E9`) · Turuncu avatar `#FDEBD7`/`#C77A2B` · Mavi `#E0F0FA`/`#2B7AC7` · Mor `#F3E8FA`/`#8A46C7`
- Koyu yüzey (mini ses çubuğu, "Konuşmalar" aktif chip) `#1E2235`

### Koyu tema
- Arkaplan `#131529` · Kart `#1C1F3A` · Kenarlık `#2B2F52` · Ayraç `#232644`
- Metin `#ECEEFA` · İkincil `#9BA1C7` · Soluk `#6E7398`
- Birincil buton `#6D66F0` · vurgu metin/ikon `#A5A8F5` · seçili yüzey `#2A2D55` (kenarlık `#3B3F73`)
- Başarı `#34D399` (yüzey `rgba(52,211,153,.12)`) · Turuncu avatar `#3A2E1B`/`#E8B36A`

### Ölçüler
- Ekran yatay padding: 20–24px. Kart radius: 20–24px. Liste satırı radius: 14–18px. Input/chip radius: 14–16px.
- Avatarlar **squircle** (daire değil): 36px→r12, 40px→r14, 44–46px→r16, 50–52px→r18, 76–80px→r26–28.
- İkonlar: stroke tabanlı, 1.8–2px kalınlık, round cap/join, 17–24px.
- Gölge (yüzer öğeler): `0 8px 24px rgba(30,34,53,.08)`; birincil buton: `0 6px 14px rgba(79,70,229,.35)`.
- Dokunma hedefleri min 44px.
- Çevrimiçi noktası: 14px yeşil daire, 2.5px yüzey renkli kenarlık, avatarın sağ-alt köşesinde.
- Okunmamış rozeti: min 20–22px yükseklik, tam yuvarlak, indigo dolgu, beyaz 700 metin.

---

## EKRANLAR

### 1a — Sunucular (ana ekran)
- **Üst başlık:** Beyaz kart (radius 22): 44px squircle sunucu avatarı (baş harfler, lavanta zemin) + sunucu adı (17px/800) + "X üye · Y kanal" (12.5px ikincil) + chevron. Dokununca **1g sunucu sheet'i** açılır. Sağında 46px kare buton: "üye davet et" ikonu → davet akışı.
- **Arama:** "Kanallarda ara" input görünümü; dokununca kanal arama.
- **Kanal listesi:** Gerçek kategori gruplarıyla (örn. LOBBY, PAYCORE…): kategori başlığı 11.5px/700, letter-spacing .12em, soluk renk, sağda daralt/aç chevron'u (kategori collapse gerçek çalışacak).
  - **Sesli kanal satırı:** 36px yeşil-yüzeyli squircle içinde hoparlör ikonu; kanal adı 15px/600; altında canlı durum ("N kişi konuşuyor", yeşil 600) — gerçek katılımcı sayısı; sağda üst üste binen katılımcı avatarları (24px, -8px margin).
  - **Yazı kanalı satırı:** 36px squircle içinde `#`; kanal adı; altında son mesaj önizlemesi ("Gönderen: mesaj", tek satır ellipsis); sağda okunmamış rozeti. **Seçili/okunmamış kanal:** lavanta zemin + lavanta kenarlık + indigo kanal adı.
- **Mini ses çubuğu** (sese bağlıyken, tüm sekmelerde): koyu (`#1E2235`) yüzer kart, tab bar'ın 12px üstünde. İçerik: yeşil nokta + kanal adı (13.5px/700 beyaz) + "Sese bağlısın · {sunucu}" (11.5px) + mikrofon toggle (36px, %12 beyaz zemin) + kırmızı ayrıl butonu (36px). Dokununca 1e tam ekran açılır.
- **Boş durum:** hiç sunucu yoksa "Sunucu kur / davetle katıl" yönlendirmeli boş ekran.

### 1b — Kanal sohbet
- **Başlık çubuğu** (alt kenarlık ile): geri oku → kanal listesi; 38px `#` squircle; kanal adı 16.5px/800 + "N üye · M çevrimiçi" (gerçek sayılar); arama ve üye listesi butonları (38px kare).
- **Mesaj akışı:** tarih ayraçları (çizgi + "18 MAYIS"/"BUGÜN"/"DÜN" 11px/700). Mesaj: 40px avatar (squircle, kullanıcı rengi) + isim 14px/700 (+ sunucu sahibiyse taç rozeti) + saat 11.5px soluk. Gövde: beyaz kart balon, radius `6px 18px 18px 18px` (aynı kullanıcının ardışık mesajlarında `18px`), 14.5px metin, satır 1.45.
  - **Link:** indigo + altı çizili, dokununca açılır.
  - **Yanıt (reply):** balon içinde üstte lavanta zeminli alıntı bloğu: 3px indigo sol çizgi, yazar adı 11.5px/700 indigo, alıntı 12px tek satır ellipsis.
  - **Tepkiler:** balonun altında chip'ler (lavanta zemin, emoji + sayı 12px/700 indigo). Uzun basınca tepki ekleme; mevcut reaksiyon API'sine bağlı.
  - **"Yazıyor…" göstergesi:** gerçek typing eventi ile, 18px mini avatar + italik 12px.
- **Composer:** 44px `+` butonu (ek/medya menüsü) + input hap (radius 22; placeholder "Bir mesaj gönder…"; sağda emoji ve mikrofon ikonları) + 44px indigo gönder FAB (gölgeli). Gönderme mevcut mesaj API'siyle; optimistic update tercih edilir.
- **Boş kanal:** "İlk mesajı sen gönder" boş durumu.

### 1c — Mesajlar (DM)
- Başlık: "Mesajlar" 26px/800 + alt açıklama; sağda 46px indigo "yeni mesaj" FAB → kullanıcı seçici.
- **Segment chip'leri:** Konuşmalar (aktif: koyu `#1E2235` zemin, beyaz metin) / Arkadaşlar / İstekler (gerçek bekleyen istek sayısı "·N" indigo). Gerçek sekme davranışı.
- Arama: "Mesajlarda ara".
- **Konuşma satırı:** 50px squircle avatar + çevrimiçi noktası (grup DM'lerde nokta yerine grup mini-rozeti); ad 15px/700; son mesaj 13px tek satır ("Sen: …" öneki dahil); sağda zaman (okunmamış varsa indigo/600) + okunmamış rozeti. **Okunmamış konuşma satırı beyaz kart** görünümünde (kenarlıklı), okunmuşlar düz zeminde.
- Sıralama son mesaja göre; boş durum: "Henüz konuşma yok" + yeni mesaj CTA.

### 1d — Bildirimler
- Başlık: "Bildirimler" 26px/800 + açıklama; sağda "Tümünü okundu say" (13px/700 indigo) — gerçek toplu okundu aksiyonu.
- **İzin kartı** (yalnızca push izni verilmemişse): lavanta kart, indigo zil ikon kutusu, "Anlık bildirimleri aç" + "İzin yalnızca sen istediğinde sorulur." + "İzin ver" butonu → native izin akışı. İzin verilince kart kaybolur.
- **Gruplu akış:** BUGÜN / DÜN / tarih başlıkları. Satır türleri:
  - **Mention:** kullanıcı avatarı + sağ-alt köşede indigo `@` rozeti; "**{kullanıcı}** seni **#{kanal}** içinde etiketledi" + mesaj alıntısı + "{sunucu} · {zaman}". Okunmamışsa beyaz kart + sağda indigo nokta. Dokununca ilgili mesaja gider.
  - **Ses odası başladı:** yeşil hoparlör ikonu + "Katıl" chip'i (yeşil yüzey) → odaya katılır.
  - **Sunucuya katılım / tepki** satırları benzer düzende.
- Boş durum: "Henüz gösterilecek bildirim yok."

### 1e — Aktif ses odası (tam ekran)
- Zemin: koyu `#1E2235` (her iki temada da koyu).
- Başlık: geri oku (odadan çıkmaz, minimize eder → mini çubuk) + yeşil hoparlör + oda adı 17px/800 + "{sunucu} · {süre}" (gerçek sayaç) + sağda "Bağlı" durumu (yeşil nokta + chip). Bağlantı durumları: Bağlanıyor / Bağlı / Yeniden bağlanıyor.
- **Katılımcı grid'i** (2 sütun, ortalanmış): kart `rgba(255,255,255,.05)`, radius 28. 80px squircle avatar; ad 15px/700; durum 11.5px. **Konuşan:** 2px yeşil kart kenarlığı + avatar çevresinde `0 0 0 6px rgba(52,211,153,.2)` halka + "Konuşuyor" yeşil — gerçek konuşma (speaking) eventleriyle. **Sessizde:** avatar köşesinde kırmızı çapraz-mikrofon rozeti + "Sessizde". Altta tam genişlik kesikli "Arkadaşlarını davet et" kartı.
- **Kontroller** (60px, radius 22): mikrofon toggle · hoparlör/çıkış aygıtı · sohbete git · kırmızı **ayrıl**. Ayrıl → LiveKit oturumunu kapatır, mini çubuk kaybolur.
- Altta bilgi satırı: "Mikrofon izni yalnızca sen katılınca istenir".

### 1f — Profil & Ayarlar
- Başlık: "Profil" 26px/800.
- **Kimlik kartı:** 72px indigo banner; üstüne bindirilmiş 76px squircle avatar (4px beyaz kenarlık) + çevrimiçi noktası; sağda "Düzenle" chip'i → profil düzenleme. Ad 19px/800 + @kullanıcıadı 13px. Altında **durum seçici** satırı (yeşil nokta + "Çevrimiçi" + chevron) → Çevrimiçi / Boşta / Rahatsız etmeyin / Görünmez; gerçek presence'a yazar.
- **Ayar kartı 1** (satırlar: 38px renkli ikon kutusu + etiket 15px/600 + sağ değer/chevron, 11px dikey padding, ince ayraçlar):
  - Hesap → hesap detayı
  - Güvenli oturum → sağda yeşil "Aktif" rozeti (gerçek oturum durumu)
  - Görünüm → sağda mevcut tema adı; tema seçimi burada
  - Bildirimler → bildirim tercihleri
  - Dil → sağda seçili dil
- **Ayar kartı 2:** Hakkında (sağda gerçek sürüm string'i, örn. `0.8.15 "Echo"` build kanalından) · **Çıkış yap** (kırmızı ikon + kırmızı 700 metin, onay diyaloğu ile).
- Tüm kartlar tab bar'ın üstünde bitecek (alt boşluk ~100px).

### 1g — Sunucu değiştirici (bottom sheet)
- Arka plan %45 koyu overlay; sheet beyaz, üst radius 36, tutamaç çubuğu (44×5px).
- Başlık "Sunucuların" 19px/800 + sağda lavanta "Katıl / Kur" chip'i.
- Sunucu satırı: 52px squircle avatar (gerçek sunucu ikonu; yoksa baş harfler + sunucuya özgü renk) + ad 15.5px + "N üye · M kanal". **Aktif sunucu:** lavanta zemin + indigo check. Diğerlerinde okunmamış rozeti. En altta kesikli "Yeni sunucu" satırı → katıl/kur akışı.
- Satıra dokununca sunucu değişir, sheet kapanır, kanal listesi yenilenir.

### 1i / 1j — Koyu tema
1a ve 1b'nin koyu karşılıkları referans olarak mock'ta mevcut; **koyu tema token seti tüm ekranlara** uygulanacak (yukarıdaki tablo). Ses odası (1e) her temada koyu kalır.

---

## ETKİLEŞİM ÖZETİ

- Sunucu kartı → sunucu sheet (1g) · Kanal satırı → sohbet (1b) · Sesli kanal → katılma onayı (mikrofon izni burada istenir) → 1e + mini çubuk.
- Mini ses çubuğu her sekmede sabit; dokun → 1e; mikrofon/ayrıl butonları anında çalışır.
- Bildirim satırı → ilgili mesaj/kanal deep-link.
- Geçişler: sheet'ler alttan yay animasyonu (~250–300ms ease-out); sekme geçişleri anlık; balon/satır basılı-tutma menüleri mevcut özelliklerle (yanıtla, tepki, kopyala, sil).
- Pull-to-refresh: Mesajlar ve Bildirimler listelerinde.

## DURUMLAR (her ekran için zorunlu)

- **Loading:** iskelet (skeleton) satırlar — kart yüzey renginde, hafif parlama animasyonu.
- **Empty:** yukarıda ekran bazında tanımlı.
- **Error / çevrimdışı:** üstte ince uyarı bandı + yeniden dene; websocket koptuğunda "Yeniden bağlanıyor…" durumu.

## KABUL KRİTERLERİ

1. 4 sekmeli navigasyon çalışıyor; Aramalar sekmesi yok; ses akışı mini çubuk + tam ekranla eksiksiz.
2. Hiçbir ekranda hardcode/dummy veri yok; her liste gerçek kaynaktan geliyor ve gerçek zamanlı güncelleniyor (yeni mesaj, okunmamış sayaçları, presence, speaking).
3. Açık/koyu tema piksel uyumlu; tercih kalıcı.
4. İzinler yalnızca kullanıcı aksiyonuyla isteniyor.
5. Tüm dokunma hedefleri ≥44px; metinler kesilmeden ellipsis'leniyor; 390pt genişlikte referans mock ile bire bir örtüşüyor.
6. Her ekran bittiğinde ekranı 390×844'te çalıştırıp ilgili `screenshots/*.png` ve HTML referansıyla yan yana karşılaştır; fark varsa düzelt. "Yaklaşık aynı" kabul edilmez.

---

## ÖNERİLER (tasarımcı notları — görsel sonucu değiştirmeden uygulanacak)

1. **Tema token'larını tek kaynakta topla** (tasarım token dosyası / theme objesi) ve iki temayı buradan besle; ekranlara ham hex yazma. Görsel çıktı birebir kalmalı.
2. **Ortak bileşenler çıkar:** TabBar, MiniVoiceBar, Avatar(squircle+durum noktası), UnreadBadge, SectionHeader, SettingsRow, ChannelRow, ConversationRow, MessageBubble, SegmentChip, BottomSheet. Aynı bileşen her ekranda aynı ölçülerle kullanılsın.
3. **Skeleton'lar** gerçek satır geometrisiyle aynı boyutta olsun (yükleme sırasında zıplama olmasın).
4. **Liste performansı:** mesaj ve konuşma listeleri sanal (virtualized) liste ile; avatar baş harf + renk türetimi kullanıcı id'sinden deterministik olsun (aynı kullanıcı her yerde aynı renk).
5. **Erişilebilirlik:** tüm ikon butonlara erişilebilirlik etiketi; kontrastı düşük soğuk gri metinler (≤12px) yalnızca ikincil bilgide kullanılsın.
6. **Haptik:** sekme geçişi, mikrofon toggle ve ayrılma aksiyonlarında hafif haptik geri bildirim.
7. **Derin bağlantılar:** bildirim → mesaj, davet linki → sunucu sheet akışları route param'larıyla çözülsün.
8. İleride istenirse 1h (sol rail) bir ayar/deney bayrağı olarak eklenebilir; ilk sürümde **uygulanmayacak**.
