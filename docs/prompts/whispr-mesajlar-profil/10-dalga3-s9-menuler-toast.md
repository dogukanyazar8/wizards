# Dalga 3 · Ş9 — Başlık menüleri, sessize alma, toast şeridi

> **Başlatma prompt'u.** Aşağıdaki bloğun tamamını yeni bir Claude Code oturumuna ver.
> **Ön koşul:** Dalga 1 Ş4 (süreli mute ucu) ve Dalga 2 Ş5 (reducer + panel yuvası) bitti.

---

Whispr monorepo, `uat` dalı. Görev: SPEC §17'yi yaz — DM 254 / grup 262 `...` menüleri,
`Sessize al` alt menüsü, başlıktaki sessiz pill'i ve toast şeridi. Karşılıkları `screens/13`
(DM menüsü) ve `screens/14` (grup menüsü).

Önce oku: `docs/prompts/whispr-mesajlar-profil/00-ortak-baglam.md` (K8, K13, K15) ve
`SPEC-MESAJLAR.md` §17 + §10'un menü satırları. Ölçüler `Mesajlar.dc.html` `L501` (pill),
`L520–L616` (menüler), `L617–L630` (toast).

## Sahiplenilen dosyalar

- `apps/web/src/components/messages/conversation-more-menu.tsx` (yeni) + `.test.tsx`
- `apps/web/src/components/messages/mute-submenu.tsx` (yeni) + `.test.tsx`
- `apps/web/src/components/messages/conversation-toast.tsx` (yeni) + `.test.tsx`
- `apps/web/src/hooks/use-conversation-toast.ts` (yeni) + `.test.ts`
- `apps/web/src/components/messages/conversation-header.tsx` (yalnız sessiz pill'i + menü
  bağlama; başlığın kalan düzeni **değişmez**)
- `apps/web/src/components/dm/dm-conversation-page.tsx` (yalnız menü ve toast bağlantısı)

**Yazma:** `metrics.ts`, `messages-screen.ts`, `tr.ts`, `en.ts`, profil sekmesi dosyaları,
`apps/mobile/**`.

## 1. Menü kabuğu

DM **254** / grup **262** genişlik, `top:41px; right:0`, padding 6, radius 17, `--surface-card`,
`1px --border`, gölge `0 32px 64px -30px hsl(var(--shadow-color)/0.95)`.

Başlıkta 32px tile + ad + alt satır (DM `@selin · Çevrimiçi`, grup `{n} üye · {rol}`), altında
`1px --border/0.6` ayırıcı. Satır: padding `8 9`, radius 10, 500 13 body, 16px çizgi ikon,
gap 11, hover `--surface-soft` + `--foreground`; danger satırlar `--danger` metin ve hover
`--danger/0.13`. Sağ hizalı sayaçlar 600 11 display muted.

Mevcut `ContextMenu` + `ContextMenuItem` + `ContextMenuSeparator` bileşenleri kullanılır (kural 4).
Ölçü farkı varsa **görsel hizalama** için prop/varyant eklenir, API bozulmaz.

Kapanma: backdrop tıklaması, `Esc`, satır seçimi. Açılışta **ilk öğeye focus**, kapanışta
tetikleyiciye dönüş, focus tuzağı, ok tuşlarıyla gezinme, `role="menu"` / `menuitem` (kural 6).

## 2. DM menüsü (254)

`Profili görüntüle` · `Sessize al` (alt menü) · `Okunmadı olarak işaretle` · `Arşivle` · ayırıcı ·
`Sohbeti dışa aktar` · ayırıcı · `Kullanıcıyı engelle` (danger) · `Bildir` (danger).

Bağlantılar:

