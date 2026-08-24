# Faz 2 — Ortak kabuk ve navigasyon paneli

**Ön koşul:** Faz 1. **Sonraki:** Faz 3.
**Önce oku:** `00-ortak-baglam.md` §3.3 (kabuk sapmaları), §3.5 (bileşen envanteri), karar #8.

Sunucu rayını SPEC ölçüsüne hizalar, 272px global navigasyon panelini yazar ve `WizardsShell`
içine **rota başına değişen 2. sütun** seçicisini kurar. Ana Sayfa'nın ve sonraki Mesajlar
paketinin ortak zemini burada bitiyor.

---

## 0. Başlangıç

```
graphify query "WizardsShell NavigationPanel ve ServerRail düzeni"
graphify query "sunucu ve DM okunmamış sayaçlarının kaynağı"
```

---

## 1. Sunucu rayı — 74 (SPEC §2.1)

`components/shell/server-rail.tsx` + `lib/appearance.ts:333`.

| Öğe                   | Değer                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------- |
| Ray genişliği         | 74 (`COMPACT_SERVER_RAIL_WIDTH` 68 → 74; sabitin adı yanıltıyorsa `SERVER_RAIL_WIDTH` yap)    |
| Kolon                 | dikey, ortalı, `gap:4`, padding `14 0 12`                                                     |
| Marka                 | 44×44 kutu içinde 40×40 `BrandLogo` (wordmark gizli, animasyon kapalı)                        |
| Ayırıcı               | 22×1, `--border/0.9`, dikey margin 9                                                          |
| Sunucu ikonu          | 44×44, radius 15, baş harf 600/15 display                                                     |
| Aktif ikon            | zemin `--primary`, metin `#fff`, gölge `0 8px 18px -10px hsl(var(--primary))`                 |
| Aktif seçim çubuğu    | solda 4.5×34, radius `0 5px 5px 0`, `--primary`, dikeyde ortalı                               |
| Okunmamış badge       | min-w 17, h 17, radius 6, `--danger`, `2px solid hsl(var(--surface-rail))`, `top:1 right:12`  |
| Hover (aktif hariç)   | `translateY(-2px)`                                                                            |
| Sunucu ekle           | 44×44, radius 15, `--primary/0.16`, `1.5px --primary/0.45`, "+" 19px stroke 2.4               |
| Ekle hover            | zemin `--primary/0.26`, `translateY(-2px)`, gölge `0 12px 24px -10px`                         |
| Katıl/içe aktar (alt) | `margin-top:auto`, 41×41, radius 14, `--success/0.2`, `1.5px --success/0.4`, indirme oku 17px |

Sunucu ikonu tint'leri sunucu kimliğinden türer (mevcut `ServerIcon` davranışı). Tasarımdaki
W/O/P/T/G renkleri örnek veridir — **sabit renk ataması yazma**.

Kısıt: `ServerRail`'in dışa açık API'si bozulmaz (§00 kural). Yalnız görsel hizalama.

---

## 2. Navigasyon paneli — `components/shell/app-nav-panel.tsx` (SPEC §2.2)

Genişlik 272, zemin `--surface-panel`, sağ kenar hairline `--border/0.4`.

### 2.1 Başlık

Padding `16 16 14`. "Whispr" 700/22 display, `letter-spacing -0.02em`. Metin i18n anahtarından
gelmez — ürün adı sabittir.

### 2.2 Ana navigasyon

Padding `0 10`, satır arası 2. Satır: padding `10 12`, radius 13, ikon 18 (stroke 1.8) + etiket,
`gap:12`.

| Satır           | Rota        | Sağ taraf                                        |
| --------------- | ----------- | ------------------------------------------------ |
| `Ana Sayfa`     | `/home`     | aktifken 6px primary nokta                       |
| `Mesajlar`      | `/channels` | `Badge` (primary) — DM okunmamış toplamı         |
| `Bahsedilmeler` | `/mentions` | `Badge tone="danger"` — okunmamış bahsedilme     |
| `Etkinlikler`   | `/events`   | sonraki etkinliğin saati, 600/11.5 display muted |
| `Keşfet`        | `/discover` | —                                                |

