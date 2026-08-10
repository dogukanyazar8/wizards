# A7 — Sentez, önceliklendirme ve yol haritası

Temel commit: `5a2b3990733b17672cf65fba631b7ec44a7bf96a` · Tarih: 2026-08-08
Kanonik veri: [`A7.roadmap.json`](A7.roadmap.json)

## Girdi

| Eksen           | Bulgu  |
| --------------- | ------ |
| A1 Mimari       | 7      |
| A2 Performans   | 5      |
| A3 Güvenlik     | 2      |
| A4 Test/kalite  | 3      |
| A5 Hata avı     | 2      |
| A6 Ölçek/parite | 4      |
| **Toplam**      | **23** |

**23 bulgu → 22 iş kalemi.** Bulguların tamamı bir kaleme bağlandı (`kapsanan bulgu 23/23`).

Şiddet dağılımı: critical **0** · high 6 · medium 14 · low 3.

## Tekilleştirme

Tek birleştirme yapıldı:

| Kalem | Kaynak bulgular     | Gerekçe                                                                                                                                                                                                     |
| ----- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-014 | `A1-003` + `A5-002` | Aynı kök neden. A1-003 "paylaşılan alan katmanı yok" der; A5-002 aynı kuralın (mesaj gruplama) iki yerde ayrışmış hâlidir — yani A5-002, A1-003'ün davranış düzeyindeki kanıtı. Tek fix ikisini de kapatır. |

Diğer 21 bulgu 1:1 kaleme dönüştü. Birleştirilmeyen yakın çiftler ve nedenleri:

- `A1-002` (socket sözleşmesi) ↔ `A1-003` (alan katmanı): ikisi de "paylaşım eksikliği" ama fix'ler farklı — biri tip haritalarını taşır, diğeri saf kuralları. Ayrı tutuldu, aralarına bağımlılık kenarı kondu.
- `A2-001` (fetchSockets) ↔ `A6-001` (unread COUNT): aynı sıcak yol, farklı katman. Ayrı tutuldu, kenar kondu.
- `A1-004` (sınır zorlaması yok) ↔ `A3-002` (yetkilendirme zorlanmıyor): ayrı fix, kenar kondu.

## Puanlama

`00 §6` formülü, elle dokunulmadı:

```
score = round( severityWeight × confidenceFactor × riskPenalty × reachFactor / effortCost )
severity: critical 100 · high 60 · medium 25 · low 8
confidence: confirmed 1.0 · probable 0.7
effort: S 1 · M 3 · L 8 · XL 20
risk: low 1.0 · med 0.85 · high 0.7
reach: platform sayısı 1→1.0, 2→1.15, 3→1.3, 4→1.4
```

**Puan sıra verir, dalga vermez.** Dalga anlamı `00 §6`'daki tanımdan gelir (W0 = güvenlik/veri bütünlüğü, W1 = ölçülmüş kayıp/kapı, W2 = yapısal, W3 = parite); puan yalnız dalga _içi_ sıralamayı belirler. İlk denemede puanı dalgaya eşleyen bir bant kullanıldı ve yanlış sonuç verdi — L eforlu yapısal işlerin hepsi W3'e düştü, W2 boş kaldı. Düzeltildi.

Elle müdahale: **yok.** `critical` yok, kapasite taşması yok (`ertelenen 0`).

## Dalgalar

### W0 — Kapıyı yeşile döndür (0–2 hafta, **3 efor birimi**)

| Puan | Kalem                                  | Efor/Risk | Sahip   | Kaynak |
| ---- | -------------------------------------- | --------- | ------- | ------ |
| 69   | R-001 Bağımlılık advisory'lerini kapat | S/low     | infra   | A3-001 |
| 69   | R-002 Ölü migration dizinini kaldır    | S/low     | backend | A1-001 |
| 29   | R-003 `@wizards/db` testini CI'ya ekle | S/low     | infra   | A4-003 |

**Çıkış kapısı:** `pnpm audit` sıfır bulgu · `ci.yml` içinde db test adımı · `prisma/migrations/` altında `migration.sql` kalmadı.

Üçü de S eforlu ve düşük riskli. W0 kapasitesi 25 birim; 3 kullanıldı — bu dalga bir sprintten kısa.

### W1 — Ölçülmüş kayıpları ve kapı zafiyetlerini kapat (2–6 hafta, **16 birim**)

| Puan | Kalem                                     | Efor/Risk | Sahip   | Kaynak |
| ---- | ----------------------------------------- | --------- | ------- | ------ |
| 29   | R-010 Outbox yoklayıcısını bayrağa bağla  | S/low     | infra   | A2-005 |
| 26   | R-006 Kapsam eşiği ekle                   | M/low     | infra   | A4-001 |
| 25   | R-008 İletme/davet `clientNonce`          | S/low     | mobile  | A5-001 |
| 25   | R-009 Medya oturumu toplu yazma           | S/low     | backend | A2-004 |
| 25   | R-011 Ölü modelleri karara bağla          | S/low     | backend | A6-002 |
| 20   | R-004 Veri dışa aktarmayı sayfala         | M/low     | backend | A2-002 |
| 17   | R-005 `fetchSockets` yerine Redis kümesi  | M/med     | backend | A2-001 |
| 8    | R-007 11 rotayı route-logic desenine taşı | M/low     | backend | A1-005 |

