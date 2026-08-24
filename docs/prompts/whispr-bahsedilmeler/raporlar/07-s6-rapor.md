# Dalga 2 · Ş6 raporu — `MentionCard` + tür pili + `⋯` menüsü

Tarih: 2026-08-21 · Branch: `uat` · **Commit atılmadı.**

Şerit tamamlandı. Yeni test: **36** (kart 25 · menü 11).

---

## Ne landed

| Dosya                                                         | Durum                                                                         |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `apps/web/src/components/mentions/mention-card.tsx`           | yeni — kart kabuğu, anatomi, eylem satırı, saat                               |
| `apps/web/src/components/mentions/mention-card.test.tsx`      | yeni — 25 test                                                                |
| `apps/web/src/components/mentions/mention-card-menu.tsx`      | yeni — `⋯` menüsü                                                             |
| `apps/web/src/components/mentions/mention-card-menu.test.tsx` | yeni — 11 test                                                                |
| `apps/web/src/components/mentions/mention-kind-badge.tsx`     | yeni — dört tür pili                                                          |
| `apps/web/src/components/mentions/mention-source-tile.tsx`    | yeni — kaynak karesi + `resolveMentionSourceLabel`                            |
| `apps/web/src/components/mentions/mentions-page.tsx`          | `renderMentionCardFallback` **silindi**, `renderCard` varsayılanı gerçek kart |

---

## 1. Kart saf kaldı

`MentionCardProps` (Dalga 0) sözleşmesi aynen: hiçbir mutasyon, hiçbir sorgu. Üç bağlam okuması
istisna değil — `useI18n` ve `useAccountPreferenceRuntime` zamanlayıcı kurmuyor, istek atmıyor.

**Saat kullanıcının kendi tercihinden.** `formatMentionCardTime` 12/24 saat kararını
`formatTime`a bırakıyor; kartın içine sabit bir `Intl` çağrısı yazmak hesap tercihini sessizce
yok saymak olurdu. Eşikler `resolveMentionTimeBucket` ile **ortak** (Ş5): ayrı bir eşik
yazılsaydı bir kart `Pazartesi` etiketiyle `Daha eski` grubunun altında durabilirdi.

**`now` bir kanca değil**, render anındaki `new Date()`. `useMinuteClock` kart başına bir
zamanlayıcı demekti — 60 kart, 60 aralık. Sayfa zaten tek bir dakika saati tutuyor ve tik
geldiğinde bütün ağacı yeniden çiziyor, yani etiket bir dakikadan fazla bayat kalmıyor.

## 2. Menü — SPEC ölçülerine ulaşmanın tek yolu

**Paylaşılan `ContextMenu` kabuğu kullanılamadı; bu şeridin tek büyük sapması.**

`components/ui/context-menu.tsx` gövdeye portallanan, görünüm alanı koordinatlarıyla
(`position: {x, y}`) yerleştirilen ve `min-w-52` (208) / `rounded-2xl` (16) ile sabitlenmiş bir
kabuk. SPEC §5.1 menüyü **karta** göre konumluyor (`top: 34` / `bottom: 34`), 218 genişlik,
14 yarıçap ve `z-index: 5` istiyor. Kabuk bunları `className` ya da `style` ile almıyor ve o
dosya bu şeridin kümesinde **"okunur, yazılmaz"** olarak işaretli.

Kart-hizalı konum ayrıca **yönün varlık sebebi**: ilk iki kart aşağı, kalanlar yukarı açılarak
menü akışın dışına taşmıyor. Görünüm alanına portallanan bir menüde bu kural anlamsız olurdu.

Satırlar yine paylaşılan `ContextMenuItem` / `ContextMenuSeparator`: `role="menuitem"`, odak
halkası ve yıkıcı ton oradan geliyor, ikinci kez yazılmadı. Kapanma (`⋯`'ye tekrar basış, satır
seçimi, `Esc`, dış tıklama), `Tab` döngüsü ve odağın `⋯`'ye dönmesi menü bileşeninde.

`Esc` menü açıkken `stopPropagation` ile yakalanıyor: akışın klavye katmanına inseydi tek tuş
hem menüyü hem paneli kapatırdı.

## 3. `--act` ve `--hov`

`⋯` butonunun opaklığı `calc(var(--act) + var(--hov))`. `--hov` karta `hover:[--hov:1]` ile,
`--act` menü açıkken `1` olarak yazılıyor — fare karttan çıksa bile açık menünün tetikleyicisi
görünür kalıyor. Klavye için ayrı bir kural var (`focus-visible:opacity-100`); olmasaydı `⋯`
klavye kullanıcısı için görünmez bir hedef olurdu.

---

## 4. Sapmalar (3 madde)

| #   | Konu        | SPEC                              | Uygulanan                                                                  | Gerekçe                                                                                                          |
| --- | ----------- | --------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1   | Menü kabuğu | "mevcut `ContextMenu` kullanılır" | `mention-card-menu.tsx` kendi kabuğunu çiziyor, satırlar `ContextMenuItem` | §2. Paylaşılan kabuk 218/14/`z-5`/kart-hizalı konumu alamıyor ve dosya yazılamaz                                 |
| 2   | `role` tonu | `hsl(199 89% 48%)`                | `--info` token'ı                                                           | Dalga 0 o tonu `--info` olarak tanımladı; pilde ham renk yazmak temanın kontrol edemediği tek bir renk bırakırdı |
| 3   | Kart imleci | SPEC yalnız zemin/kenar veriyor   | `active` durumu `ring-ring` ile, zemin değişmiyor                          | Klavye imleci ile okunmamışlık **iki ayrı bilgi**; ikisi de zemine yazılsaydı ayırt edilemezdi                   |

## 5. Kabul ölçütleri

- [x] Okunmamış/okunmuş iki durum zemin/kenar/şerit değerlerini birebir taşıyor
- [x] Dört tür pili doğru etiket ve tonda; `role` `--info` kullanıyor
- [x] Alıntı tek satır ellipsis; uzun kanal adı üst satırı taşırmıyor (`min-w-0` zinciri)
- [x] `Okundu işaretle` ↔ `Okunmadı işaretle` etiketi `mention.unread`den türüyor
- [x] Menü 4 satır + ayırıcı; DM kartında 3. satır `Bu sohbeti sessize al`
- [x] İlk iki kart aşağı, sonrakiler yukarı; menü kartın sağ kenarına hizalı ve akış dışına taşmıyor
- [x] `Esc` ve dış tıklama kapatıyor, odak `⋯`'ye dönüyor
- [x] Klavyeyle odaklanınca `⋯` görünür
- [x] Kartta sabit renk/px yok; bütün metinler `t(...)` üzerinden (menü testinde satır içi
      stillerde `px` aranıyor, yalnız `hairline`ın `max(1px, …)` tabanı kalıyor)

## 6. Kapı

```
pnpm --filter @wizards/web typecheck   ✔
pnpm --filter @wizards/web lint        ✔
pnpm --filter @wizards/web test        ✔ 4104 test · 4103 pass · 0 fail · 1 skip
```