- Aktif satır: `--primary/0.13` zemin, `--primary` metin 600.
- Pasif satır: `--text-secondary` 500; hover `--surface-soft` + `--foreground`.
- Her satır gerçek `a` (Next `Link`) — `div onClick` yok.
- Sayaç yoksa badge **hiç render edilmez** (0 yazan badge yok).
- Rozetler `aria-label` taşır: "3 okunmamış mesaj", "2 okunmamış bahsedilme".
- `/mentions` ve `/events` Faz 6'da yazılacak. Bu fazda satırlar var; hedef henüz yoksa rota
  oluşturulana kadar `aria-disabled` **yapma** — Faz 6 aynı pakette, kısa süre 404 kabul edilir ve
  raporda not düşülür. Alternatif: Faz 6'ya kadar `/notifications` benzeri en yakın mevcut yüzeye
  bağla ve Faz 6'da düzelt. **Hangisi seçildiyse raporda yazılır.**

### 2.3 Ayırıcı + bölüm etiketi

1px `--border/0.5`, margin `14 16 12`. Sonra "SUNUCULARIM" (600/10.5 display, `0.15em`, uppercase,
muted) + sağda 15px "+" ikonu, padding `0 18 8`. "+" gerçek buton, `aria-label` taşır, mevcut
sunucu oluştur akışını açar.

### 2.4 Sunucu listesi

Padding `0 10`, satır arası 1. Satır: padding `8 10`, radius 12, `gap:11`.

- 28×28 radius 9 baş harf ikonu (600/12 display).
- Ad 13.5 — okunmamışı olan sunucuda 600 + `--foreground`, diğerlerinde 500 + `--text-secondary`.
- Sağda **ya** yeşil nokta + çevrimiçi sayısı (500/11, `--success`) **ya** okunmamış badge
  (min-w 19, h 19, radius 6, danger). İkisi birden değil.
- Son ziyaret edilen sunucunun satır zemini `--surface-soft/0.6`.
- Hover `--surface-soft/0.7`.
- Liste uzunsa kaydırma **panelin içinde**; kullanıcı ayağı her zaman görünür kalır.
- Çevrimiçi sayısı gerçek veriden gelir; yoksa `TODO(api):` ile işaretlenip Faz 3'te bağlanır.

### 2.5 Kullanıcı ayağı

`margin-top:auto`, padding `14 10`, üst kenar 1px `--border`, zemin `--surface-card`, `gap:9`.

- `Avatar` 40. Odak modu açıkken çift halka:
  `box-shadow: 0 0 0 2.5px hsl(var(--warning)), 0 0 0 6px hsl(var(--warning)/0.2)`.
  Odak kapalıyken halka **presence rengini** alır (success/warning/danger/muted).
- Sağ altta 11px presence noktası, `2.5px solid hsl(var(--surface-card))` kenar.
- Ad 600/14. Alt satır: odak açıkken "Odak modu · <n> dk" 600/11.5 `--warning` + 6px nokta;
  kapalıyken presence etiketi ya da customStatus.
- Sağda üç ikon butonu 28×28 radius 9, muted, hover `--surface-soft` + foreground: mikrofon,
  kulaklık, ayarlar. Her biri `aria-label` + `aria-pressed` (toggle olanlar).
