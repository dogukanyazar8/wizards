# 09 — Doğrulama ve kabul

Her dalga bittiğinde koşulur. Bu dosya **uygulanmaz**; kontrol listesidir.

---

## 1. Komut seti (her dalga sonunda tamamı)

```bash
pnpm --filter @wizards/types test
```

```bash
pnpm --filter @wizards/web typecheck
```

```bash
pnpm --filter @wizards/mobile typecheck
```

`apps/web` içinden:

```bash
node --test --import tsx "src/lib/badges/*.test.ts"
```

`apps/mobile` içinden:

```bash
npx jest component-tests
```

Migration eklendiği dalgada (W1):

```bash
pnpm --filter @wizards/db exec prisma generate
```

**Kural:** bir dalga, önceki dalganın testleri de yeşilken kapanır. "Sonra düzeltiriz"
yok — kırmızı test bırakan dalga kapanmamıştır.

---

## 2. Senkronluk kontrol listesi (kullanıcının asıl şartı)

Her madde bir testle veya bir yapı kararıyla garanti altında olmalı; "dikkat ederiz"
kabul edilmez.

| #   | Kontrol                                      | Nasıl garanti edilir                                                                     |
| --- | -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | Mobil ve web **aynı rozet listesini** alıyor | Tek `handleReadUserBadges`, iki ince rota (03 §1)                                        |
| 2   | Kartta **aynı üç rozet aynı sırada**         | Tek `splitBadgesForCard` + `sortBadges` (`@wizards/types`)                               |
| 3   | Rozet **adı ve açıklaması** aynı             | Metin katalogda, iki sözlükte değil (00 §5)                                              |
| 4   | Kademe eşikleri aynı                         | Eşikler katalogda; değerlendirici sabit yazmıyor (01 §1)                                 |
| 5   | İki platform aynı anda tazeleniyor           | Aynı `staleTime` (5 dk) + aynı invalidate kuralı (03 §3–4, 07 §4)                        |
| 6   | İlerleme sayısı aynı biçimde                 | `formatBadgeProgressValue` ortak (06 §5)                                                 |
| 7   | Rozet ikonu aynı rozeti gösteriyor           | `Record<BadgeId, …>` lucide eşlemesi — eksik ikon derlenmiyor (05 §1)                    |
| 8   | Renkler aynı                                 | Tint tablosu tek kaynak; web CSS değişkenleri mobil palette değerleriyle birebir (05 §1) |
| 9   | Desktop web'den sapmıyor                     | `apps/desktop` altında sıfır değişiklik                                                  |

---

## 3. Regresyon riskleri — her dalgada kontrol edilecek

1. **Eski istemci kırılması.** `packages/types/src/mobile-social.ts` hiçbir dalgada
   diff'te görünmemeli. Görünüyorsa dalga reddedilir (00 §2).
2. **Profil açılış gecikmesi.** W1'de profil okumasından bir sorgu **çıktı**
   (invite count). W2'de kart açılışına bir sorgu **eklendi** (rozetler, paralel).
   Net etki nötr olmalı; kart açılış ölçümü W2 sonrası bozulmuşsa rozet sorgusu
   prefetch'e alınır.
3. **Layout zıplaması.** Rozet satırı yüklenirken 28px yer tutuyor mu (mobil kart,
   mobil sayfa, web popover üçü de).
4. **Tema sözleşme testi.** `mobile-redesign-theme-contract.test.ts` — eski
   `profileCard.badge*` anahtarları alias olarak korunmalı.
5. **Copy parity.** `mobile-copy-parity.test.ts` — silinen altı anahtarın iki dilden
   de silindiği.
6. **Derin bağlantı.** `mobile-deep-link-contract.test.ts` — W3'te beş dosya birlikte
   güncellendi mi.
7. **Bildirim seli.** Backfill `notify: false` ile koşuyor mu (07 §4).
8. **Sweep maliyeti.** Saatlik iş tüm kullanıcıları taramıyor (02 §5 test 17).

