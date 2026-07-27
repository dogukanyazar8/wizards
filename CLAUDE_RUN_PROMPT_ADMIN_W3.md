# RUN PROMPT — Admin Dalga 3: D1 Moderasyon + C1 Sağlık + C2 Flags + C3 Push Telemetrisi

Whispr admin yeniden tasarımının 3. dalgası. Dört bağımsız paket — üç oturuma bölünebilir (D1 / C1+C3 / C2); ortak dokunulan dosyalar yalnızca `schema.prisma` ve `capabilities.ts`, migration'lar sıralı uygulanır:

1. **D1:** Raporlar bugün yazılıyor ama **hiçbir yerde okunmuyor**. Vaka modeli + kuyruk + vaka dosyası + aksiyonlar (delilsiz profil-raporu MVP'si — delil D2'de). Audit `ipHash` düzeltmesi dahil.
2. **C1:** İstemci sağlık olayları — mobil ölçüm bugün bellekte birikip ölüyor; ingest ucu + `/admin/health` ekranı.
3. **C2:** Feature flag + kill-switch — bugün bozulan özelliği kapatmanın tek yolu yeni sürüm.
4. **C3:** Expo push ticket sonuçları — `PushDeliveryAttempt`.

**Ön koşul:** Dalga 1 + 2 tamam (capability haritası, kit, rota kabuğu, `ClientAttribution`).

## Okuma sırası

1. `docs/superpowers/plans/2026-07-27-admin-wave3-d1-c1-c2-c3.md`
2. `docs/superpowers/specs/2026-07-26-admin-moderation-design.md` (Fazlar + §D1 + veri modeli)
3. `docs/superpowers/specs/2026-07-26-admin-platform-health-analytics-design.md` §C1-C3
4. `docs/superpowers/specs/2026-07-27-admin-design-handoff-implementation.md` §2 (modül 4, 9, 10 uyarlamaları)
5. Handoff ekranları: `design_handoff/design_handoff_admin_panel/screenshots/04-moderasyon.png`, `09-sistem-durumu.png`, `10-ayarlar.png`

## Bağlayıcı kurallar

- **Commit atma.**
- D1 şemasında `subjectId` **`SetNull`** + `subjectHandle` kopyası — cascade YASAK (konu hesabını silen kaydı yok edemez; test 7 bunu sabitler).
- Ban aksiyonu **mevcut** `setAdminUserBanState` üzerinden — yeniden yazma yok.
- Üstlenme koşullu güncelleme (`updateMany where assigneeId: null`) — son yazan kazanmaz.
- "Mesaj sil" aksiyonu D1'de YOK (vaka mesaj taşımıyor).
- Handoff uyarlamaları: "Oto. engellenen" → "Çözülen (7g)"; servis-uptime kartları YOK (C1 platform kartları); "Tehlikeli Bölge" render edilmez.
- Sağlık/telemetri ekranlarında **"teslim" kelimesi yasak** — etiket "Expo kabul oranı" (metin sözleşme testi).
- C1 ingest: `clientType` gövdeden değil **başlıktan** (A sözleşmesi); batch 50 olay / 32 KB.
- C2 dağıtımı `userId` hash'iyle stabil; kapatma anında etkili + `feature-flags:changed` socket olayı.
- Yeni capability'ler: `case.read`, `case.action`, `flag.write`, `health.read` — W1 kapsama testi yeni rotaları otomatik yakalar, capability'siz rota bırakma.

## Doğrulama

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
pnpm --filter @wizards/mobile typecheck
```

```bash
pnpm --filter @wizards/mobile test
```

```bash
graphify update .
```

## Rapor formatı

- D1 bitti kanıtı: mobil rapor → kuyrukta görünüyor; ban → oturumlar düşüyor + audit satırında `ipHash` dolu; konu silinince vaka yaşıyor
- Backfill script çıktısı (kaç geçmiş rapor kaç vakaya toplandı)
- C2 kill-switch kanıtı: bayrak kapatıldı → bootstrap kapalı döndü + socket olayı yayınlandı
- C3: ticket satırı yazıldı, `DeviceNotRegistered` token temizliği tetiklendi
- Değişen dosyalar + sapmalar
