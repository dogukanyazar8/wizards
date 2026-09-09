# Ş5 — Sağ panel 326: üyeler, ses katılımcıları, arama (Dalga 2)

> Önce oku: `00-ortak-baglam.md`, `SPEC-SUNUCU.md` §4 (tamamı).
> Bağımlılık: **Ş0**. Paralel: Ş4. İlgili API: Ş2 (üye filtreleri).

---

## Görev

`components/shell/server-member-panel.tsx`'i SPEC §4'e göre yenile ve
`components/chat/message-search-panel.tsx`'i §4.3 alan setiyle tamamla. Panel üç içerikten birini
gösterir: **üyeler** · **ses kanalı katılımcıları** · **arama**.

---

## 1. Panel kabuğu (§4)

- Genişlik 326, `surface-panel`, sol kenar `border/.5`.
- Başlık `15px 15px 13px`, alt kenar `border/.45`, başlık `600 14px Outfit`,
  sağda kapatma düğmesi `27 r9` (`aria-label`).
- İçerik seçimi `panel: "members" | "voice" | "search" | null` (SPEC §10).
  Aynı anda tek panel (K11).

## 2. Üye listesi (§4.1)

- Başlık `Üyeler · N`.
- Üye arama kutusu `8px 11px`, `r12` — Ş2'nin `q` parametresine bağlanır (istemci tarafı süzme
  yalnız yüklü sayfa için, sunucu tarafı gerçek kaynaktır).
- **İki grup:** `ÇEVRİMİÇİ N` ve `ÇEVRİMDIŞI N` — grup başlığı 6px nokta +
  `600 9.5px Outfit .14em uppercase`, sağda sayı.
  Bugünkü role göre 5'li gruplama (`owner/admin/role/member/offline`) **kaldırılır**; rol bilgisi
  satır içindeki rozete iner.
- Üye satırı: `7px 8px`, `r12`, avatar 32 + presence noktası 10, ad `600 13px`, rol rozeti,
  alt satır `500 11px` muted (`Genel Sohbet · konuşuyor` gibi), sağda durum ikonları
  (kamera/ekran = primary, mikrofon kapalı = danger).
- Çevrimdışı satırlar `opacity: .55`.
- Rol rozeti rengi `Role.color` tamsayısından; `getRoleColorStyle` mevcut yardımcısı korunur.

## 3. Ses kanalı katılımcıları (§4.2)

- Başlık `Ses kanalı` + `N KATILDI` çipi (success).
- İki grup: `BU KANALDA N`, `KANALDA DEĞİL N`.
- "Kanalda değil" satırlarında `Davet et` düğmesi (h27, `r9`, primary metin); tıklanınca aynı düğme
  `Gönderildi` + success çerçeve/zemin + tik ikonu olur ve **geri alınmaz** (SPEC).
  Durum `invited: { [userId]: true }` — oturum içi, kalıcı değil.
  Davet gönderimi mevcut ses davet servisine (`lib/voice/invite-service.ts`) bağlanır.
- Panelin altında `Davet bağlantısı kopyala` düğmesi (h38, `primary/.14`, `1px primary/.4`) —
  panoya kopyalar + mevcut toast.
- Bugünkü `ActiveVoiceCard` / `QuickAccessCard` / `DesktopDownloadCard` bu panelden **kaldırılır**;
  kaldırılan yeteneğin başka yüzeyde karşılığı var mı, rapora yazılır.

## 4. Arama paneli (§4.3)

`chat/message-search-panel.tsx` — `SearchMode = "basic" | "advanced"` **zaten var**.

- Başlık `Kanalda ara`. Segment `Basit` / `Gelişmiş` (seçili `primary/.16`).
- Sorgu kutusu `1px primary/.45`.
- **Gelişmiş** ek alanlar (her biri `8px 11px`, `r11`, sağda chevron):
  `KİMDEN` · `KANAL` · `TARİH ARALIĞI`.
- `İÇERİYOR` etiket çipleri: `Dosya` · `Bağlantı` · `Görsel` · `Sabitlenmiş` — çoklu seçim.
- `Yalnızca thread yanıtlarında ara` anahtarı (38×21, knob 15, `role="switch"`).
- `Aramayı çalıştır` düğmesi tam genişlik, primary.
- Sonuç başlığı `N SONUÇ` / `N SONUÇ · FİLTRELİ`, sağda `En yeni`.
- Sonuç kartı `11px 12px`, `r14`, hover `border-color primary/.5` + `translateY(-1px)`;
  avatar 22 + ad + saat, eşleşen kelime `warning/.25` zeminle vurgulu, altta kanal çipi ve
  opsiyonel etiket çipi (`Dosya ekli`, `Sabitlenmiş`).
- Mevcut `/channels/[channelId]/messages/search` ucu hangi filtreleri destekliyor, önce doğrula.
  Desteklenmeyen filtre için `TODO(api):` + tipli adapter; **uydurma parametre gönderilmez**.

## 5. Kırılım

- `<1400px`: panel içeriğin üstüne binen katman (SPEC §11) — mevcut `useResponsiveLayout` kullanılır.

---

## Sınırlar

- Mesaj listesi ve mesaj satırı **değişmez** (zaten `MESSAGES_METRICS`).
- Üye rol atama/çıkarma menüsü bu şeritte yok — Ş13'te ayarlar bölümünde.
- Yeni arama ucu yazılmaz.

---

## Kabul kriterleri

- [ ] Panel 326; üç içerik de SPEC ölçülerinde; aynı anda tek panel.
- [ ] Üye listesi iki grup + arama; çevrimdışı `opacity .55`; durum ikonları doğru.
- [ ] Ses katılımcı paneli iki grup; `Davet et → Gönderildi` dönüşümü tek yönlü ve testli.
- [ ] `Davet bağlantısı kopyala` panoya yazıyor.
- [ ] Arama paneli basit/gelişmiş; 4 içerik çipi ve thread anahtarı sonucu gerçekten etkiliyor
      (veya desteklenmeyen filtre `TODO(api):` ile işaretli).
- [ ] Vurgulama `warning/.25` zeminiyle; sonuç kartı hover davranışı doğru.
- [ ] Kaldırılan üç kartın kaybı raporda gerekçeli.
- [ ] Yeni hex yok; typecheck/lint/test yeşil; parity spec'in sağ panel bölümü açıldı.

## Rapor

`raporlar/s5-sag-panel.md`
