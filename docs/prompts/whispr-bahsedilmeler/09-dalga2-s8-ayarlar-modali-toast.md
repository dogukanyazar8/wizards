# Dalga 2 · Ş8 — Bildirim ayarları modalı (496) + toast altyapısı

**Ön koşul:** Dalga 1 kapısı yeşil (özellikle Ş4 uçları). **Paralel:** Ş5, Ş6, Ş7.

---

## Sahiplenilen dosyalar

- `apps/web/src/components/mentions/mention-settings-modal.tsx` (yeni) + `.test.tsx`
- `apps/web/src/components/mentions/mention-settings-row.tsx` (yeni)
- `apps/web/src/components/ui/toast.tsx` (yeni) + `.test.tsx`
- `apps/web/src/components/providers/toast-provider.tsx` (yeni)
- `apps/web/src/hooks/use-toast.ts` (yeni)
- `apps/web/src/components/providers/*` içindeki sağlayıcı ağacına **tek satır** ekleme
  (`graphify query "provider tree root layout"` ile doğrula)

**Okunur, yazılmaz:** `ui/modal.tsx`, `ui/toggle-switch.tsx`, `ui/segmented-control.tsx`,
`components/voice/voice-invite-toasts.tsx` (dilini örnek al, dosyaya dokunma).

---

## 1. Toast altyapısı (K11 — bu paketin ön koşulu)

**Web'de genel bir toast yok** (00 §2.5). Bu şerit minimum ama tam bir tane yazar:

```ts
const { show } = useToast();
show({ tone: "default" | "danger", message: string, action?: { label: string; onAct(): void }, durationMs?: number });
```

- Tek yığın, sağ altta, en çok 3 görünür toast; fazlası kuyruğa girer.
- Varsayılan süre 5 sn; `action` varsa 10 sn (geri alma penceresi).
- `role="status"` + `aria-live="polite"`; `danger` tonunda `aria-live="assertive"`.
- Fare üzerindeyken ve pencere odak dışındayken sayaç durur.
- Ölçü ve renkler token'lardan; `voice-invite-toasts` görsel dili örnek alınır ama o dosya
  değişmez (ses davetinin kendi davranışı var).

Kullanıcıları (bu pakette): `Mesaj bağlantısı kopyalandı`, `{channel} sessize alındı` + `Geri al`,
`Bahsetme listeden kaldırıldı` + `Geri al`, `{count} bahsetme okundu işaretlendi` + `Geri al`.

## 2. Ayarlar modalı (SPEC §7)

- `Modal` bileşeni üzerine; kart 496 genişlik, radius 22, `--surface-card`, `1px --border`,
  gölge `0 40px 90px -40px --shadow-color`, backdrop `--backdrop/0.62`, kabuk padding 40.
- **Başlık:** padding `20 24 16` + alt hairline; 38×38 radius 13 `--primary/0.15` zil ikonu;
  `Bahsetme bildirimleri` 600 17 display; alt satır `Bu ayarlar tüm sunucular için geçerli`
  12.5 muted; sağda kapat 32×32.
- **Gövde:** padding `19 24`, gap 15. Dört anahtar satırı (`mention-settings-row.tsx`):
  başlık 600 13.5, alt metin 11.5 muted, sağda 44×26 switch (knob 20 `#fff`, açık `--primary`,
  kapalı `--surface-tertiary`, geçiş `.18s`).

  | Anahtar                 | Alt metin                                  | Varsayılan |
  | ----------------------- | ------------------------------------------ | ---------- |
  | `Bana özel bahsetmeler` | `Adın veya kullanıcı adın yazıldığında`    | açık       |
  | `Rol bahsetmeleri`      | `@tasarım, @ürün gibi rollerde`            | açık       |
  | `@herkes ve @burada`    | `Sunucu geneline yapılan çağrılar`         | açık       |
  | `Thread yanıtları`      | `Takip ettiğin thread'lere gelen yanıtlar` | **kapalı** |

  Switch mevcut `ToggleSwitch` ile; yeni switch yazılmaz. Ölçüler tasarımla uyuşmuyorsa
  ölçü sözlüğünden geçirilir, bileşen çatallanmaz.

