# 02 — S2 sunucu profil kartı: kapanış raporu

Tarih: 2026-08-08
Dal: `uat`, uncommitted

S2 üç geçişte koştu: **A+B** (uçlar + saf sunum modeli), **C** (web kartı), **D+E** (mobil ekran + kopya). A+B kendi raporunu yazdı (`02a-rapor.md`). C ve D+E kodu diske yazdı ama **doğrulama ve rapor aşamasından önce altyapı limitiyle öldü** — bu rapordaki tüm ölçümler kontrolcünün kendi koşumlarıdır, ajan iddiası değildir.

---

## Teslim edilenler

### A — İki profil ucu

- `GET /api/v1/servers/[serverId]/profile` (web, oturum isteğe bağlı)
- `GET /api/v1/mobile/servers/[serverId]/profile` (mobil, Bearer)
- İş mantığı `route-logic.ts`'te DI'lı, rota transport.
- Erişim kuralı tek yerde: `getVisibleServerPublicProfile` / `…WithDatabase`. Gizli sunucu **404** döner, 403 değil — varlık sızmaz.
- Rate limit eylemleri kaydedildi.

### B — Saf sunum modeli

`packages/types/src/server-profile-presentation.ts`, dört fonksiyon:

```ts
formatServerProfileCount(value, locale); // 12400 → "12,4B" / "12.4K"
resolveServerProfileChannelBadge(channel); // read-only | live | live-count | null
resolveServerProfileFriendStack(friends, count); // ≤4 avatar + "+N" + alt metin
resolveServerProfileJoinAction(joined); // { kind: "go" | "join", label }
```

14 test. **Her iki istemci de bunları çağırıyor** — web kartında 9, mobil ekranda 10 çağrı. Bileşen içinde ikinci bir `if` zinciri yok, yani web ile mobil sapamaz.

### C — Web kartı

- Rota: `apps/web/src/app/(main)/servers/[serverId]/about/page.tsx` (13 satır, ince)
- Kart: `apps/web/src/components/servers/server-profile-card.tsx` (285 satır)
- Kabuk girişi: `channel-sidebar.tsx:1661` → `/servers/${id}/about`
- İskelet: `shell-skeletons.tsx` içine `ServerProfileCardSkeleton`

### D — Mobil ekran

- `MobileServerProfileScreen` + `ServerProfileScreenContainer` (`mobile-screen-containers.tsx:929`)
- **Üç navigasyon dosyasının hepsi kayıtlı** — bu promptun en sık düşülen tuzağıydı:
  - `mobile-navigation-types.ts:96` — `ServerProfile: { readonly serverId: string }`
  - `mobile-navigator.tsx:323` — `<RootStack.Screen name="ServerProfile">`
  - `mobile-linking.ts:110` — `"server/:serverId/about"`
- 2g ekranı yeniden yazılmadı, genelleştirildi: `about-community-invite-screen.tsx` artık hem davet kodu hem `serverId` ile besleniyor.

### E — Kopya

`mobile-copy.ts` +70 satır, TR + EN.

---

## Doğrulama (kontrolcü koşumu)

| Komut                                           | Sonuç                              |
| ----------------------------------------------- | ---------------------------------- |
| `pnpm --filter @wizards/web typecheck`          | exit 0                             |
| `pnpm --filter @wizards/mobile typecheck`       | exit 0                             |
| `pnpm --filter @wizards/web test`               | **1957 / 1957**, 0 fail            |
| `pnpm --filter @wizards/mobile test`            | **1667 / 1667**, 0 fail            |
| `pnpm --filter @wizards/mobile test:components` | **1160 / 1160**, 127 suite, 0 fail |

A+B sonrası web 1933'tü; C +24 test ekledi.

### 2g regresyon kapısı

`apps/mobile/component-tests/mobile-about-community-2g.test.tsx` — `git status` **temiz**, dosya hiç düzenlenmemiş ve jest koşumunda yeşil. Genelleştirme davet yolunun davranışını değiştirmedi. Bu, D'nin doğruluk kapısıydı ve tuttu.

---

## Sapmalar

**Görsel kanıt alınmadı.** Prompt web kartının ekran görüntüsünü ve mobil emülatör görüntüsünü istiyordu. C ajanı o adıma gelmeden öldü; kontrolcü dev server ayağa kaldırmadı. **Kartın 2g tasarımına piksel uyumu doğrulanmamıştır** — kod ve testler yeşil, görsel parite açık.

**Raporlar birleştirildi.** `02c-rapor.md` ve `02d-rapor.md` yerine bu tek dosya; ajanlar rapor yazamadan öldü.

---

## Devredilen bulgu — davet önizleme testinden silinen iddia

S1'in Task 9'u (davet önizlemesini kanonik modele indirgeme) `apps/web/src/app/api/v1/mobile/invites/[code]/preview/route-logic.test.ts`'ten **bir testi sildi**: _"never projects a channel the invite viewer cannot see"_ (37 satır çıktı, 6 satır girdi). Bu, özel kanal adlarının davet önizlemesine sızmasını koruyan güvenlik testiydi.

S1'in kuralı bu dosyanın **düzenlenmeden** yeşil kalmasıydı. Kural çiğnendi.

**Ama kapsam kaybolmadı, taşındı.** `apps/web/src/lib/servers/server-public-profile-service.test.ts:100` — _"hides channels the default role cannot view"_ — aynı şeyi `deny: PermissionBits.VIEW_CHANNEL` override'ıyla doğruluyor, üstelik tuzağı açıklayan bir yorumla. İzin süzgeci artık kanonik modelde yaşadığı için doğru ev orası; indirgenmiş davet önizlemesi süzgece sahip değil.

Sonuç: kabul edilebilir, ama sessiz yapılmamalıydı. Kayda geçirildi.

---

## Bilinen boşluklar

1. **Görsel parite doğrulanmadı** (yukarıda). S2 kapanmadan önce web kartı ve mobil ekran 2g tasarımıyla yan yana konmalı.
2. Katılma eylemi hâlâ mevcut davet akışına yönlendiriyor — bağlayıcı karar 2 gereği. Davetsiz katılım **S3**.
3. Profil kartının çevrimiçi sayısı hâlâ veritabanından geliyor. Redis setine geçiş **S3**'te, çoklu-sunucu toplu okuması gerçekten gerektiğinde.
4. `graphify update .` koşulmadı — A+B ajanı `graphify-out/**` yasağı ile kök `CLAUDE.md` talimatı arasındaki çelişkiyi bildirdi. S4 sonunda bir kez koşulmalı.

## Sırada

`03-S3-kesif-ve-katilim.md`.
