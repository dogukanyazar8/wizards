# Başlatma promptları — Whispr Sunucu paketi

Her şerit için hazır prompt. **Sırayla** kullan: Dalga 0 tek başına, sonraki dalgaların şeritleri
kendi aralarında paralel.

Ortak ön ek (her prompta yapıştır):

```
Dal: uat. Kaynak tasarım: design_handoff/design_handoff_sunucu/
(PROMPT.md · SPEC-SUNUCU.md · design/Sunucu-referans.html · design/Sunucu.dc.html).
Önce docs/prompts/whispr-sunucu/00-ortak-baglam.md ve PLAN.md §3 (K1–K12) oku, sonra kendi şerit
dosyanı oku ve harfiyen uygula. Bir değerden emin olmadığında referans HTML'in inline style
değerine bak, tahmin etme. Renk yalnız hsl(var(--token)); yeni hex/tema sınıfı üretme.
Bitince docs/prompts/whispr-sunucu/raporlar/ altına raporunu yaz.
```

---

## Dalga 0

### Ş0 — Sözleşme, veri ve ölçü

```
docs/prompts/whispr-sunucu/01-dalga0-s0-sozlesme.md dosyasını uygula.
Prisma'ya Server.iconColor ve Server.slowModeDelay kolonlarını ekle (migration yalnız
packages/db/prisma/rebaseline-migrations/ altına). @wizards/types sözleşmesini genişlet; K6
daraltmasından ÖNCE ihlal taraması yap ve sonucu rapora yaz. lib/servers/metrics.ts (SERVER_METRICS)
sözlüğünü SPEC §2–§8'den kur. permission-groups.ts, discovery-tag-groups.ts, channel-visibility.ts,
server-slow-mode.ts yardımcılarını testleriyle yaz. globals.css'e --accent-2 ekle (iki temaya).
schema-server-screen.test.mjs, lib/servers/parity.test.ts ve e2e/specs/design/server-parity.spec.ts
iskeletlerini kur. UI YAZMA.
```

---

## Dalga 1 (Ş1 · Ş2 · Ş3 paralel)

### Ş1 — Sunucu yazma uçları

```
docs/prompts/whispr-sunucu/02-dalga1-s1-sunucu-yazma-uclari.md dosyasını uygula.
iconColor ve slowModeDelay'i PATCH /servers/[serverId] üzerinden uçtan uca yaz; yavaş modu
max(server, channel) kuralıyla mesaj gönderme servisine bağla; POST
/servers/[serverId]/transfer-ownership ucunu audit log + authorization revision ile aç; silme
onayının birebir eşleşmesini testle sabitle. UI YAZMA.
```

### Ş2 — Üye moderasyonu

```
docs/prompts/whispr-sunucu/03-dalga1-s2-uye-moderasyon-api.md dosyasını uygula.
Önce mevcut ban yüzeyinin envanterini çıkar (member-ban-service.ts, bans uçları) ve rapora yaz.
Zaman aşımı ucunu aç (communicationDisabledUntil), ban sözleşmesini hizala, zaman aşımlı üyenin
mesaj gönderemediğini testle, üye listesine q + 7 filtre + sayaç sözleşmesini ekle. UI YAZMA.
```

### Ş3 — Davet

```
docs/prompts/whispr-sunucu/04-dalga1-s3-davet-api.md dosyasını uygula.
Süre/kullanım çiplerini CreateInviteSchema'ya eşle, ServerInvite.targetUserId ile hedefli daveti
(arkadaş kontrolüyle) aç, ?pending=1 ile bekleyen davetleri döndür, lib/invites/qr.ts ile istemci
tarafı QR üretimini yaz (mevcut qrcode paketi). Yeni tablo/paket ekleme. UI YAZMA.
```

---

## Dalga 2 (Ş4 · Ş5 paralel)

### Ş4 — Kanal kenar çubuğu

```
docs/prompts/whispr-sunucu/05-dalga2-s4-kanal-kenar-cubugu.md dosyasını uygula.
channel-sidebar.tsx'e sunucu başlığı, tam beş satırlık sunucu menüsü, ⌘K arama popover'ı, daraltma
filtresi (Ş0'ın shouldShowInCollapsedCategory fonksiyonu) ve bağlı ses şeridini ekle. dnd-kit
sıralamasını, collapsedCategories store'unu ve UserProfileFooter'ı BOZMA. Yetkisiz üyeye menüde üç
satır render etme ve bunun negatif testini yaz.
```

### Ş5 — Sağ panel

```
docs/prompts/whispr-sunucu/06-dalga2-s5-sag-panel.md dosyasını uygula.
server-member-panel.tsx'i SPEC §4'e göre yenile: iki grup (ÇEVRİMİÇİ/ÇEVRİMDIŞI) + üye arama, ses
kanalı katılımcı paneli (Davet et → Gönderildi, tek yönlü), davet bağlantısı kopyala. Arama panelini
§4.3 alan setiyle tamamla; arama ucunun desteklemediği filtreyi TODO(api) ile işaretle, uydurma
parametre gönderme. Mesaj satırına dokunma.
```

---

## Dalga 3 (Ş6 · Ş7 paralel)

### Ş6 — Metin kanalı

```
docs/prompts/whispr-sunucu/07-dalga3-s6-metin-kanali.md dosyasını uygula.
Önce SPEC §3.3'ü mevcut chat/message-item.tsx'e karşı denetle ve sonucu rapora yaz. Sonra kanal
başlığını (çipler, bildirim çipi, N üye erişebilir), sabitlenen mesaj çubuğunu, bildirim tercihi
bağlantısını ve bestekar ölçülerini SPEC'e hizala. Mesaj satırını yeniden yazma.
```

