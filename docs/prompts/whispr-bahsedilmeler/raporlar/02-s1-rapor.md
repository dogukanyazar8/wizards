# Dalga 1 · Ş1 raporu — kabuk 4. kolonu + bahsetme rayı

Tarih: 2026-08-21 · Branch: `uat` · **Commit atılmadı.**

Kapı yeşil. Yeni test: **24** (ray 22 · kabuk seçicisi 2).

---

## Ne yapıldı

| Dosya                                                          | Durum                                                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `apps/web/src/lib/home/third-column.ts`                        | `"mentions"` dalı + `ThirdColumn` tipi genişledi                                           |
| `apps/web/src/lib/home/third-column.test.ts`                   | `/mentions` `null` iddiasından çıkarıldı, 2 yeni test                                      |
| `apps/web/src/components/shell/wizards-shell.tsx`              | yalnız `mentions` dalı: 2 import, `mentionsRail` prop'u, dallanma, genişlik, ray elemanı   |
| `apps/web/src/lib/mentions/client.ts`                          | yeni — `mentionsQueryKeys`, `MENTIONS_STALE_TIME_MS`, `fetchMentionCounts`, `// Ş3` sınırı |
| `apps/web/src/components/mentions/mentions-rail-container.tsx` | yeni — sayaç sorgusu, `read-all` mutasyonu, 250ms arama debounce'u                         |
| `apps/web/src/components/mentions/mentions-sidebar.tsx`        | yeni — 276'lık ray + `buildMentionSourceRows`                                              |
| `apps/web/src/components/mentions/mentions-sidebar-row.tsx`    | yeni — tür satırı ve kaynak satırı                                                         |
| `apps/web/src/components/mentions/mentions-sidebar.test.tsx`   | yeni — 22 test                                                                             |

Sol taraf (`server-rail.tsx`, `app-nav-panel.tsx`, kullanıcı barı) **açılmadı bile**.
`wizards-shell.tsx` içinde `mentions` geçen satırlar: 65, 66, 275, 314, 401–402, 654–657,
1363–1365, 1470, 1524 — hepsi dallanma, genişlik ya da prop taşıma.

### Kabuk

`selectThirdColumn("/mentions")` artık `"mentions"`. Genişlik
`pxToRem(MENTIONS_METRICS.shell.railWidth)` (276) → `--third-column-width`; ana alanın ofseti
zaten bu değişkenden türüyor, ikinci bir sayı eklenmedi. `<960px` davranışı **kendiliğinden**
doğru çıktı: `navCollapsed` koşulu `thirdColumn !== "channels"` diyor ve `/mentions` o kümede;
ray mevcut `NavigationPanel` + `MobileDrawerTrigger` yoluyla drawer'a düşüyor, ikinci bir drawer
mekanizması yazılmadı.

### Ray

Bölümler SPEC §3 sırasıyla: başlık + `--danger` rozeti (okunmamış yoksa **render edilmez**) ·
aksiyon satırı (`Tümünü okundu işaretle` + 36×36 zil) · arama · `Türe göre` + 4 tür satırı ·
ayırıcı · `Kaynağa göre` + toplam sayı · kaynak satırları (`overflow-y:auto`).

Ölçülerin tamamı `MENTIONS_METRICS.sidebar` / `.shell` sözlüğünden `pxToRem` / `pxToEm` /
`hairline` ile. Dosyalarda arbitrary px sınıfı ve onaltılık renk yok; ters metin `text-white`
Tailwind sınıfı (`#fff` yazılmadı).

Metinlerin tamamı Dalga 0'ın `mentions.*` anahtarlarından. **Yeni anahtar uydurulmadı** —
`mentions.kind.role.subtitleEmpty` ve `mentions.sidebar.loading` dahil hepsi zaten yazılmıştı.

---

## SPEC sapmaları (kayda geçen 8 madde)

Hiçbiri **ölçü** sapması değil: kontrol edilen her sayı `Bahsedilmeler.dc.html` inline
`style`'ıyla tuttu. Sapmalar davranış ve üretim verisi tarafında.

