# Faz 4 — Ana Sayfa ızgarası ve altı kart

**Ön koşul:** Faz 3. **Sonraki:** Faz 5.
**Önce oku:** `00-ortak-baglam.md`; SPEC-ANA-SAYFA §2.3 (üst çubuk), §3 (bento), §8.3 (yoğunluk).
Ölçüde şüphe → `design/1a-komuta-merkezi.html` inline `style`.

Ekranın kendisi. Bu fazda **etkileşim mantığı yok** (Faz 5) — render, veri bağlama, yükleme ve boş
durumlar var.

---

## 0. Başlangıç

```
graphify query "TanStack Query kullanımı ve skeleton kalıpları"
graphify query "Avatar ve Badge bileşenlerinin API'si"
```

---

## 1. Rota

- `apps/web/src/app/(main)/home/page.tsx` — sunucu bileşeni, `HomeCommandCenter`'ı render eder.
- `apps/web/src/app/page.tsx`: `redirect(session ? "/home" : "/login")`.
- `(main)` grubu auth'u zaten uyguluyor — ikinci kontrol yazma (§6.8).
- `loading.tsx`: kabuk + altı kart iskeleti. Kartların kendi skeleton'ları bileşen içinde;
  route-level `loading` yalnız ızgara çerçevesini gösterir.

---

## 2. Üst çubuk (SPEC §2.3)

Padding `24 30 14`, iki uca yaslı, `gap:24`, `align-items: flex-start`.

**Sol:**

- `İyi akşamlar, <ad>` — 600/27/1.1 display, `-0.02em`. Selamlama saf fonksiyondan:
  `getGreetingKey(hour)` → `home.greeting.morning|afternoon|evening|night`. Testli, sınırlar dahil.
- Yanında odak pill'i (yalnız odak açıkken): padding `5 11`, radius 999, `--warning/0.14` zemin,
  `--warning` metin 600/11.5, 6px nokta, metin `Odak · <n> dk`.
- Alt satır (7px üst boşluk, 13.5 muted):
  `<tarih> · <n> yanıt seni bekliyor, <m> bahsedilme okunmadı`
  — kalın kısımlar `--text-secondary` 600. Tarih `LocaleProvider` biçimlendirmesiyle üretilir.
  Sayı 0 ise o cümle parçası **düşer**, "0 yanıt" yazılmaz.

**Sağ:**

- Arama alanı: 280 genişlik, padding `9 12`, radius 13, `--surface-card`, `1px --border/0.6`,
  hover kenar `--primary/0.6`, geçiş `0.18s`. 16px arama ikonu, placeholder
  `Ara veya komut çalıştır` (13, muted), sağda `⌘K` çipi (`--surface-tertiary`, radius 6,
  600/10.5 display).
  - Gerçek `button` — Faz 5'te paleti açar. Bu fazda `disabled` değil, tıklanınca hiçbir şey
    yapmaz ama `aria-keyshortcuts="Meta+K Control+K"` taşır.
  - Kısayol çipi platforma göre: macOS `⌘K`, diğerleri `Ctrl K`.
- Bildirim butonu: 40×40 radius 13, `--surface-card` + `--border/0.6`, hover metin `--primary`.
  Sağ üstte 7px `--danger` nokta (`2px --surface-card` kenar), yalnız okunmamış varken.
  Mevcut `NotificationBell` davranışı kullanılır — yeniden yazma.

---

## 3. Bento ızgara (SPEC §3)

```
display: grid;
grid-template-columns: repeat(4, 1fr);
grid-template-rows: auto auto auto;
gap: 13;            /* 0.8125rem */
padding: 8 30 18;
```

Kart temeli: radius 20, `--surface-card`, `1px --border/0.5`, gölge `0 1px 2px --shadow-color/0.1`.

| Kart           | Alan     | Padding    |
| -------------- | -------- | ---------- |
| Kaldığın yer   | `span 2` | `16 16 12` |
| Şu an canlı    | `span 2` | `16 16 14` |
| Yanıt bekliyor | `span 2` | `20`       |
| Durumun        | 1 kolon  | `16`       |
| Sıradaki       | 1 kolon  | `16`       |
| Arkadaşlar     | `span 4` | `12 16 13` |

Ortak kabuk bileşeni: `HomeCard` — başlık satırı (bölüm etiketi + sağ aksesuar), gövde, isteğe
bağlı ayak. Altı kart bunu kullanır; kart kabuğu altı kez yazılmaz.

**Bölüm etiketi stili:** 600/10.5/1 display, `0.15em`, uppercase, `white-space: nowrap`, muted.

