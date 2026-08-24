# Ş5 — Dalga 2 · Akış, başlık, featured · rapor

**Tarih:** 2026-08-21 · **Dal:** `uat` · **Commit/push yok.**

Görev: `docs/prompts/whispr-kesfet/06-dalga2-s5-akis-baslik-featured.md`.

## Sonuç

- `/discover` sayfa sahibi `DiscoverPage` ile kuruldu; durumun tek kaynağı URL.
- Yalnız aktif şeridin React Query sorgusu açılıyor. Sunucu/kişi/kanal/etkinlik anahtarları ve
  istemci Zod sınırları eklendi.
- Panel açıkken şerit grubu, ikon grubu ve featured aynı `visibility` nesnesinden DOM dışı.
- `Esc` URL üzerinden önce modalı, sonra paneli kapatıyor; kapatacak katman yoksa işlem yok.
- Modal/panel kapanışı URL commit'inden sonra odağı açan kontrole döndürüyor. Featured önizleme
  yeniden mount olduğundan kalıcı bir ID ile bulunuyor.
- Başlık, alt satır, lane tabları/sayaçları, kart boyutu, filtre çipleri, bölüm başlığı ve HTML
  otoritesindeki featured ölçüleri uygulandı.
- Join/leave mutasyonu sayfada; başarılı sonuç sorguları invalid ediyor, katılım şeridini yönetiyor,
  leave eski şeridi temizliyor, hata yerelleştirilmiş danger toast üretiyor, pending yeni isteği
  engelliyor.
- Ş7/Ş8/Ş9 slot yüzeyi; profil join/leave, loading/error/retry, empty/error modal açma, responsive,
  modal ve banner prop'larıyla açık.
- Ş6 renderer imzaları gerçek Ş6 bileşen prop tiplerinden türetildi. Kart yerleri basit
  `TODO(Ş6):` yer tutucuları; Ş6 dosyalarına kod yazılmadı.
- Sol `74 ray + 228 nav + kullanıcı barı` değiştirilmedi.

## Dosyalar

Yeni:

- `apps/web/src/components/discover/discover-page.tsx` (+ `.test.tsx`)
- `apps/web/src/components/discover/discover-feed-header.tsx` (+ `.test.tsx`)
- `apps/web/src/components/discover/discover-featured.tsx` (+ `.test.tsx`)
- `apps/web/src/components/discover/discover-filter-strip.tsx` (+ `.test.tsx`)
- `apps/web/src/components/discover/discover-section-head.tsx`
- `apps/web/src/lib/discover/client.ts` (+ `.test.ts`)
- `apps/web/src/lib/discover/use-discover-route.ts`

Değişen:

- `apps/web/src/app/(main)/discover/page.tsx`
- `apps/web/src/lib/locale/messages/{tr,en}.ts`: yalnız Ş5 pending alt satır anahtarı

## Kapılar

| Kontrol                                           | Sonuç                                                     |
| ------------------------------------------------- | --------------------------------------------------------- |
| Dalga 0 ön koşulu                                 | **PASS** — Ş0 raporundaki focused sözleşme kapıları yeşil |
| Ş5 focused (`page/header/featured/filter/client`) | **PASS — 23/23**                                          |
| Ş5 hedefli ESLint                                 | **PASS**                                                  |
| `pnpm --filter @wizards/web typecheck`            | **FAIL — S5 dışı 2 hata**                                 |
| `pnpm --filter @wizards/web lint`                 | **PASS** — config testleri 10/10 + ESLint                 |
| `pnpm --filter @wizards/web test`                 | **FAIL — 4758 test; 4753 pass, 4 fail, 1 skip**           |
| `graphify update . --no-cluster`                  | **PASS — 31294 node, 83795 edge**                         |
| Read-only nihai review                            | **READY — kalan actionable bulgu yok**                    |

Typecheck dış hata:

```text
apps/web/src/app/api/v1/events/[eventId]/rsvp/route-logic.test.ts(70,46):
  TS2339 Property 'counts' does not exist on type 'never'.
apps/web/src/app/api/v1/events/route-logic.test.ts(219,51):
  TS2339 Property 'counts' does not exist on type 'never'.
```

Tam testteki dört dış hata:

1. `API v1 route contract › requires mutating routes to either parse JSON centrally or be documented as bodyless`
2. `useNextEventClock — sayaç kaynağı › hafif istek limit=0 ile gider`
3. `Mesajlar denetim bütçesi › components/dm bütçeyi aşmaz`
4. `Mesajlar denetim bütçesi › components/dm bütçesi gerçekten harcanmış`

Son iki hata `components/dm/group-create-dialog.tsx:608` içindeki mevcut `hsl(` borcundan.
Bu dosyalar Ş5 sahipliğinde değil; değiştirilmedi.

## Sınırlar

- Commit, push, migration, deploy yok.
- Büyük ve paralel dirty worktree korundu; Ş5 dışı başarısızlıklar düzeltilmedi.
- Tarayıcı/E2E görsel parity bu şeridin kapısı değildi; **NOT RUN**.