| #   | Konu                     | Referans                                                               | Uygulanan                                         | Gerekçe                                                                                                                                                                                                                 |
| --- | ------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Satır elemanı            | `div` + `onClick`                                                      | `next/link` `<Link>`                              | Filtre ve kaynak URL'de duruyor; gerçek `href` paylaşılabilirliği, orta tıkla yeni sekmeyi ve geri tuşunu bedavaya getirir.                                                                                             |
| 2   | Eksen bağımsızlığı       | tür satırı `source:null` yazıyor, kaynak satırı `filter:'all'` yazıyor | her satır **yalnız kendi eksenini** değiştirir    | SPEC §2 filtreyi ve kaynağı ayrı eksen sayıyor ve akış başlığı ikisini birden gösteriyor; iki tık önce yapılmış bir seçimi sessizce atmak kullanıcıyı şaşırtır.                                                         |
| 3   | `panel` / `modal`        | referans panelini koruyor                                              | ray bağlantıları `panel`i ve `modal`ı **düşürür** | Bağlam paneli tek bir bahsetmeye bağlı; yeni süzgeç o bahsetmeyi listeden çıkarabilir ve dayanağı olmayan bir kolon açık kalırdı.                                                                                       |
| 4   | Zil butonu               | yalnız açar                                                            | açar **ve** kapatır                               | Ş8'in modalı gelene kadar vurgulanmış buton ölü bir kontrol olmasın diye. Adres yine `?modal=settings`.                                                                                                                 |
| 5   | Kaynak tile rengi        | sunucu başına sabit (`W`=primary, `P`=success/.2, `O`=warning/.2)      | `getServerAccentStyle(serverId, "rail")`          | Tasarımın renkleri örnek veri; ürün sunucu tint'ini kimlikten türetiyor ve bu havuz zaten var (`lib/home/server-identity.ts`). DM satırı SPEC'in verdiği `--surface-tertiary` / `--text-secondary` + `50%` ile birebir. |
| 6   | Adı bilinmeyen kaynak    | —                                                                      | listelenmez                                       | Kullanıcı ayrıldığı sunucunun kimliğini sayaçta bir süre taşıyabilir; ekrana uuid yazmak satırı okunamaz yapardı.                                                                                                       |
| 7   | `Tümünü okundu işaretle` | her zaman etkin                                                        | okunmamış 0 iken ve istek uçarken `disabled`      | SPEC sessiz. Okunacak bir şey yokken çalışan bir buton, sonucu olmayan bir tık demek.                                                                                                                                   |
| 8   | Hover parlaklığı         | `filter:brightness(1.08)`                                              | `hover:brightness-[1.08]`                         | Tailwind'in `brightness-110`'u 1.1; tasarımın verdiği 1.08 aynen korundu.                                                                                                                                               |

---

## Bırakılan `TODO(api):` (3 madde)

1. **`MENTIONABLE_ROLE_NAMES`** (`mentions-rail-container.tsx`) — `Rol bahsetmeleri` satırının alt
   metni kullanıcının **bahsedilebilir** rollerinin adlarını istiyor. `Role.mentionable` şemada
   var ama kullanıcının rollerini sunucular arası tek çağrıda veren bir uç yok; sunucu başına
   `roles` çekmek ray için N istek olurdu. Satır bugün `mentions.kind.role.subtitleEmpty`
   ("Bahsedilebilir rolün yok") gösteriyor — boş bir alt satır değil, doğru bir cümle.
   Ş3 sayaç yanıtına rol adlarını eklerse tek satırlık bir bağlama işi kalıyor.
2. **`requestMarkAllMentionsRead`** (`mentions-rail-container.tsx`) — `POST /api/v1/mentions/read-all`
   Ş3'ün ucu. Ray sözleşmeye göre çağıran tipli bir adaptör kullanıyor; uç gelince fonksiyon
   `lib/mentions/client.ts` içindeki `// Ş3` sınırının altına taşınır. **Sahte başarı
   dönmüyor:** rozeti bir anlığına sıfırlayıp geri getirmek, olmayan bir işi olmuş gibi
   göstermek olurdu.