### Ş7 — Ses kanalı

```
docs/prompts/whispr-sunucu/08-dalga3-s7-ses-kanali.md dosyasını uygula.
SADECE sunum katmanı: katılımcı ızgarası, kamera varyantı, ekran paylaşımı sahnesi + şerit, kontrol
çubuğu, başlık çipleri. lib/voice/* dosyalarına DOKUNMA (gerekiyorsa önce rapora yaz ve sor).
video-quality, video-subscription, screen-share, participant-view-model, krisp-quality testlerini
her commit'te koştur. prefers-reduced-motion ve "konuşuyor" metnini unutma.
```

---

## Dalga 4 (Ş8 · Ş9 · Ş10 paralel — Ş9 ve Ş10, Ş8'in parçalarını kullanır)

### Ş8 — Ortak parçalar + kategori/kanal pencereleri

```
docs/prompts/whispr-sunucu/09-dalga4-s8-ortak-parcalar-kategori-kanal.md dosyasını uygula.
useLayerStack (popover 60 / settings 70 / modal 80), ToggleRow, OptionChipGroup,
DiscoveryTagPicker (TEK bileşen, server-tags-editor.tsx buraya taşınır), PermissionGroupCard,
pencere kabuğu, kategori penceresi (560) ve 4 adımlı kanal penceresi (660). Mevcut
channel-advanced-settings.tsx + channel-form-model.ts'i taşı, yeniden yazma.
```

### Ş9 — Davet · bildirim · etkinlik pencereleri

```
docs/prompts/whispr-sunucu/10-dalga4-s9-davet-bildirim-etkinlik-pencereleri.md dosyasını uygula.
Davet penceresi (480, ROL alanı YOK, QR + arkadaş seçerek davet dahil), kanal bildirimleri (460),
etkinlik oluştur (560, 0/60 ve 0/180 sayaçları, üç zorunlu alan, kanal çipleri). Üçünde de Esc,
focus tuzağı ve tetikleyiciye dönüş çalışsın.
```

### Ş10 — Sunucu oluştur

```
docs/prompts/whispr-sunucu/11-dalga4-s10-sunucu-olustur.md dosyasını uygula.
940 px pencere: sol form + 296 px canlı önizleme kolonu. 6 renk swatch'ı (iconColor), kısa ad
otomatik türetme, 3 erişim radyosu, DiscoveryTagPicker (Ş8'inkiyle AYNI bileşen), üç anahtar,
katlanır Gelişmiş. <1024px'te tek kolon, önizleme üstte. Erişim alanlarının sözleşmeye eklenip
eklenmediğini rapora yaz.
```

---

## Dalga 5 (Ş11 · Ş12 · Ş13 paralel)

### Ş11 — Ayarlar kabuğu + Genel · Görünürlük · İçerik

```
docs/prompts/whispr-sunucu/12-dalga5-s11-ayarlar-kabuk-genel-gorunurluk-icerik.md dosyasını uygula.
ÖNCE mevcut server-settings-overlay.tsx'in davranış envanterini (mutation, guard, testid, i18n)
çıkar ve rapora yaz. Sonra components/shell/server-settings/ altında kabuk + 9 bölüm iskeleti
(lazy + Skeleton) kur, Genel/Görünürlük/İçerik bölümlerini doldur, eski dosyayı sil.
Keşfet listelemesi yalnız herkese açıkken açılabilsin; herkese açık kapanınca listeleme de kapansın.
```

### Ş12 — Kanallar ve Roller

```
docs/prompts/whispr-sunucu/13-dalga5-s12-kanallar-roller.md dosyasını uygula.
Kanallar bölümü (+ Kategori ekle / + Kanal ekle, sürükleme + yukarı/aşağı, erişim çipleri —
Herkese açık YEŞİL) ve Roller bölümü (212/1fr, 4 yetki grubu, canlı "N yetki seçili", 3 hazır ayar).
Rol oluşturma AYRI PENCERE DEĞİL: sol listede TASLAK satırı, sağda boş taslak, altta Vazgeç /
Rol oluştur çubuğu. Yönetici yetkisi ve Rolü sil sahip dışına render edilmesin.
```

### Ş13 — Üyeler · Davetler · Etkinlikler · Tehlike

```
docs/prompts/whispr-sunucu/14-dalga5-s13-uyeler-davetler-etkinlikler-tehlike.md dosyasını uygula.
Üyeler (arama + 7 filtre + sayaç + rol atama + zaman aşımı/ban menüsü + yasaklılar listesi),
Davetler (üç çip grubu + canlı özet + mevcut davetler + QR + arkadaş daveti + bekleyen davetler),
Etkinlikler (iki sekme + kartlar + boş durum), Tehlike bölgesi (sahiplik devri + sunucu silme).
"Yakında" çiplerini kaldır (K3). Tehlike bölgesi yalnız sahibe render edilsin, negatif testi yaz.
```

---

## Dalga 6

### Ş14 — Kapanış

```
docs/prompts/whispr-sunucu/15-dalga6-s14-olcek-a11y-i18n-parity.md dosyasını uygula.
Tüm raporları oku. Dört kırılımı ve dört çözünürlüğü doğrula, a11y eksiklerini kapat,
server-screen-copy.test.ts ile iki dilde metin denetimi yap, token denetimini genişlet,
server-parity.spec.ts'teki fixme'leri kaldır, ölü kodu temizle, TODO(api) envanterini çıkar.
PROMPT'un kabul listesini madde madde işaretle; işaretlenemeyeni gerekçesiyle raporla.
```
