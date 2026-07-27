# RUN PROMPT — Admin Dalga 4: C4 Analitik + E2 Zamanlama + E3 Feedback Zekâsı

Whispr admin yeniden tasarımının 4. dalgası:

1. **C4:** Platform kırılımlı seriler + kohort/retention + kısıtlı funnel (`/admin/analytics`) + ses ekranı (`/admin/voice`).
2. **E2:** Kampanya zamanlama (mevcut outbox kuyruğu üstüne) + teslimat raporu ekranı.
3. **E3:** Geri bildirim kümeleme (öneri üretir, otomatik birleştirmez) + sürüm rozeti.

**Ön koşul:** Dalga 1-3 tamam (A boyutu ve `CampaignDelivery` olmadan bu dalga anlamsız).

## Okuma sırası

1. `docs/superpowers/plans/2026-07-27-admin-wave4-c4-e2-e3.md`
2. `docs/superpowers/specs/2026-07-26-admin-platform-health-analytics-design.md` §C4
3. `docs/superpowers/specs/2026-07-26-admin-campaigns-product-voice-design.md` §E2-E3
4. `docs/superpowers/specs/2026-07-27-admin-design-handoff-implementation.md` §2 (modül 7-8) + §4
5. Handoff: `screenshots/07-ses-gorusme.png`, `08-bildirimler.png`

## Bağlayıcı kurallar

- **Commit atma.**
- **`UNKNOWN` platform ayrı seri** — `WEB`'e katlanmaz; `attributionVerified=false` oturumlar `UNKNOWN` kovasında; grafik altına kalıcı not.
- **Funnel'ın ilk iki adımı** (kayıt, e-posta doğrulama) platforma göre kırılamaz — filtre uygulandığında toplam değeri döndürür, sessizce yanlış sayı üretmez; arayüzde "platform kırılımı yok" etiketi.
- **Ses ekranında MOS ve bölge gecikmesi YOK** (veri toplanmıyor); yerine platform kırılımı kartı.
- **E2 dondurma anı:** liste `campaign.send` job'ı **çalıştığında** donar, kampanya oluşturulduğunda değil. Yeni zamanlayıcı yazılmaz — mevcut outbox drain.
- **Kompozitör metin kuralları:** "sessiz saat" ifadesi geçmez; kanal chip'lerinden yalnızca "Uygulama içi" aktif (Push/E-posta disabled + ipucu). Geri alma / recall özelliği YOK — yalnızca gönderim öncesi iptal.
- Açılma oranı paydası `SENT` satır sayısı.
- **E3 kümeleme:** farklı `topic` asla birleşmez; operatör onayı olmadan hiçbir `Feedback.roadmapItemId` değişmez.
- Yeni ekranlar G kit primitifleriyle; hex yasağı sürer.

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
graphify update .
```

## Rapor formatı

- C4 kanıtı: `MOBILE` filtresi toplam seriden farklı sonuç veriyor (A çalışıyor); funnel ilk iki adım etiketli
- E2 kanıtı: yarına planlanan kampanya bugün gitmiyor; iptal edilen job drain'de atlanıyor; rapor sayıları (hedeflenen/gönderilen/frekans/hata/açılma) tutarlı
- E3 kanıtı: iki benzer geri bildirim tek öneri; kabul → kümedeki hepsi yol haritası maddesine bağlandı
- Değişen dosyalar + sapmalar