3. **`fetchMentionCounts`** → `GET /api/v1/mentions/counts` (Ş3). Uç inene kadar sorgu hata
   veriyor ve ray satırları **pilsiz** çiziliyor — PROMPT §3'ün istediği yol. Ekran çökmüyor,
   filtreler çalışmaya devam ediyor.

---

## Devir notları (Ş5 ve Ş8 için)

1. **`/mentions` ana alanı hâlâ eski `MentionsScreen`.** Ekranda şimdi iki `Bahsedilmeler`
   başlığı ve iki filtre yüzeyi var. Dahası iki yüzey **aynı** `?filter=` anahtarını farklı
   sözlüklerle kullanıyor: eski ekran `all/unread/servers/dms`, ray `all/unread/me/role/thread/dm`.
   İki ayrıştırıcı da tanınmayan değerde `all`'a düşüyor, o yüzden çökme yok — ama Ş5
   `mentions-screen.tsx`'i değiştirene kadar geçiş hâli budur.
2. **Mobil drawer satır tıklamasında kapanmıyor.** Ray satırları saf `<Link>`; `MessagesRail`
   satırları da bugün böyle. Yeni bir açık değil, mevcut davranışla parite — kapatılacaksa
   iki rayda birden kapatılmalı.
3. **`lib/home/token-audit.ts` kapsamı `components/mentions`i içermiyor.** Dosya Ş1'in sahiplenilen
   kümesinde olmadığı için açılmadı; kapsamı genişletmek bir sonraki şeridin ya da Ş10'un işi.
   Ray dosyaları kuralı zaten sağlıyor (hex/rgb/sabit font adı yok).
4. **`mentionsQueryKeys.counts(window)` pencereyi anahtara alıyor.** 30 günlük sayılarla
   `window=all` sayıları farklı cevaplar; tek anahtar altında biri diğerinin üstüne yazılır ve
   ray bir an yanlış sayıyı gösterirdi. Ş3 aynı anahtarı geçersiz kılarken bunu bilmeli.
5. **Ray saf sunum.** `MentionsSidebar` hiçbir sorgu açmaz, hiçbir mutasyon çağırmaz; sayılar
   tek bir `MentionCounts` nesnesinden gelir (`readMentionKindRowCount`). Ş5 sekme pillerini
   **aynı** nesneden okumalı, ikinci bir toplama yazmamalı.

---

## Kapı çıktısı

```
pnpm --filter @wizards/web typecheck   ✔ (exit 0, çıktı yok)
pnpm --filter @wizards/web lint        ✔ (exit 0) 10/10 config testi + eslint temiz
pnpm --filter @wizards/web test        ✔ (exit 0) 3720 test · 3719 pass · 0 fail · 1 skip · 855 suite
```

Dalga 0 tabanı 3696 testti; Ş1 **+24** getirdi.

**Kapı sırasında bir kez kırmızı görüldü ve Ş1'e ait değildi:** paralel koşan şerit 01:35'te
`apps/web/src/lib/mentions/mentions-service.ts` ve `mentions-query.ts` dosyalarını yazdı ve
typecheck 3 `TS2349` verdi (`prisma.message` / `prisma.dMMessage` birleşiminde `findMany`
çağrılamıyor). Dosyalar Ş1'in sahiplenilen kümesinde değil; ilgili şerit düzeltince kapı kendi
kendine yeşile döndü. Yukarıdaki çıktı düzeltme sonrası koşudur.

## Koşulamayan doğrulama

Tarayıcıda görsel doğrulama **yapılmadı**. `/mentions` oturum arkasında; `apps/web/.env`
içinde `E2E_TEST_MODE=false` ve `/api/e2e/auth/session` bu bayrağa bakıyor. Bayrağı çevirmek bir
güvenlik kapısını değiştirmek olurdu ve bu şeridin kapsamında değil. Dev sunucusu ayağa kalkıyor
(DB bağlı, outbox drain çalıştı), yalnız `/` `307` ile girişe dönüyor. Bayrak açılırsa ya da
e2e fixture'ları seed'lenirse ray ekranda tek geçişte doğrulanabilir.