---

## 4. Kartlar

### 4.1 "KALDIĞIN YER" (SPEC §3.1)

Başlık sağı: `Tümünü gör` (600/12, `--primary`) — Faz 6'da hedefe bağlanır.

Satır: padding 10, radius 14, `gap:12`, hover zemin `--surface-soft/0.65`, geçiş `0.16s`.
**Satırın tamamı tek `button`/`a`** — iç içe tıklanabilir öğe yok.

- Kanal satırı: sol 38×38 radius 12 ikon karesi, içinde `#` 600/17 display. Tint kanal/sunucu
  kimliğinden türer (`--primary/0.12`, `--success/0.14`, `--warning/0.14` döngüsü değil —
  sunucunun kendi renginden; türetim saf fonksiyonda).
- DM satırı: 36px `Avatar` + 11px presence noktası (`2.5px --surface-card` kenar) + ad yanında
  `DM` çipi (padding `2 6`, radius 5, `--surface-tertiary`, 10px 600 muted).
- Üst satır: ad 600/14/1.2 + bağlam 11.5 muted (ellipsis).
- Alt satır: 16px mini avatar + `<gönderen>:` 600/12.5 `--text-secondary` + mesaj 12.5 muted,
  tek satır, ellipsis.
- Sağ kolon: zaman 500/11.5 muted; altında varsa `Badge` (bahsedilme varsa `tone="danger"`,
  yoksa primary). Sayaç 0 ise badge yok.
- Satır sayısı ölçek adımına göre: **4 / 5 / 6 / 7**.

### 4.2 "ŞU AN CANLI" (SPEC §3.2)

Başlık sağı: `<n> oda açık` (500/11.5, `--success`) + 7px nabız atan nokta —
`@keyframes pls` 2s ease-out sonsuz, `box-shadow: 0 0 0 0 hsl(var(--success)/0.5)` →
`0 0 0 8px hsl(var(--success)/0)`. `prefers-reduced-motion` → animasyon yok.

Oda kartı: padding 13, radius 16, `gap:14`,
zemin `linear-gradient(120deg, --primary/0.15, --primary/0.04)`, kenar `1px --primary/0.24`,
hover kenar `--primary/0.45`.

- Sol 44×44 radius 14 `--primary/0.18` zemin, 21px ikon: `kind:'voice'` → kulaklık,
  `kind:'game'` → oyun kolu, `kind:'call'` → telefon (mevcut ikon setinden).
- Üst: oda adı 600/15/1.2 + sunucu adı 11.5 muted (ellipsis).
- Alt (7px üst boşluk): 20px konuşan avatarı + `<ad> konuşuyor` 600/12.5 `--text-secondary` +
  `VoiceLevelWaveform` (compact, active). **Konuşan yoksa bu satır ve dalga formu gizlenir**,
  yerine katılımcı özeti çıkar.
- Sağda `Katıl` — `Button` sm.
- Kart altında (margin `13 2 0`) katılımcı yığını: 28px avatarlar, aralarında `margin-left:5`,
  her biri `0 0 0 2px hsl(var(--surface-card))` halka; 4'ten fazlaysa `+<n>` çipi (28px daire,
  `--surface-tertiary`, 600/10.5 display). Yanında açıklama metni 12 muted (`caption` alanı).
- Odalar arası boşluk 10.
- Oda sayısı ölçek adımına göre: **2 / 2 / 3 / 3**.

Dalga formu yalnız aktif konuşmacı varken animasyonlu (§5.2). Konuşan değişimi
`voice:audio-level:update` ile gelir ve **React Query'ye yazılmaz**, yerel state.

### 4.3 "YANIT BEKLİYOR" (SPEC §3.3)

Başlık: bölüm etiketi + `<n> yeni` pill'i (padding `3 8`, radius 999, `--danger/0.14`,
`--danger` 600/10.5) + sağda `Gelen kutusu` (600/12 primary). `newCount` 0 ise pill yok.

İstek satırı: padding `14 14 14 12`, radius 16, zemin `--surface-secondary/0.55`,
kenar `1px --border/0.5`, hover kenar `--primary/0.45`, `gap:14`, satır arası 6.

- Sol: 36px `Avatar` + 11px presence noktası.
- Üst satır: ad 600/14/1.2 · bağlam 11.5 muted (ellipsis) · sağa yaslı zaman 11.5 muted.
- Alt satır (6px üst boşluk): sebep 13 `--text-secondary`, ellipsis.
- Sağda aksiyon butonu (`Yanıtla` / `Kabul et`) yalnız `action` doluysa. `Button` sm.
- Satır sayısı: **4 / 5 / 6 / 7**.

