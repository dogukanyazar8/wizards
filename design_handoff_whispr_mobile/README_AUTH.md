# Whispr Mobil — Giriş & Kayıt Akışı Uygulama Talimatı (Claude Code / Codex)

Bu doküman, Whispr mobil uygulamasının **kimlik doğrulama akışını** (karşılama, giriş, kayıt, şifre sıfırlama) referans tasarımlarla **piksel piksel birebir** uygulaman için hazırlanmıştır. Ana uygulama ekranları `README.md`'de tanımlıdır; token seti ve genel kurallar oradakiyle ortaktır. Bu akış uygulamanın **ilk açılan** bölümüdür.

---

## 0. Mutlak Kurallar

1. **Dummy / sahte / hardcode veri YASAK.** Ekranlardaki örnek metinler yalnızca placeholder'dır (`ornek@eposta.com` bir input placeholder'ıdır, değer değildir). Oturum durumu, profil listesi, hata mesajları, sosyal sağlayıcı listesi — hepsi gerçek kaynaktan (API/konfig) gelecek. Bir veri kaynağı henüz yoksa ekranı boş/iskelet durumuyla bırak, uydurma.
2. Mevcut kod tabanını önce keşfet: auth/oturum altyapısı, API istemcisi, token saklama (secure storage), mevcut Turnstile/captcha entegrasyonu, sosyal giriş SDK'ları, i18n. Yeni ekranları mevcut mimariye entegre et.
3. Tasarımlar **390×844pt (iPhone referans)** üzerine kuruludur; tüm ölçüler bu genişliğe göredir. Diğer boyutlarda oranlı ve taşmasız uyarlan (safe-area insets dahil).
4. **Açık + koyu tema** birlikte gelecek (token eşlemesi §2'de). Karşılama ekranındaki tema anahtarı canlı çalışacak ve tercih kalıcı saklanacak (ana README ile aynı mekanizma: Açık / Koyu / Sistem).
5. Metinler Türkçe; karşılama ekranındaki dil seçici gerçek i18n locale değiştiricisidir. String'ler i18n altyapısına eklenecek, hardcode edilmeyecek.
6. Şifreler ve tokenlar asla loglanmaz; şifre alanları OS düzeyinde güvenli giriş (secure text entry), otomatik doldurma ipuçları (`username`, `password`, `new-password`, `one-time-code`) doğru atanır.

---

## 1. Paket İçeriği

- `Whispr Mobile Redesign.dc.html` — canlı mock (tarayıcıda aç; **Tur 2 / #t2** bölümü bu akıştır: `#2a`–`#2d`)
- `screenshots/2a-karsilama.png` — Karşılama / ilk açılış
- `screenshots/2b-giris.png` — Giriş (profil seçici + 2FA + Turnstile + sosyal)
- `screenshots/2c-kayit.png` — Kayıt ol (şifre gücü + sözleşme onayı)
- `screenshots/2d-sifre-sifirlama.png` — Şifremi unuttum
- Koyu tema: bu akış için ayrı mock yoktur; §2'deki koyu token eşlemesi **aynı düzenle** uygulanır (ana paketteki `1i/1j` koyu referanslarıyla aynı dil).

---

## 2. Tasarım Tokenları (Auth'a özel)

### Ortak
- Font: **Plus Jakarta Sans** (ana README ile aynı). Ağırlıklar: 600/700/800.
- Telefon çerçevesi mock süsüdür; uygulamada ekran tam ekrandır (radius/kenarlık yok).
- Birincil buton: yükseklik 54–56px, radius = yükseklik/2 (tam hap), gradyan `linear-gradient(90deg,#7C6CF6,#4F46E5)`, gölge `0 10px 24px rgba(79,70,229,.32)`, metin 16–16.5px/700 beyaz, sağda 17–18px ok/uygun ikon, ikon-metin arası 10px.
- İkincil buton: aynı ölçüler, zemin `#FFFFFF`, kenarlık `1px #E7E9F4`, metin `#1E2235`.
- Input: zemin `#FFFFFF`, kenarlık `1px #E7E9F4`, radius 16, padding 13–14px dikey / 16px yatay, sol ikon 18px `#9AA0BC`, metin 14.5px, placeholder `#9AA0BC`. Odakta kenarlık `#4F46E5` + `0 0 0 3px rgba(79,70,229,.15)` halka.
- Alan etiketi: 13px/700 `#1E2235`, input üstünde 7px boşluk.
- Eyebrow etiket (GÜVENLİ ERİŞİM vb.): 11px/700, letter-spacing .18em, `#4F46E5`, ortalanmış.
- H1: 29px/800, letter-spacing −.02em; alt açıklama 13.5px `#6B7194`.

### Açık tema — auth arkaplanı
Tüm auth ekranları aynı katmanlı arkaplanı kullanır (web ile aynı dil):
```
background:
  radial-gradient(circle at 15% 8%, rgba(167,139,250,.25), transparent 45%),
  radial-gradient(circle at 90% 35%, rgba(96,165,250,.18), transparent 42%),
  radial-gradient(rgba(79,70,229,.10) 1.2px, transparent 1.3px),   /* nokta doku */
  linear-gradient(165deg, #F5F2FC 0%, #EDEFFC 55%, #F7F3FB 100%);
background-size: auto, auto, 26px 26px, auto;
```
Metin `#1E2235` · ikincil `#565D82`/`#6B7194` · soluk `#8A90B0` · placeholder `#9AA0BC` · kenarlık `#E7E9F4` · ayraç çizgisi `#DDE0F0` · lavanta yüzey `#EEF0FE` (kenarlık `#DFE2FC`) · başarı `#22A366`.

### Koyu tema — eşleme (birebir aynı düzen, yalnız tokenlar değişir)
```
background:
  radial-gradient(circle at 15% 8%, rgba(124,108,246,.20), transparent 45%),
  radial-gradient(circle at 90% 35%, rgba(96,165,250,.10), transparent 42%),
  radial-gradient(rgba(165,168,245,.07) 1.2px, transparent 1.3px),
  linear-gradient(165deg, #15142E 0%, #131529 55%, #181632 100%);
background-size: auto, auto, 26px 26px, auto;
```
- Kart/input zemini `#1C1F3A` · kenarlık `#2B2F52` · ayraç `#232644`
- Metin `#ECEEFA` · ikincil `#9BA1C7` · soluk/placeholder `#6E7398`
- Birincil gradyan aynı kalır (`#7C6CF6→#4F46E5`); vurgu metin/ikon `#A5A8F5`; seçili yüzey `#2A2D55` (kenarlık `#3B3F73`)
- Beyaz chip/pill'ler → `#1C1F3A` zemin, `#2B2F52` kenarlık; başarı `#34D399`
- Odak halkası `rgba(165,168,245,.22)`
- Status bar içeriği koyu temada açık renk.

---

## 3. Ekran Spesifikasyonları

### 2a — Karşılama (ilk açılış; oturum yoksa açılan ilk ekran)
- **Üst sağ, iki pill (yan yana, 8px gap):**
  - **Tema anahtarı:** beyaz kapsül (radius 20, padding 4), içinde 2 segment: aktif "Açık" (`#EEF0FE` zemin, `#4F46E5` 12px/700, güneş ikonu) ve pasif "Koyu" (`#6B7194` 12px/600, ay ikonu). Dokunma temayı **anında** değiştirir ve kalıcı saklar.
  - **Dil seçici:** beyaz pill, küre ikonu (indigo) + "Türkçe" 12px/700 + aşağı ok. Dokununca gerçek locale listesi (mevcut i18n'den) açılır — bottom sheet.
- **Hero (dikey ortalanmış, 30px yatay padding, 22px gap):**
  - Logo satırı: 56px squircle (radius 18) `linear-gradient(145deg,#7C6CF6,#4F46E5)`, gölge `0 8px 20px rgba(79,70,229,.35)`, içinde beyaz ses dalgası logosu 28px; yanında "Whispr" 30px/800.
  - Başlık: 40px/800, satır 1.12, −.03em; "Güvenli iletişim," düz + "herkes için." **gradyan metin** `linear-gradient(90deg,#7C6CF6,#4F9CF6)` (background-clip: text).
  - Alt metin: 16px, satır 1.55, `#565D82`.
  - **Özellik chip'leri** (wrap, 8px gap): beyaz pill, radius 18, padding 8×13, 12.5px/600, solda 7px renkli nokta. Beş chip ve nokta renkleri: Uçtan Uca Şifreleme `#22A366` · Gerçek Zamanlı `#8A46E5` · Topluluk Odaları `#E0529C` · Dosya & Ekran `#4F9CF6` · Sesli & Görüntülü `#E5A346`. Bu liste sabittir (ürün özelliği, veri değil).
- **Alt CTA bloğu** (24px yatay, 12px gap): birincil "Giriş Yap →" (2b'ye) + ikincil "Hesap Oluştur" (kişi+ ikonu, 2c'ye).
- **Durum satırı:** 12px `#8A90B0`, yeşil onay ikonu + "Tüm sistemler aktif · © 2026 Whispr". Sistem durumu **gerçek status endpoint'inden** gelir; endpoint yoksa yalnız telif satırı gösterilir — sahte "aktif" gösterme.

### 2b — Giriş
- **Üst bar:** solda 42px beyaz geri butonu (radius 15, kenarlık `#E7E9F4`, sola ok) → karşılamaya; ortada 32px logo + "Whispr" 18px/800; sağda 42px boşluk (denge).
- Eyebrow "GÜVENLİ ERİŞİM" + H1 "Tekrar hoş geldin" + açıklama.
- **Profil seçici (3 eşit sütun, 8px gap):** kart radius 18, padding 12×6, üstte 30px daire ikon zemini + 12.5px/700 etiket.
  - **Bireysel** (seçili): zemin `#EEF0FE`, kenarlık `1.5px #4F46E5`, metin/ikon indigo; sağ-alt köşede taşan 16px indigo onay rozeti (2px açık-zemin kenarlıklı).
  - **Oyuncu**: beyaz; ikon pembe (`#D6318C` / zemin `#FCE7F1`); sağ-üstte taşan "PREVIEW" rozeti (8.5px/800, pembe zemin `#FCE7F1`, kenarlık `#F5C8DF`).
  - **Kurumsal**: beyaz; ikon mavi (`#2373D6` / zemin `#E3F0FD`); mavi "PREVIEW" rozeti.
  - Seçim state'i gerçek: seçilen profil tipi login isteğine parametre olarak gider. PREVIEW profilleri konfigürasyondan (feature flag) gelir; flag kapalıysa gösterilmez.
- **E-posta alanı** (zarf ikonu) ve **şifre alanı** (kilit ikonu, sağda 18px göz ikonu ile göster/gizle). Şifre etiket satırının sağında "Şifremi unuttum?" 12.5px/700 indigo → 2d.
- **Alt satır (iki uç):** solda "2FA veya yedek kod kullan" (kalkan ikonu, 12.5px/700 indigo; dokununca giriş isteği sonrası 2FA adımını açar — mevcut 2FA altyapısına bağlan); sağda "Beni hatırla" (18px checkbox radius 6, kenarlık `#C9CDE4` + 13px/600 `#565D82`).
- **Turnstile kartı:** beyaz kart radius 16, padding 13×16; solda 22px boş kutu (radius 6), ortada "Gerçek kişi olduğunuzu doğrulayın" 13px/600, sağda Cloudflare logosu + "CLOUDFLARE" 7.5px/800. **Gerçek Cloudflare Turnstile widget'ı gömülecek** — bu kart yalnız görsel hedeftir; widget yüklenemezse hata durumu göster.
- **Birincil buton** "Giriş Yap →". Yüklenirken buton içinde spinner + disabled; hata durumunda input üstünde kırmızı (`#E05252`) hata bandı.
- **Sosyal ayraç:** ince çizgiler (`#DDE0F0`) arasında "veya şununla devam et" 12px `#8A90B0`.
- **Sosyal butonlar (4 eşit sütun, 10px gap):** 48px beyaz kart radius 16; Google (renkli G), Microsoft (4 kare), Apple (siyah elma), Discord (`#5865F2`). Liste **konfigürasyondan** gelir; entegre olmayan sağlayıcı gösterilmez.
- **Alt satır:** "Hesabınız yok mu? **Ücretsiz oluşturun →**" (indigo 700) → 2c.

### 2c — Kayıt ol
- Üst bar ve profil seçici 2b ile birebir aynı.
- Eyebrow "GÜVENLİ BAŞLANGIÇ" + H1 "Whispr'e katılın" + açıklama.
- Alanlar sırayla: **Ad Soyad** (kişi ikonu) → **E-posta** → **Şifre / Şifre Tekrar** (yan yana 2 sütun, 10px gap; her ikisinde kilit + göz ikonu; placeholder "En az 8 karakter", dar sütunda ellipsis kabul).
- **Şifre gücü satırı:** 12px `#565D82`, solda yeşil kalkan-onay ikonu; metin canlı şifre kurallarını yansıtır (harf + rakam + özel karakter, ≥8). Kurallar karşılanana dek ikon nötr gri, karşılanınca yeşil; canlı doğrulama, submit'te değil.
- **Turnstile kartı** (2b ile aynı, gerçek widget).
- **Sözleşme onayı:** 18px checkbox + 12.5px açıklama; "Kullanım Şartları" ve "Gizlilik Politikası" indigo/700 **gerçek linkler** (in-app browser). Checkbox işaretli değilse "Hesap Oluştur" disabled.
- **Birincil buton** "Hesap Oluştur →". Başarıda e-posta doğrulama akışına geç (mevcut backend akışı neyse ona bağlan).
- Alt satır: "Zaten hesabın var mı? **Giriş yap**" → 2b.
- İçerik 844pt'e sığar; daha kısa ekranlarda tüm form alanı dikey scroll edilebilir (üst bar sabit).

### 2d — Şifremi unuttum
- Üst bar 2b ile aynı; içerik dikey ortalanmış.
- **İkon kartı:** 72px, radius 26, zemin `#EEF0FE`, kenarlık `#DFE2FC`, içinde 32px indigo anahtar ikonu; ortalanmış.
- Eyebrow "ŞİFRE SIFIRLAMA" + H1 "Şifreni sıfırla" + açıklama "E-postanı gir, sana bir sıfırlama bağlantısı gönderelim."
- E-posta alanı (2b ile aynı).
- **Birincil buton** "Sıfırlama Bağlantısı Gönder" + uçak ikonu; gradyan bu ekranda hafif koyu uç: `linear-gradient(90deg,#6D5DF6,#4338CA)`.
- "Girişe dön →" 13.5px/700 indigo, ortalanmış → 2b.
- **Bilgi kartı:** beyaz kart radius 16, yeşil kalkan ikonu + "Bağlantı 30 dakika geçerlidir; hesabın uçtan uca şifreli verileri etkilenmez." 12px. **30 dakika değeri backend konfigürasyonundan okunur** — hardcode etme; alınamıyorsa süre cümlesini gösterme.
- Gönderim sonrası **başarı durumu:** aynı düzen, ikon yeşile döner, metin "Bağlantı gönderildi — gelen kutunu kontrol et" + "Tekrar gönder" (cooldown sayaçlı, gerçek sayaç). E-posta adresinin kayıtlı olup olmadığını **ifşa etme** (her durumda aynı başarı mesajı).

---

## 4. Akış & Durumlar

- Navigasyon: 2a → (Giriş Yap) 2b → (Şifremi unuttum?) 2d; 2a → (Hesap Oluştur) 2c; 2b ⇄ 2c alt linklerle. Geri butonu her zaman bir önceki ekrana.
- Geçiş animasyonu: platform varsayılanı (iOS push / Android shared-axis); ekstra süs yok.
- **Her form için:** disabled → loading (buton spinner) → hata (alan altı kırmızı 12.5px mesaj + input kenarlığı `#E05252`) → başarı. Ağ hatasında genel hata bandı + yeniden dene.
- Klavye: input'lar klavye tarafından örtülmez (scroll-into-view davranışını platform yöntemiyle sağla); e-posta klavye tipi email, şifreler secure.
- Oturum başarılıysa ana uygulamaya (README.md'deki 1a Sunucular) geç; token secure storage'da.

---

## 5. Kabul Kriterleri

1. Dört ekran 390pt genişlikte referans PNG'lerle bire bir örtüşüyor (aralıklar, radius'lar, font ölçüleri, renkler).
2. Açık/koyu tema tam eşlemeyle çalışıyor; karşılamadaki anahtar canlı ve kalıcı.
3. Hiçbir ekranda dummy veri yok: sosyal sağlayıcılar, PREVIEW profilleri, sistem durumu, link süresi — hepsi konfig/API kaynaklı.
4. Turnstile gerçek widget; doğrulama tamamlanmadan submit edilemiyor.
5. Şifre gücü canlı; sözleşme onayı olmadan kayıt disabled; şifre sıfırlamada e-posta varlığı ifşa edilmiyor.
6. Tüm dokunma hedefleri ≥44px; klavye hiçbir alanı örtmüyor; VoiceOver/TalkBack etiketleri tam.

---

## 6. Öneriler

1. **Token'ları ortakla:** auth arkaplan katmanları ve buton/input stilleri ana uygulamayla aynı tema dosyasından gelsin; auth'a özel kopya oluşturma.
2. **Biyometrik hızlı giriş:** "Beni hatırla" sonrası ikinci açılışta Face ID / parmak izi ile giriş öner (karşılamayı atla, 2b'de e-posta dolu gelsin).
3. **Magic link:** şifre sıfırlama altyapısı hazır olduğundan, şifresiz e-posta bağlantısıyla giriş opsiyonunu aynı ekrana eklemek düşük maliyetli.
4. **Rate limiting UX:** ardışık başarısız girişte butona cooldown sayacı; kullanıcıya kalan süreyi göster.
5. **Derin bağlantılar:** `whispr://reset-password?token=…` ve e-posta doğrulama linkleri uygulama içinde açılsın.
6. **PREVIEW profilleri** (Oyuncu/Kurumsal) feature flag arkasında; flag açıldığında rozet otomatik kalkacak şekilde kurgula.
7. Karşılama hero'su ilk açılışta 250ms'lik yumuşak fade+rise ile gelebilir (tek seferlik, reduce-motion'a saygılı).
