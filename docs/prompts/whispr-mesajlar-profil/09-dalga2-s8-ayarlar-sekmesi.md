# Dalga 2 · Ş8 — Ayarlar sekmesi

> **Başlatma prompt'u.** Aşağıdaki bloğun tamamını yeni bir Claude Code oturumuna ver.
> **Ön koşul:** Dalga 0 kapısı geçti. Ş4 raporu (`raporlar/05-rapor.md`) okunur — okundu bilgisi
> ve typing bayraklarının hangi yolda uygulandığı oradan gelir.

---

Whispr monorepo, `uat` dalı. Görev: SPEC §15.5'in Ayarlar bölümünü yaz — bildirim radyoları,
hizalı gizlilik kartı, DM ve grup tehlike aksiyonları. Karşılıkları `screens/18` (DM) ve
`screens/21` (grup).

Önce oku: `docs/prompts/whispr-mesajlar-profil/00-ortak-baglam.md` (**K2 bağlayıcı**) ve
`SPEC-MESAJLAR.md` §15.5 "Ayarlar". Ölçüler `Mesajlar.dc.html` `L1235–L1300`.

## Sahiplenilen dosyalar

- `apps/web/src/components/messages/profile-tab-settings.tsx` (yeni) + `.test.tsx`
- `apps/web/src/components/messages/notification-choice-cards.tsx` (yeni) + `.test.tsx`
- `apps/web/src/components/messages/privacy-settings-card.tsx` (yeni) + `.test.tsx`
- `apps/web/src/components/messages/profile-danger-actions.tsx` (yeni) + `.test.tsx`

**Yazma:** `metrics.ts`, `messages-screen.ts`, `tr.ts`, `en.ts`, Ş5/Ş6/Ş7 dosyaları,
`apps/mobile/**`.

## 1. `BİLDİRİM AYARLARI` — üç radyo kartı

| Başlık                 | Alt satır                      | `DMNotifyLevel` |
| ---------------------- | ------------------------------ | --------------- |
| `Tüm mesajlar`         | `Her yeni mesajda bildirim`    | `ALL`           |
| `Sadece bahsedilmeler` | `@ ile anıldığında bildirim`   | `MENTIONS`      |
| `Kapalı`               | `Bildirim yok, yalnızca rozet` | `NONE`          |

Seçili kart `--primary/0.09` zemin + `1px --primary/0.45` kenar; 17px radyo halkası içinde 8px
primary nokta. Gerçek `role="radiogroup"` + `role="radio"`, ok tuşlarıyla gezinme (kural 6).

Yazma mevcut `PATCH /api/v1/dm/[conversationId]/notify` ucuna gider. **`NONE` seçimi `muted` ile
ikizdir** (tuzak 5): iki alan aynı istekte yazılır; ayrı iki çağrı yapma. Seçim iyimser
uygulanır, hata dönerse eski değere geri sarılır ve hata toast'ı gösterilir.

## 2. `GİZLİLİK VE GÜVENLİK` — tek kart, üç bölmeli satır

Radius 14, `--surface-card`, `1px --border/0.6`, `overflow:hidden`. Her satır: padding `11 12`,
30×30 radius 10 ikon karosu + `flex:1` metin bloğu (600 12 başlık / 11 muted alt satır) + sağda
kontrol; satır ayırıcı `1px --border/0.5`.

**İkon kolonu ve kontrol kolonu üç satırda da aynı hizada, satır yükseklikleri 56–57px.**
SPEC bunu ayrıca kabul kriterine koydu — hizayı grid ile kur, üç satırı ayrı ayrı padding'leyip
gözle tutturma.

| Satır                        | Alt metin                                      | Zemin                                   | Kontrol                                      |
| ---------------------------- | ---------------------------------------------- | --------------------------------------- | -------------------------------------------- |
| `Aktarımda şifreli` **(K2)** | `TLS 1.3 · sunucuda şifreli saklanır` **(K2)** | `--success/0.09`, karo `--success/0.18` | `Aktif` pill (`--success/0.16`), salt okunur |
| `Okundu bilgisi`             | `Mesajı gördüğün karşı tarafa iletilir`        | kart zemini                             | 40×24 anahtar, varsayılan açık               |
| `Yazıyor göstergesi`         | `Yazarken karşı taraf görür`                   | kart zemini                             | 40×24 anahtar, varsayılan açık               |