Satırın kendisi tıklanabilir **ve** içinde ayrı bir aksiyon butonu var → iç içe buton olmaz:
satır `div` + üstünde konumlanmış `a` (stretched link) ya da satır `a`, buton `stopPropagation`.
Erişilebilirlik açısından tercih: **satır `a`, buton kardeş öğe**, ikisi de klavye ile ayrı
erişilebilir.

### 4.4 "DURUMUN" (SPEC §3.4)

- Bölüm etiketi.
- 2×2 çip ızgarası (`gap:6`, üst boşluk 12): çip padding `8 10`, radius 11, 7px nokta + etiket
  11.5. Aktif çip: durum renginin `/0.14` zemini + 600 metin. Pasif: `--surface-secondary`,
  muted 500, hover `--surface-soft`.
  Sıra: `Çevrimiçi` (success) · `Meşgul` (danger) · `Boşta` (warning) · `Görünmez` (muted).
  Her çip `button`, `aria-pressed` taşır.
- Ayırıcı 1px `--border/0.5`, margin `14 0 12`.
- `Rahatsız etmeyin` 600/13 + alt açıklama `<n> dk sonra otomatik kapanır` 11.5 muted;
  sağda toggle 42×23 radius 999. Açık: `--primary` zemin, 18px beyaz topuz `top:2.5 left:21.5`.
  Toggle gerçek `button role="switch"` + `aria-checked`.
- İlerleme çubuğu: yükseklik 5, radius 999, `--surface-tertiary` yol, `--primary` dolgu
  (`elapsed / total`). Altında `<n> dk geçti` / `<m> dk` (600/10.5 display muted, iki uca yaslı).
  `role="progressbar"` + `aria-valuenow/min/max`.