- Ayırıcı + **`Masaüstü bildirimi`** satırı: segment grubu (`SegmentedControl`)
  `Tümü` · **`Sadece bahsetmeler`** (varsayılan seçili) · `Kapalı`.
- **Sessiz saatler şeridi:** padding `11 13`, radius 13, `--surface-secondary/0.8`,
  `1px --border/0.6`, 16px `--warning` ay ikonu, `Sessiz saatler açık` 600 12.5 +
  `{from} – {to} · bahsetmeler sayaçta birikir` 11.5 muted, sağda `Düzenle` 600 11.5 `--primary`.
  - Sessiz saatler **kapalıyken** şerit metni `Sessiz saatler kapalı` olur ve alt satır
    yerine `Düzenle` yine görünür (SPEC yalnız açık hâli veriyor; kapalı hâl rapora sapma
    olarak yazılır).
  - `Düzenle` → şerit yerinde iki `time` girdisine açılır (`from`, `to`), `Tamam`/`Vazgeç`.
    Ayrı bir modal açılmaz — modal içinde modal erişilebilirlik açısından tuzaktır.
- **Altlık:** padding `16 24 20` + üst hairline; solda 12px muted not
  `Kanal bazlı ayarlar kanal menüsünden yönetilir`; sağda `İptal` ve `Kaydet`,
  ikisi height 38 radius 12.

### Davranış

- Modal `?modal=settings` ile açılır (Ş5 ve Ş1 bu parametreyi yazar); kapanınca parametre silinir.
- Açılışta ilk anahtara focus; focus tuzağı; `Esc` kapatır; kapanışta focus tetikleyiciye döner.
- Değerler `GET .../mention-settings` ile yüklenir. Yüklenene kadar anahtarlar `Skeleton`;
  yarı yüklenmiş hâlde tıklanamaz.
- **Kaydet** tek `PATCH` gönderir (yalnız değişen alanlar). İyimser güncelleme **yok** —
  bildirim ayarı sessizce yanlış kaydedilirse kullanıcı bunu ancak bildirim gelmeyince anlar.
  Kaydedilirken buton `disabled` + yükleniyor; başarıda toast, hatada satır içi hata.
- **İptal** değişiklikleri atar; kirli formda `Esc` ve kapat da onay ister
  (`Kaydedilmemiş değişiklikler var`) — bu SPEC'te yok, rapora sapma olarak yazılır.

---

## Kabul

- [ ] Modal 496px, tasarımdaki bütün ölçü ve tonlarda; açık/koyu temada doğru.
- [ ] 4 anahtar doğru varsayılanlarla; `Thread yanıtları` kapalı.
- [ ] Masaüstü segmenti `Sadece bahsetmeler` seçili başlıyor.
- [ ] Sessiz saatler şeridi metni birebir; `Düzenle` yerinde saat aralığı düzenletiyor.
- [ ] `Esc` kapatıyor, açılışta ilk anahtara focus, focus tuzağı ve focus dönüşü çalışıyor.
- [ ] `Kaydet` yalnız değişen alanları gönderiyor; hata durumunda değerler geri sarılmıyor.
- [ ] Ayarlar sayfasındaki karşılık gelen kontroller aynı değeri gösteriyor (Ş4 ile tek kaynak).
- [ ] Toast: 3 eşzamanlı sınırı, `Geri al` eylemi, odak dışında sayaç durması, `aria-live`.
- [ ] `voice-invite-toasts.tsx` ve `ui/modal.tsx` değişmedi.

## Kapı

```
pnpm --filter @wizards/web typecheck
pnpm --filter @wizards/web lint
pnpm --filter @wizards/web test
```