---

## 4. Cihaz testi betiği (kullanıcı koşacak)

Kod tarafı bunları iddia etmez; kullanıcı doğrular.

### Mobil (Android UAT build)

1. Rozeti olan bir kullanıcının avatarına kanal sohbetinden dokun → 1a kartı açılır,
   chip satırı avatar hizasında, chip'ler 28×28.
2. Aynı kartı **yavaş ağda** aç → chip satırı yer tutuyor, kart yüksekliği zıplamıyor.
3. "Profili görüntüle" → 1c sayfasında **aynı** chip'ler, aynı sırada.
4. 4+ rozeti olan kullanıcıda `+N` chip'i görünüyor; dokununca tüm liste açılıyor.
5. Bir chip'e dokun → detay sheet'i açılır, kart kapanmaz. Başkasının profilinde
   **ilerleme çubuğu yok**.
6. Kendi profilinde `+N` → "Rozetlerim" ekranı; kazanılan/kilitli ayrımı doğru.
7. Koyu temaya geç → 1e/1f referanslarıyla chip renkleri örtüşüyor.
8. Arayüz metin boyutunu büyüt → `+N` metni okunur kalıyor, chip taşmıyor.
9. Engellenmiş bir kullanıcının kartını aç → chip satırı **hiç yok**.
10. Rozet kazandıran bir eylem yap (bir davetin kullanılması en kolayı) → bildirim
    geliyor, dokununca "Rozetlerim" açılıyor, rozet **anında** görünüyor.

### Web (tarayıcı)

11. Mobilde 1–4 arası maddeleri tekrarla → popover'da **aynı üç rozet aynı sırada**.
12. Popover'da chip'e tıkla → panel rozet detayına geçiyor, geri butonu çalışıyor.
13. Dar pencerede chip satırı ada alta iniyor, chip'ler küçülmüyor.
14. Koyu tema.

### Desktop (Tauri)

15. Web'deki 11–14 maddelerini desktop penceresinde tekrarla. **Fark çıkarsa bu bir
    hatadır** — desktop web'i yüklüyor, sapma olmamalı.

### Çapraz kontrol

16. Aynı hesapla mobil + web açık; birinde rozet kazan → diğerinde en geç 5 dakikada
    (veya bildirim geldiğinde anında) aynı rozet görünüyor.
17. İki farklı hesapla aynı üçüncü kullanıcının profiline bak → **aynı rozetleri**
    görüyorlar.

---

## 5. Dalga kapanış kriterleri

| dalga | kapanış                                                                                                                                              |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1    | Tüm testler yeşil **ve** uygulamada hiçbir görsel değişiklik yok. Backfill `--dry-run` dağılım tablosu üretildi ve eşikler bu tabloyla teyit edildi. |
| W2    | Mobil + web chip satırları çalışıyor, §2 listesinin 1–9'u garanti altında, cihaz testi 1–9 + 11–15 geçti.                                            |
| W3    | Detay + Rozetlerim + bildirim çalışıyor, cihaz testi 5–6, 10, 16–17 geçti.                                                                           |
| W4    | Admin grant/iptal audit log'lu çalışıyor, AWARDED rozet elle verilemiyor, nadirlik ucu ayakta.                                                       |

---

## 6. Bilinen ve kabul edilmiş eksikler

Bunlar hata değildir, kayda geçmiştir:

- `supporter` rozetini kimse kazanamaz — faturalandırma akışı yok (00 §2).
- `veteran` yıl dönümü bildirim üretmez (DERIVED katmanın satırı yok, 07 §4).
- Günde 60 saniyeyi tek oturumda doldurmayan kullanıcı o günü `streak` için
  kaybedebilir (02 §2).
- Profil payload'ındaki `badges` alanı ölü ama duruyor; kaldırma koşulu 08 §5.
- Nadirlik yüzdesi 500 kullanıcı altında gösterilmez (08 §4).