- Mevcut `UserProfileFooter` davranışı (durum değiştirme menüsü, ayarlar overlay'i) korunur —
  yeniden yazma, görsel olarak hizala.

---

## 3. Rota başına 2. sütun — `WizardsShell`

Tek seçici, kopyalanmış kabuk yok:

```
/home                      → AppNavPanel
/channels/@me, /channels/* → DM sohbet rayı (Mesajlar paketi; bugünkü ChannelSidebar DM hâli)
/channels/[serverId]/*     → ChannelSidebar (kanal listesi)
/mentions, /events, /inbox → AppNavPanel
/discover                  → AppNavPanel
```

- Seçim saf fonksiyonda: `selectSecondaryColumn(pathname): "nav" | "dm" | "channels"`. Testli.
- `WizardsShell` yeniden yapılandırılırken mevcut mobil drawer, overlay ve modal yolları
  bozulmaz — bunlar 1608 satırın büyük kısmı; **dokunma**, yalnız 2. sütun render'ını dallandır.
- Panel genişliği rem: 272 → `17rem`. Ray 74 → `4.625rem`.
- `AppNavPanel` `React.memo`; pathname dışında prop değişmediğinde yeniden render etmez.

---

## 4. Tek kaynaklı sayaçlar

Ana Sayfa ile Mesajlar aynı sayıyı göstermek zorunda (PROMPT §9).

- DM okunmamış toplamı: mevcut `useDMConversations` türevi tek hook'a çıkar
  (`useUnreadCounters`), her iki yüzey de onu çağırır. İki ayrı hesap yok.
- Sunucu okunmamışı: `server:unread:update` socket olayı zaten var; store'daki tek kaynaktan
  okunur.
- Bahsedilme sayacı: Faz 3'te `app/summary` gelene kadar `TODO(api):` ile 0.
- Hook memoize edilir; her socket olayında tüm panel değil yalnız ilgili satır güncellenir.

---

## 5. Erişilebilirlik

- Panel `nav` elementi, `aria-label="Ana navigasyon"`.
- Aktif satır `aria-current="page"`.
- Sunucu listesi `ul`/`li`; her satır `a`.
- Ray de `nav`, ayrı `aria-label`.
- Klavye: `Tab` sırası ray → panel → ana alan. Panel içinde ok tuşu gezinmesi **eklenmez**
  (link listesi, standart davranış yeterli).

---

## 6. Kapı

```bash
pnpm --filter @wizards/web test
pnpm typecheck
pnpm lint
pnpm --filter @wizards/web exec playwright test e2e/specs/design
pnpm --filter @wizards/web e2e:smoke
```

**Geçme koşulları:**

- [ ] Ray 74, panel 272; ölçüler `HOME_METRICS`'ten okunuyor, JSX'te çıplak sayı yok.
- [ ] `selectSecondaryColumn` testi 5 rota kalıbını doğru dallandırıyor.
- [ ] Token denetim testi yeni dosyalarda yeşil.
- [ ] Arbitrary-px lint kuralı `app-nav-panel.tsx` üzerinde geçiyor.
- [ ] `e2e:smoke` yeşil — mevcut sunucu/DM gezinmesi bozulmadı.
- [ ] Mobil drawer ve overlay yolları çalışıyor (elle doğrulama, raporda).
- [ ] Panel `nav` + `aria-label` + `aria-current` taşıyor; ikon-only butonlarda `aria-label` var.
- [ ] `AppNavPanel` pathname değişmeden yeniden render olmuyor (Profiler ile doğrulandı).

## 7. Tuzaklar

- `WizardsShell` 1608 satır ve mobil/overlay mantığının çoğu orada. Refactor iştahına kapılma;
  bu fazın işi **tek bir dallanma** eklemek.
- `COMPACT_SERVER_RAIL_WIDTH` adı "compact" diyor ama tek ray genişliği o. Yeniden adlandırırken
  tüm tüketicileri tara.
- Kullanıcı ayağındaki halka rengi presence'a bağlı; odak modu Faz 3'te gelene kadar warning
  halkasını sabitleme — presence'tan türet, odak geldiğinde üstüne binsin.
- Panel içi kaydırma `overflow-y:auto` verilecekse kullanıcı ayağı kaydırma alanının **dışında**
  kalmalı, yoksa uzun sunucu listesinde ayak yukarı kaçar.
- Sunucu listesi satırında hem çevrimiçi sayısı hem badge gösterme — tasarım "ya / ya" diyor.