### W2 — Yapısal sınırları kur (6–16 hafta, **54 birim**)

| Puan | Kalem                                                     | Efor/Risk | Sahip   | Kaynak          |
| ---- | --------------------------------------------------------- | --------- | ------- | --------------- |
| 10   | R-012 eslint katman kuralları                             | M/low     | web     | A1-004          |
| 9    | R-013 Socket olay haritalarını `packages/types`'a taşı    | M/med     | backend | A1-002          |
| 7    | R-014 Paylaşılan alan kuralları katmanı                   | L/med     | web     | A1-003 + A5-002 |
| 6    | R-019 Okunmamış sayacını yazma tarafına al                | L/high    | backend | A6-001          |
| 3    | R-015 Markalı `AccessContext` ile yetkilendirme zorlaması | L/med     | backend | A3-002          |
| 3    | R-016 Rota gövdesi testleri (15–20 rota)                  | L/low     | backend | A4-002          |
| 3    | R-017 Web mesaj listesi pencereli render                  | L/med     | web     | A2-003          |
| 3    | R-018 God node'ları sorumluluk ekseninde böl              | L/med     | web     | A1-006          |

### W3 — Parite (16 hafta+, **43 birim**)

| Puan | Kalem                            | Efor/Risk | Sahip   | Kaynak |
| ---- | -------------------------------- | --------- | ------- | ------ |
| 3    | R-022 Anahtar kelime bildirimi   | M/low     | backend | A6-004 |
| 1    | R-020 `User` modelini böl        | XL/high   | backend | A1-007 |
| 1    | R-021 Kurumsal kimlik (SSO/SCIM) | XL/high   | backend | A6-003 |

## Bağımlılık grafiği

7 kenar, döngü yok, dalga sırası ihlali yok.

```
R-003 → R-002   db testleri kapıda olmadan ölü dizini kaldırmak korumasız
R-006 → R-016   eşik önce konur, sonra kapsam yükseltilir
R-007 → R-016   rotalar route-logic'e geçmeden gövde testi yazılamaz
R-005 → R-019   aynı sıcak yol; ucuz düzeltme önce, yapısal değişiklik üstüne
R-012 → R-015   lint zorlama altyapısı önce
R-013 → R-014   sözleşme katmanı önce, alan kuralları yanına
R-011 → R-021   ölü Webhook modeli kalkmadan genişletilebilirlik tasarlanamaz
```

## Geliştirme planı

Yedi alan, her biri **bugün → hedef → ilk adım**. Tamamı `A7.roadmap.json` → `devPlan`.

| Alan                        | Bugün                                                                                           | İlk adım                                                               |
| --------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| CI kapıları                 | 9 iş koşuyor ama db testi yok, kapsam eşiği yok, `pnpm audit` kırmızı                           | R-003 + R-006, sonra R-001                                             |
| Test disiplini              | 2072+1669 test, 0 skip, %5,4 zayıf iddia — ama rota gövdeleri hiç çalıştırılmıyor               | R-016'nın ilk beş rotası, desen şablonlaşsın                           |
| Sözleşme disiplini          | Payload tipleri `packages/types`'ta, olay haritaları `apps/web`'de, alan kuralları hiçbir yerde | R-013 → R-014                                                          |
| Ölçüm döngüsü               | Telemetri altyapısı var, sıcak yol eşiği yok; bu denetimde hiçbir sıcak yol süresi ölçülemedi   | A2'nin dört ölçümünü bir kez koş, taban kaydet                         |
| Sınırların araca bağlanması | Sınırlar yalnız gelenekle                                                                       | R-012 → R-015                                                          |
| Sürüm ritmi / veri katmanı  | Tek migration yolu ama ölü dizin tuzağı; db testleri kapıda değil                               | R-003 → R-002; iki aşamalı desen R-019/R-020'de                        |
| Borç kaydı                  | 40+ açık soru yalnız raporlarda                                                                 | Tek listede topla; **A3 ve A5'in ikinci turlarını W1'e iş olarak koy** |

## Bu planın kabul ettiği borç

Denetimin kendisi eksik kaldı ve bu plan onu gizlemiyor:

- **A5** 40 hücrelik akış × durum matrisinin 6'sını doldurdu. UI kusur sınıfları (klavye, kaydırma, erişilebilirlik, uzun içerik, tarih/saat, Unicode) hiç taranmadı.
- **A3** kimlik yüzeyinin 62 dosyasından 8'ini okudu. Parola sıfırlama, oturum iptali, reauth, TOTP tam akışı okunmadı. `cargo audit` koşulmadı.
- **A2** en ağır 15 web bileşeninin 11'ini açmadı; bundle boyutu ve mobil soğuk açılış ölçülmedi.
- **A6** gerçek satır sayılarına ulaşamadı (UAT'ye dışarıdan bağlanılamıyor).

Bu dört kalem yol haritasına **iş olarak** girmedi çünkü bulgu değil eksik denetim. Borç kaydı maddesi bunları W1'e taşımayı ilk adım olarak yazıyor.

## Kapı sonucu

```
kalem 22  kopuk kenar 0  eksik alan 0  W0 disi critical 0  kaynaksiz 0
dongu yok
dalga sirasi ihlali 0
kapsanan bulgu 23 / 23
W0 3 birim · W1 16 · W2 54 · W3 43 · ertelenen 0
```