- Odak kapalıyken ilerleme çubuğu ve alt açıklama **gizlenir**; kart yüksekliği sabit kalsın diye
  yerine boşluk bırakılır (SPEC §8.3: "artan alan çip ızgarası ile ilerleme çubuğu arasındaki
  boşluğa gider").

### 4.5 "SIRADAKİ" (SPEC §3.5)

- Bölüm etiketi + sağda `<n> etkinlik` (500/11 muted).
- Saat 600/27 display + `<n> dk kaldı` pill'i (`--warning/0.15`, warning 600/10.5). Kalan süre
  istemcide hesaplanır, dakikada bir tazelenir.
- Başlık 600/14.5, alt satır 12 muted (`#kanal · tür · tekrar`).
- 3× 24px avatar (her biri `0 0 0 2px --surface-card` halka) + `<n> kişi katılıyor` 11.5 muted.
- Ardından alt etkinlik satırları; her biri üstte `1px --border/0.5` çizgi, `gap:11`:
  38px saat kolonu (600/13 display `--text-secondary` + 9.5 muted gün etiketi), 1×26 dikey
  ayırıcı, başlık 600/12.5 + alt satır 11 muted.
  Gün etiketi saf fonksiyondan: `bugün` / `yarın` / kısa gün adı. Testli.
- Alt liste uzunluğu ölçek adımına göre: **3 / 3 / 4 / 5**.
- Kart ayağı (`margin-top:auto`, üst boşluk 12): iki eşit buton `gap:7` — `Hatırlat`
  (`Button` sm primary) ve `Takvim` (`Button` sm, `bg-amber-400 text-slate-900`).
  Amber varyantı token denetim testinin izin listesindedir.

### 4.6 "ARKADAŞLAR" (SPEC §3.6)

Başlık satırı (baseline hizalı, `gap:10`): bölüm etiketi · `<n> çevrimiçi` (600/12 `--success`) ·
`· <m> kişiden` (11.5 muted) · sağa yaslı `Tümü` + 14px sağ ok (600/12 primary).

Kartlar: `display:flex; gap:8`, her biri `flex:1; min-width:0`. Kart padding `7 10 7 8`,
radius 14, `--surface-secondary` zemin, hover `translateY(-2px)` + `--surface-soft`.

- 28px `Avatar` + 9px presence noktası (`2px --surface-secondary` kenar).
- Ad 600/12.5, durum metni 10.5 muted, tek satır ellipsis.
- Durum metni **türetilir** (karar #5): sesli odada → `<oda>'da`; DND → `Rahatsız etmeyin`;
  boşta → `<n> dk boşta`; customStatus; presence etiketi. Saf fonksiyon `deriveFriendStatusText`,
  öncelik sırası testli.
- Kart sayısı ölçek adımına göre: **6 / 7 / 8 / 10**.
- Her kart `button` (Faz 5'te DM açar), `aria-label` tam metni taşır.

---

## 5. Yükleme ve boş durumlar

- **Her kart kendi `Skeleton`'unu gösterir.** Biri geciktiğinde diğerleri beklemez — altı ayrı
  query, `Promise.all` yok, tek `Suspense` sınırı yok.
- Skeleton satır yükseklikleri gerçek satırla aynı; yükleme bittiğinde ızgara zıplamaz.
- Boş durum: aynı kart kabuğu, ortada tek satır muted metin.
  - Kaldığın yer → `Henüz bir yere uğramadın`
  - Şu an canlı → `Şu an açık oda yok`
  - Yanıt bekliyor → `Bekleyen isteğin yok`
  - Sıradaki → `Yaklaşan etkinlik yok`
  - Arkadaşlar → `Çevrimiçi arkadaşın yok`
    Metinler i18n anahtarında (Faz 7); bu fazda anahtar adı sabitlenir.
- Hata durumu: kart içinde tek satır + `Tekrar dene` butonu. Tüm ekranı düşüren error boundary
  yok.

---

## 6. Yoğunluk tablosu — tek kaynak

```ts
export const HOME_DENSITY_BY_SCALE = {
  1: { recent: 4, live: 2, awaiting: 4, upcoming: 3, friends: 6 },
  1.15: { recent: 5, live: 2, awaiting: 5, upcoming: 3, friends: 7 },
  1.5: { recent: 6, live: 3, awaiting: 6, upcoming: 4, friends: 8 },
  2: { recent: 7, live: 3, awaiting: 7, upcoming: 5, friends: 10 },
} as const;
```

Query `limit` parametreleri buradan gelir. Adım değişince query key değişir ve yeni sayıda satır
istenir — **istemcide kırpma yok**, sunucudan doğru sayı istenir.

Veri yetmezse kartın kısmi hâli geçerlidir; boşluk doldurmak için sahte satır üretilmez.

---

## 7. Performans

- Altı kart bileşeni `React.memo`.
- Socket olayı yalnız ilgili query key'i etkiler; altı kart birden yeniden render olmaz.
- Avatar `next/image` kullanmıyorsa `loading="lazy"` + sabit boyut (CLS yok).
- Dalga formu tek `requestAnimationFrame` döngüsü, kart başına ayrı timer yok.
- "Sıradaki" geri sayımı **dakikada bir** — saniyede bir tik yok. Sekme gizliyken durur.
- Ölçek adımı değişiminde altı query birden yeniden çalışır; bu kabul edilir ama adım değişimi
  nadir olduğu için throttle yeterli (Faz 1 §2.2).

---

## 8. Kapı

```bash
pnpm --filter @wizards/web test
pnpm typecheck
pnpm lint
pnpm --filter @wizards/web exec playwright test e2e/specs/design
```

**Geçme koşulları:**

- [ ] Altı kart doğru ızgara alanında; ölçüler `HOME_METRICS`'ten, JSX'te çıplak sayı yok.
- [ ] `/` → `/home` yönlendirmesi çalışıyor; `(main)` auth zinciri bozulmadı.
- [ ] Her kart için render testi: dolu / yükleniyor / boş / hata.
- [ ] `getGreetingKey`, `deriveFriendStatusText`, gün etiketi, kalan süre — saf ve testli.
- [ ] `HOME_DENSITY_BY_SCALE` tablosu SPEC §8.3 ile birebir; test doğruluyor.
- [ ] Token denetim + arbitrary-px lint yeşil.
- [ ] `prefers-reduced-motion` açıkken nabız ve dalga durmuş (elle doğrulama, raporda).
- [ ] Bir kart hata verdiğinde diğer beşi çalışmaya devam ediyor (elle doğrulama).
- [ ] 1360×920'de dikey kaydırma yok.

## 9. Tuzaklar

- İç içe buton üretme (§4.3). HTML geçersiz olur ve klavye gezinmesi kırılır.
- Kart tint'lerini tasarımdaki sıraya göre sabitleme — örnek veriydi; kimlikten türet.
- Skeleton yüksekliğini gerçek satırdan farklı verme; ızgara zıplar, CLS artar.
- "0 okunmamış" badge'i render etme.
- `Şu an canlı` başlığındaki sayıyı `rooms.length` yerine sunucudan gelen toplamla göster —
  ölçek adımı listeyi kısaltıyor olabilir.
- Odak kapalıyken `Durumun` kartının yüksekliği değişirse ızgara satırı kayar; boşlukla dengele.
