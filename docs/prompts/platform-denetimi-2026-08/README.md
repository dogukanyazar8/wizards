# Whispr platform denetimi — run-prompt paketi (2026-08)

Whispr'ın **web + desktop + mobil** yüzeylerinin uçtan uca teknik denetimi: mimari, performans, güvenlik, test kapsamı, kod kalitesi, UI/işlevsel hata avı, ölçeklenme ve Discord/Slack/Zoom seviyesine parite analizi. Çıktı: makine okunur bulgu dosyaları + tek dosyalık etkileşimli HTML rapor + uygulama/geliştirme yol haritası.

**Temel alınan commit:** `5a2b3990733b17672cf65fba631b7ec44a7bf96a` (`uat`, 2026-08-07 17:24 +0300, `fix(security): patch js-yaml audit`)
**Bilgi grafiği:** Kök `graphify-out/` aktif UAT çalışma ağacını izler; temel commit grafiği olarak kullanılamaz. Denetimde temel worktree içinde grafiği üret, `built_at_commit` değerini rapora kaydet ve kök grafiğiyle karıştırma.

Bu paket **salt okunurdur.** Hiçbir prompt üretim kodunu değiştirmez. Tek yazılan yerler: `docs/prompts/platform-denetimi-2026-08/raporlar/` ve `docs/reports/`.

---

## Dosyalar

| Dosya                             | Eksen | Kapsam                                                                           | Ön koşul |
| --------------------------------- | ----- | -------------------------------------------------------------------------------- | -------- |
| `00-ortak-baglam.md`              | —     | Kurallar, doğrulanmış gerçekler, bulgu şeması, puanlama. **Uygulanmaz, okunur.** | —        |
| `01-A1-mimari.md`                 | A1    | Modül sınırları, bağımlılık yönü, katman ihlalleri, sözleşme bütünlüğü           | 00       |
| `02-A2-performans.md`             | A2    | Sunucu, veritabanı, gerçek zaman, web istemci, mobil, desktop kabuk              | 00       |
| `03-A3-guvenlik.md`               | A3    | Kimlik/yetki, 228 API rotası, socket, yükleme, sır yönetimi, Tauri IPC           | 00       |
| `04-A4-test-ve-kalite.md`         | A4    | Test envanteri, kapsam boşlukları, kapı gücü, kırılganlık, lint/tip disiplini    | 00       |
| `05-A5-hata-avi.md`               | A5    | Somut kod hataları + UI/işlevsel kusurlar, üç yüzeyde                            | 00       |
| `06-A6-olceklenme-ve-parite.md`   | A6    | Kapasite modeli, fan-out, veri büyümesi, maliyet + Discord/Slack/Zoom paritesi   | 00       |
| `07-A7-sentez-ve-yol-haritasi.md` | A7    | Bulguların birleşimi, önceliklendirme, uygulama + geliştirme planı               | A1–A6    |
| `08-A8-html-rapor.md`             | A8    | Tek dosyalık, bağımlılıksız, etkileşimli, minimal HTML rapor                     | A7       |

`A1`–`A6` **birbirinden bağımsızdır** ve paralel koşabilir; her biri kendi çıktı dosyasına yazar, çakışma yoktur. `A7` altısını da bekler. `A8` `A7`'yi bekler.

## Nasıl koşulur

```
1. 00-ortak-baglam.md oku (her prompt için bir kez).
2. Temel ağacı kur (00 §1.2) — kirli çalışma ağacı bulguyu kirletmesin.
3. Temel worktree içinde `graphify update .` koş; çıkan `built_at_commit` değerini kaydet.
4. Eksen promptunu oku, tek geçişte uygula.
5. raporlar/<eksen>.findings.json + raporlar/<eksen>-rapor.md yaz.
6. Promptun kapı komutlarını koş, sonucu rapora yapıştır.
```

Tek girişten başlatmak için:

```bash
cat docs/prompts/platform-denetimi-2026-08/00-ortak-baglam.md docs/prompts/platform-denetimi-2026-08/01-A1-mimari.md
```

## Bu paket neden var

Repodaki önceki denetimler (`docs/prompts/audit.md`, `docs/reports/react-compiler-eslint10-performance.md`) tek seferlik ve yüzeyseldi: kontrol listesi üretti, kanıtlı bulgu üretmedi. Bu pakette her bulgu `file:line` + başarısızlık senaryosu + çürütme denemesi taşımak zorunda; taşımayan bulgu rapora girmez. Böylece HTML rapor "iyi uygulamalar listesi" değil, **doğrulanmış kusur envanteri** olur.

İkinci sebep: kapsam. 228 API rotası, 69 Prisma modeli, ~205k satır web + ~143k satır mobil kaynak tek bağlama sığmaz. Eksen bölümü kapsamı bölerken kanıt formatını sabit tutar; `A7` birleştirmeyi mekanik hale getirir.

## Çıktı düzeni

```
docs/prompts/platform-denetimi-2026-08/raporlar/
  A1.findings.json   A1-rapor.md
  A2.findings.json   A2-rapor.md
  A3.findings.json   A3-rapor.md
  A4.findings.json   A4-rapor.md
  A5.findings.json   A5-rapor.md
  A6.findings.json   A6-rapor.md
  A7-yol-haritasi.md  A7.roadmap.json
docs/reports/
  whispr-platform-denetimi-2026-08.html
```