| Satır                      | Eylem                                                                                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Profili görüntüle`        | `openProfile({ tab: "genel" })` + menü kapanır                                                                                                                                                                                  |
| `Okunmadı olarak işaretle` | mevcut `PATCH /dm/[id]/unread`                                                                                                                                                                                                  |
| `Arşivle`                  | mevcut gizleme/arşiv yolu (`hiddenAt`)                                                                                                                                                                                          |
| `Sohbeti dışa aktar`       | mevcut dışa aktarma yolu; **yoksa** `TODO(api):` ile işaretle ve satırı pasif çizme yerine toast `Sohbet dökümü hazırlanıyor · indirme birazdan başlar` ile bırakma — gerçek karşılığı yoksa satırı **gizle** ve raporda bildir |
| `Kullanıcıyı engelle`      | Ş8'in engelleme akışı (onay + toast)                                                                                                                                                                                            |
| `Bildir`                   | Ş4'ün rapor ucu                                                                                                                                                                                                                 |

## 3. Grup menüsü (262)

`Grup profili` · `Üyeleri görüntüle` ({n}) · `Üye ekle · davet bağlantısı` ·
`Sabitlenen mesajlar` ({n}) · `Paylaşılan medya ve dosyalar` · `Sessize al` (alt menü) ·
`Bildirim ayarları` · **`YÖNETİM`** bölüm etiketi + `Grup adını ve rengini düzenle` +
`Geçmişi temizle` (yalnız yönetici) · ayırıcı · `Gruptan ayrıl` · `Grubu sil` (yalnız sahip).

Menüden profil paneline giden satırlar paneli **ilgili sekmeyle** açar (§10):
`Grup profili`→`genel`, `Üyeleri görüntüle`→`uyeler`, `Paylaşılan medya ve dosyalar`→`medya`,
`Bildirim ayarları`→`ayarlar`. `Üye ekle · davet bağlantısı` → Ş10'un modalı.

**Rol kapısı:** `Geçmişi temizle` yalnız `ADMIN`/`OWNER`, `Grubu sil` yalnız `OWNER` (Ş2 kararı).
Yetkisiz satır **çizilmez**. Sayaçlar (`5`, `2`) gerçek veriden gelir, sabit yazılmaz.

## 4. `Sessize al` alt menüsü

36px girintili liste — `15 dakika` · `1 saat` · `8 saat` · `Süresiz`; seçili süre
`--primary/0.14` + `--primary`. Ana satırdaki ok seçimle **90° döner**.

Alt menü yalnız ana menü açıkken açılır (reducer bunu zorluyor, Dalga 0 Ş0.3). Klavyede
`ArrowRight`/`Enter` açar, `ArrowLeft`/`Esc` kapatır ve odağı ana satıra döndürür.

Süre seçimi Ş4'ün `PATCH /dm/[id]/mute` ucuna `{ muted: true, duration }` gönderir (K8).

## 5. Başlıktaki sessiz pill'i

`conversation-header.tsx` içine warning pill: h26, radius 999, `--warning/0.14` zemin,
`1px --warning/0.35`, 600 11. Metin `{süre} sessiz` (`8 saat sessiz`), `Süresiz` seçilmişse
`Sessiz`.

- Pill'e tıklama sessize almayı **kaldırır** (`{ muted: false }`) ve toast basar.
- Pill gerçek `button`, `aria-label` sessizliği ve kaldırma eylemini birlikte söyler.
- Süre dolmuşsa pill **görünmez** — `resolveMuteState` (Ş4) tek karar noktasıdır, başlıkta
  ikinci bir tarih karşılaştırması yazma.
- Başlığın kalan düzeni (avatar, ad, üye yığını, ikon şeridi) **değişmez**.

## 6. Toast şeridi

Başlığın **ve** sabitlenen şeridin altında, tam genişlik: padding `10 22`, zemin `--success/0.12`,
alt kenar `1px --success/0.28`; 20px success daire + beyaz tik + metin 600 12.5 + sağda 24×24
kapat.

Metinler (i18n, Ş0.4): `8 saat boyunca sessize alındı` · `Sessize alma kaldırıldı` ·
`Sohbet süresiz sessize alındı` (K15) · `Sohbet okunmadı olarak işaretlendi` ·
`Sohbet arşive taşındı` · `Sohbet dökümü hazırlanıyor · indirme birazdan başlar` ·
`Davet bağlantısı kopyalandı` · `{ad} gruba eklendi` · `Sohbet geçmişi temizlendi` ·
`Gruptan ayrıldınız` · `Grup silindi` · `{ad} engellendi · geri almak için profili aç` ·
`Bildirim gönderildi · moderasyon ekibi inceleyecek`.

Davranış:

- **5 sn sonra otomatik kapanır** (K13); kapat düğmesiyle de kapanır.
- `role="status"`, `aria-live="polite"`, kapat düğmesinde `aria-label`.
- Görünüm ya da sohbet değişince temizlenir (tuzak 3).
- Aynı anda **tek** toast; yenisi geleni eskisinin yerini alır (kuyruk yok — şerit tek satır).
- `prefers-reduced-motion` açıkken giriş animasyonu kapanır.
- Hata toast'ı için danger varyantı: aynı ölçü, `--danger` tonu. Ş7/Ş8 hata yollarında bunu
  kullanıyor; varyantı **aç** ve `raporlar/10-rapor.md` içinde imzasını bildir.

`use-conversation-toast.ts` reducer'ın `showToast` / `dismissToast` action'larını sarar; zamanlayıcı
bileşen unmount olunca temizlenir (sızıntı yok).

## Test

- DM menüsü 254, grup 262 genişlikte.
- `Esc` menüyü kapatıyor, focus tetikleyiciye dönüyor; açılışta ilk öğe odakta.
- Alt menü ana menü kapalıyken açılmıyor.
- Süre seçimi doğru gövdeyi gönderiyor; `Süresiz` `duration: "forever"`.
- Pill metni `8 saat sessiz` / `Sessiz`; süresi dolmuşta pill yok.
- Pill tıklaması `muted: false` gönderiyor.
- Üye rolünde `Geçmişi temizle` ve `Grubu sil` çizilmiyor; admin'de `Grubu sil` çizilmiyor.
- Menü satırları paneli **doğru sekmeyle** açıyor (4 satır, 4 sekme).
- Toast 5 sn sonra kapanıyor (sahte zamanlayıcı), sohbet değişince temizleniyor.
- Aynı anda iki menü ya da menü + panel çakışması yok.

## Kapı

```bash
pnpm --filter @wizards/web test
```

```bash
pnpm --filter @wizards/web typecheck
```

Rapor: `raporlar/10-rapor.md` — `Sohbeti dışa aktar` satırının gerçek karşılığı çıktı mı,
danger toast varyantının imzası, `ContextMenu` bileşenine eklenen varyant.
