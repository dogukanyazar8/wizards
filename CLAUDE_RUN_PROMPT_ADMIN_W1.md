# RUN PROMPT — Admin Dalga 1: B1 Yetki + E1 Kampanya Güvenliği

Whispr admin yeniden tasarımının 1. dalgasını uygula. Bu dalga yeni özellik değil, **üretimdeki iki canlı hatanın düzeltmesi**:

1. **B1:** Dört admin API rotası rol filtresiz — `ANALYST` rolü ham e-posta listesini ve tüm aktivite CSV'sini alabiliyor.
2. **E1:** `FAILED` kampanya yeniden gönderilince daha önce almış herkese **ikinci kez** bildirim gidiyor (`dedupeKey` yazılmıyor, `sentCount` sıfırlanıyor, alıcı listesi yeniden çözülüyor).

## Okuma sırası (kod yazmadan önce, tamamını)

1. `docs/superpowers/plans/2026-07-27-admin-wave1-b1-e1.md` — görev listesi, tüm adımlar burada
2. `docs/superpowers/specs/2026-07-26-admin-panel-shell-design.md` §5 (B1 gerekçe + capability haritası)
3. `docs/superpowers/specs/2026-07-26-admin-campaigns-product-voice-design.md` "Doğrulanmış mevcut durum" + §E1
4. Mevcut kod: `apps/web/src/lib/admin/access.ts`, `apps/web/src/lib/admin/notification-campaigns.ts:242-326`

## Bağlayıcı kurallar

- **Commit atma.** Çalışma ağacında bırak, dalga sonunda raporla. Kullanıcı commit'i ayrıca ister.
- **TDD:** her görev planındaki kırmızı testle başlar. E1'in çift-gönderim regresyon testi bugünkü kodda kırmızı olmalı — önce bunu kanıtla.
- Migration yalnızca `packages/db/prisma/rebaseline-migrations` altına (başka dizin sessizce çalışmaz). `PENDING_APPROVAL` enum değeri eklendiği migration dosyasında kullanılamaz (Postgres tx kısıtı).
- Görevleri plan sırasıyla uygula (superpowers:executing-plans veya subagent-driven-development).
- Capability rol listeleri planda; `feedback.*` değerleri mevcut `FEEDBACK_READ_ROLES/WRITE_ROLES` ile birebir aynı olmalı — farklıysa mevcut sabit esas.

## Doğrulama (dalga sonu, hepsi yeşil)

```bash
pnpm --filter @wizards/db test
```

```bash
pnpm --filter @wizards/web typecheck
```

```bash
pnpm --filter @wizards/web lint
```

```bash
pnpm --filter @wizards/web test
```

```bash
graphify update .
```

## Rapor formatı

- Kırmızıdan yeşile dönen regresyon testleri (isim + dosya)
- `ANALYST` → `GET /api/v1/admin/users` ve `activity.csv` artık 403 kanıtı
- Değişen dosya listesi + satır sayıları
- Karşılaşılan sürprizler / plandan sapmalar (sapma varsa gerekçesiyle)