**K2 bağlayıcı:** ilk satırın metni tasarımdaki `Uçtan uca şifreli` **değil**. Ürün E2EE yapmıyor;
ölçü, renk ve `Aktif` pill'i tasarımdaki gibi kalır, metin gerçeği söyler. Bunu değiştirme.

Anahtar: radius 999, açık `--primary` / kapalı `--surface-tertiary`, 18px beyaz topuz
(`left` 3 → 19, `.18s`). Açık satırın ikon karosu `--primary/0.14` + `--primary`, kapalı satırın
`--surface-soft` + `--text-muted` — ikon karosu anahtarla birlikte **anında** değişir (§10).

Gerçek `role="switch"` + `aria-checked` + `aria-describedby` (kural 6). Yazma
`PATCH /api/v1/users/me/privacy` (Ş4). İyimser güncelleme; hata dönerse geri sarılır.
`prefers-reduced-motion` açıkken topuz geçişi kapanır.

**Bu iki anahtar hesap genelidir, sohbet başına değil** — alt satıra bunu ima eden bir metin
ekleme, ama Ayarlar ekranındaki aynı tercihle **aynı** state'i paylaştığından emin ol; iki yerde
farklı değer görünmesin (aynı query key, invalidation ortak).

## 3. Tehlike ve yönetim aksiyonları

**Grup:**

- `KİMLER ÜYE EKLEYEBİLİR` segmenti — `Herkes` / `Yöneticiler`; `permAddMembers` yazar
  (mevcut `groupSettingsRoute`). Yalnız yönetici değiştirebilir; üye için segment **salt okunur**
  görünür, gizlenmez (SPEC kuralı gösteriyor).
- `Geçmişi temizle` — yalnız yönetici. Ş2'nin `DELETE .../history` ucu. **Onay diyaloğu zorunlu**:
  geri alınamaz. Mevcut onay bileşeni kullanılır, yeni modal yazılmaz.
- `Gruptan ayrıl` (danger) — mevcut `leaveGroupConversation`. Onay ister.
- `Grubu sil` (danger) — yalnız **sahip** (Ş2 kararı, `viewerRole === "OWNER"`). Onay ister ve
  onay metni grup adını içerir.

**DM:**

- `Kullanıcıyı engelle` (danger) — mevcut `/api/v1/friends/block/[userId]`. Onay ister.
  Toast: `{ad} engellendi · geri almak için profili aç`.
- `Bildir` — Ş4'ün `POST /api/v1/users/[userId]/report` ucu. Sebep seçimi gerektiriyorsa mevcut
  moderasyon bildirme akışının bileşeni kullanılır. Toast:
  `Bildirim gönderildi · moderasyon ekibi inceleyecek`.

Her yıkıcı eylem başarıda toast basar (Ş9'un `onToast` prop'u), başarısızlıkta hata toast'ı ve
buton eski hâline döner. Yetkisi olmayan satır **çizilmez** — pasif buton bırakılmaz.

## Test

- Üç radyo kartı `radiogroup` rolüyle, ok tuşlarıyla geziliyor.
- `Kapalı` seçimi `notifyLevel` ve `muted` alanlarını **tek** istekte yazıyor.
- Radyo hatası eski seçime geri sarıyor.
- Gizlilik kartının üç satırı aynı ikon ve kontrol hizasında (hesaplanan stil testi).
- Şifreleme satırı `Aktarımda şifreli` metnini taşıyor ve salt okunur.
- Anahtar `role="switch"`, `aria-checked` doğru; kapatınca ikon karosu tonunu değiştiriyor.
- Anahtar Ayarlar ekranıyla aynı query key'i invalidate ediyor.
- `permAddMembers` segmenti üye rolünde salt okunur.
- `Grubu sil` admin (owner değil) için çizilmiyor.
- Her yıkıcı eylem onay istiyor.

## Kapı

```bash
pnpm --filter @wizards/web test
```

```bash
pnpm --filter @wizards/web typecheck
```

Rapor: `raporlar/09-rapor.md` — hangi onay bileşeni kullanıldı, Ayarlar ekranıyla paylaşılan
query key, K2 metninin `SPEC_DEVIATIONS` kaydının doğrulanması.
