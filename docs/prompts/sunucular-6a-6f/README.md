# Sunucular 6a–6f — run-prompt paketi

Whispr mobil **Sunucular** bölümünün v2 hâli: uzun sunucu adı çözümü, kategori `+` kaldırma, sunucu "⋯" menüsü ve baştan tasarlanan sunucu profili.

Tasarım kaynağı: `design_handoff/design_handoff_sunucular/Whispr Sunucular Redesign.dc.html` **satır 30–370** (`section#t6`), eşlik eden metin `PROMPT.md §6` (satır 286–457), ekran görüntüleri `screenshots/6a…6f-*.png`.

## Dosyalar

| Dosya                                  | Kapsam                                                                                                                                                       | Ön koşul |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| `00-ortak-baglam.md`                   | Kurallar, doğrulanmış gerçekler, yüzey haritası, tuzaklar, alınmış kararlar. **Uygulanmaz, okunur.**                                                         | —        |
| `01-faz1-veri-katmani.md`              | DB migration (`Server.tags`, `UserServerSettings.starred`), `ServerPublicProfile` genişletmesi, `ScheduledEvent` canlandırma, tercih yazma ucu, web paritesi | —        |
| `02-faz2-mobil-temel-katman.md`        | `theme.workspace` + `theme.serverProfile` token grupları, kopya, saf model, filtre kalıcılığı, istemci/query                                                 | 01       |
| `03-faz3-6a-6b-6f-sunucular-ekrani.md` | 6a sol rail, 6b compakt, 6f uzun ad standardı; beş header butonu → iki; kategori `+` silinir; filtre şeridi; etiketli FAB                                    | 02       |
| `04-faz4-6c-sunucu-menusu.md`          | 6c "⋯" sheet, hızlı aksiyon dörtlüsü, sessize al / yıldızla / bildirim seviyesi, ayrılma, mobil etiket düzenleyici                                           | 03       |
| `05-faz5-6d-6e-sunucu-profili.md`      | 6d/6e profil, tek gövde iki rota, etkinlik yönetimi, eski gövde silme, paket kabul kriterleri                                                                | 04       |

Sıra **zorunludur**. Her faz bir öncekinin sözleşmesine dayanır.

## Nasıl koşulur

Her prompt tek geçişte uygulanabilir bir dilimdir. Alt görevlere bölüp görev başına ayrı ajan turu açma.

```
1. 00-ortak-baglam.md oku
2. Faz dosyasını oku
3. Uygula (test önce)
4. Fazın kapı komutlarını koş
5. docs/prompts/sunucular-6a-6f/raporlar/<no>-rapor.md yaz
6. Commit için izin iste — kendiliğinden commit yok
```

## Çalışma koşulları

- Branch **`uat`**
- caveman **ultra** modu
- Kararsız kalınan yerde **kullanıcıya sorulur**, tahmin edilmez
- **Gerçek cihaz testlerini kullanıcı yapar** — her faz sonunda cihaz test listesi üretilir

## Alınmış kararlar (2026-08-10)

| Konu                 | Karar                                                                            |
| -------------------- | -------------------------------------------------------------------------------- |
| 6d yaklaşan etkinlik | Tam etkinlik özelliği — `ScheduledEvent` CRUD + ilgi + admin yüzeyi + mobil form |
| 6d etiketler         | Yeni `Server.tags String[]` + ayarlarda düzenleme + keşif aramasına bağlama      |
| 6c "Yıldızla"        | `UserServerSettings.starred` DB kolonu + PATCH ucu + web paritesi                |
| 6d/6e kapsamı        | Tek gövde, iki rota (`ServerProfile` + `CommunityInvite`); eski gövde silinir    |

## Bu paket neden var

Bölüm 6, Bölüm 1a/1b'nin başlık düzenini ve kategori satırını geçersiz kılıyor — yani mevcut ekranın **silinecek** parçaları var, sadece eklenecek değil. Üstelik 6d/6e bugün var olmayan yedi veri parçası istiyor (davet adresi, etiketler, haftalık mesaj sayısı, kategorili kanal listesi, yönetici listesi, katılım/erişim bilgisi, yaklaşan etkinlik) ve `ScheduledEvent` şemada durup `apps/` içinde hiç kullanılmıyor.

Bunlar ekran yazılırken keşfedilseydi her faz üç tura çıkardı — önceki paketlerin ders çıkardığı hata bu. Burada tüm veri işi Faz 1'de, tüm ortak katman Faz 2'de kapanıyor; üç ekran fazı yalnız render ediyor.

## Durum

Paket yazıldı, **hiçbir faz uygulanmadı** (2026-08-10).
