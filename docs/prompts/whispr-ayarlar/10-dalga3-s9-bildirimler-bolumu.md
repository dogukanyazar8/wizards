# Dalga 3 · Ş9 — Bildirimler bölümü (7 sekme · 50 satır · 2 özel blok)

**Ön koşul:** Dalga 2 kapısı yeşil. **Paralel:** Ş7, Ş8, Ş10.

Referans kare: `screens/05-bildirimler-turler.png`. Otorite `.dc.html` `SET[3]` dalı.

**Gelişmiş bildirim ayarları ayrı pencere değildir** — bu 7 sekmede yaşar. En kalabalık bölüm
(50 satır) ve **paylaşılan anahtarların** tamamı burada.

Önce `00-ortak-baglam.md` okunur.

---

## Sahiplenilen dosyalar

- `apps/web/src/components/settings/sections/notifications/*.tsx` (7 sekme)
- `apps/web/src/components/settings/blocks/notif-summary-block.tsx` (yeni)
- `apps/web/src/components/settings/blocks/exceptions-block.tsx` (yeni)
- `apps/web/src/components/settings/notifications/sound-preview.ts` (yeni — önizleme çalar)
- `apps/web/public/sounds/call.mp3` + `call-whispr.mp3` (yeni varlık)
- Her biri için `.test.tsx`

**Okunur, yazılmaz:** `lib/settings/tree.ts`, satır motoru,
`lib/notifications/{prefs-service,prefs-policy}.ts` (Ş1), `lib/settings/exceptions-client.ts` (Ş4).

---

## Sekmeler

### 1. Genel

**Bildirim düzeyi** (not: `Ayrıntılar diğer sekmelerde; buradaki ayarlar onlarla aynı kaynağı
kullanır.`):

- `Hangi bildirimleri al` — `Tüm bildirimler` / `Yalnız DM ve bahsetmeler` / `Kapalı`.
  **560 px penceredeki radyo kartlarıyla aynı `level` anahtarını yazar**, farklı etiketle
  (sapma #6). Metinler birebir korunur.
- `Sistem bildirimleri` (`nd2`) — **paylaşılan**, Yüzeyler sekmesiyle aynı.
- `Sistem izni` (`na5`) — **paylaşılan**; `Engellendi` durumunda danger zemin +
  `Sistem ayarlarını aç` / `Kontrol et`.
- `Mesaj önizlemelerini göster` (`na6`) — **paylaşılan**.

**Ses ve sessiz saatler:**
`Bildirim sesi` (`ns1`, `snd` — **paylaşılan**, Sesler sekmesiyle aynı) ·
`Sessiz saatler` (`nq1` — **paylaşılan**) ·
`Sessiz saat aralığı` (`jump` → Sessiz saatler sekmesi).

### 2. Yüzeyler

**Şu anki durum** — üç kutulu özet bloğu (`Açık bildirim türü` · `Teslim kanalı` · `Aktif istisna`).
Üç sayı da **gerçek veriden** türetilir:

- Açık tür = 16 türden kaç tanesi açık (kilitli ikisi her zaman açık sayılır) → `9/15` yerine
  gerçek oran; payda **açılabilir tür sayısı** (14) + kilitli 2 = 16 üzerinden yazılır.
  Tasarımdaki `9/15` örnek veridir, sabitlenmez.
- Teslim kanalı = 4 kanaldan kaçı açık.
- Aktif istisna = `GET /users/me/notification-exceptions` uzunluğu (Ş4) — **ikinci sayaç kurulmaz**.

**Uygulama içi uyarılar** (not: `Bildirim merkezi bu kontrollerden bağımsız çalışır; kapatsan da
kayıt tutmaya devam eder.`): 3 anahtar (`na1`, `na2`, `na3`).

**Teslim kanalları** (not: `Web'de tarayıcı bildirimi, masaüstünde işletim sistemi bildirimi
olarak adlandırılır.`): `Uygulama içi` · `Sistem bildirimleri` (`nd2`, paylaşılan) ·
`Mobil push` · `E-posta` · `Mesaj önizlemelerini göster` (`na6`, paylaşılan) ·
`Sistem izni` (`na5`, paylaşılan).

Not metni çalışma zamanına göre değişmez — **tek metin**, iki platformu da açıklıyor.

### 3. Türler — 16 satır

| Grup                                                                                       | Satırlar                                                                                                                                        |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Mesajlar ve bahsetmeler                                                                    | Doğrudan mesajlar · Bana özel bahsetmeler · Rol bahsetmeleri · @herkes ve @burada · Thread yanıtları · Mesajıma verilen yanıtlar                |
| Çağrılar (not: `Sessiz saatlerde çağrıların davranışı Sessiz saatler sekmesinde seçilir.`) | Gelen sesli çağrılar · Sesli kanal davetleri                                                                                                    |
| Sosyal ve topluluk                                                                         | Arkadaşlık istekleri ve kabuller · Sunucu davetleri · Etkinlikler ve hatırlatmalar · Rozet kazanımları                                          |
| Sistem (not: `Kritik bildirimler kapatılamaz.`)                                            | **Güvenlik ve hesap bildirimleri (Kilitli)** · **Moderasyon bildirimleri (Kilitli)** · Sistem duyuruları · Ürün ve geri bildirim güncellemeleri |

Kilitli iki satır: açık + `cursor:not-allowed` + `opacity:.55` + `Kilitli` pili +
`aria-disabled` + açıklama. Tıklama **sunucuya istek atmaz** (Ş1 zaten 400 dönüyor, ama istemci
denemez).

`Rol bahsetmeleri` ve `@herkes ve @burada` ters mantıklı kolonlara yazar; çevirme
`prefs-service` içinde (tuzak #2) — bileşen düz mantık görür.

### 4. Sessiz saatler

Not: `Bu saatlerde isteğe bağlı bildirimler ve sesler durur. Bildirimler merkezde ve sayaçta
birikir; güvenlik bildirimleri etkilenmez.`

`Sessiz saatler` (`nq1`, paylaşılan) · `Başlangıç saati` · `Bitiş saati` · `Saat dilimi` ·
`Gelen çağrılara izin ver`.

Başlangıç/bitiş menüleri tasarımdaki 4'er seçenekle sınırlı **değil** — 24 saatin tamamı
yarım saatlik adımlarla listelenir; tasarımdaki liste örnek veridir. Varsayılan seçili değerler
`23:00` ve `08:00`.

`start > end` gece aşan aralıktır ve açıklama satırı bunu yazar (`Her gün 23:00 – 08:00`).

Saat dilimi boşsa hesabın saat diliminden, o da boşsa `Europe/Istanbul` (mevcut
`resolveQuietHoursTimeZone` sözleşmesi).

### 5. Sesler

**Genel** (not: `Ses ayarları bu cihaza kaydedilir.`) — ama K3 gereği **sunucuda** saklanır;
notu tasarımdan geldiği için değiştirmiyoruz, ancak `SPEC_DEVIATIONS`'a **10. kayıt** olarak
eklenir: _"'bu cihaza kaydedilir' notu ile K3 (sunucu saklama) çelişiyor; metin korunur, davranış
sunucu tarafındadır."_

4 ses satırı (`snd`): `Bildirim sesi` (`ns1`, paylaşılan) · `Gelen çağrı sesi` ·
`Kanala giriş sesi` · `Kanaldan çıkış sesi`. Her biri anahtar + `Whispr`/`Klasik` profili +
seviye + `Önizle`. Altında `Tüm sesler → Varsayılana döndür`.

Varlık eşlemesi:

| Satır          | Whispr                       | Klasik                |
| -------------- | ---------------------------- | --------------------- |
| Bildirim       | `notification-whispr.mp3`    | `notification.mp3`    |
| Gelen çağrı    | `call-whispr.mp3` **(yeni)** | `call.mp3` **(yeni)** |
| Kanala giriş   | `voice-join-whispr.mp3`      | `voice-join.mp3`      |
| Kanaldan çıkış | `voice-leave-whispr.mp3`     | `voice-leave.mp3`     |

`Önizle` seçili profili ve seviyeyi **gerçekten** çalar; aynı anda tek önizleme, yenisi eskisini
keser. Ses kapalıysa `Önizle` yine çalar (kullanıcı ne seçtiğini duymalı) ama bunu açıklamaz.

### 6. Panel

Not: `Otomatik kapanma kapalıysa süre seçimi devre dışı kalır.`

`Gösterilecek bildirim sayısı` (3–6 segment) · `Paneli otomatik kapat` ·
`Görünme süresi` (5/10/15/20/30 sn segment — `Paneli otomatik kapat` kapalıyken `disabled`) ·
`Mesaj içeriğini göster` (`np4`) · `Gönderen, sunucu ve kanal bilgisini göster`.

**`np4` `na6`'dan ayrıdır** (tuzak #4): `np4` uygulama içi açılır kartın içeriği,
`na6` sistem bildiriminin içeriği. İkisi ayrı anahtar, ayrı satır, ayrı açıklama.
Bu ayrımın regresyon testi zorunlu.

### 7. İstisnalar

**Aktif istisnalar** (not: `Bu sunucu, kanal ve konuşmalar genel tercihlerden farklı davranır.`) —
`exceptions-block`: her satırda ikon + ad + `Kapsam · Düzey` + sessize alma bitişi + `Düzenle` +
kaldır. Veri `GET /users/me/notification-exceptions` (Ş4); yazma `updateException` üzerinden.

Liste **boşsa** grup boş durum metni yazar; uydurma satır çizilmez.
`truncated` geldiğinde altta `+{n} daha` satırı.

**Varsayılanlar** (yeni grup, sapma #9): `Yeni istisnalar için geçici sessize alma`
(1 saat / 8 saat / 24 saat / Ben açana kadar). Metin değişmez, yalnız grup değişir.

---

## Kabul

- [ ] 7 sekme, 14 grup, 50 satır eksiksiz; sayım `tree.ts` ile uyuşuyor.
- [ ] 5 paylaşılan anahtar (`nd2`, `na5`, `na6`, `nq1`, `ns1`) iki sekmede **aynı** değeri
      gösteriyor; birinde değişince diğeri anında hizalanıyor.
- [ ] `np4` ile `na6` **ayrı**: `np4` değişince `na6` değişmiyor (regresyon testi).
- [ ] Genel'deki düzey menüsü ile 560 px penceredeki radyo kartları aynı `level` anahtarını
      yazıyor; etiket metinleri **birebir farklı** ve ikisi de korunmuş.
- [ ] Kilitli iki satır tıklanamıyor, `aria-disabled` taşıyor, **sunucuya istek atmıyor**.
- [ ] Ters mantıklı iki tür bileşende düz mantık gösteriyor; kapatınca kolon `true` oluyor.
- [ ] Özet kutusundaki üç sayı gerçek veriden; istisna sayısı Ş4 ucunun uzunluğu.
- [ ] Sessiz saat menüleri 24 saati yarım saatlik adımlarla listeliyor; varsayılan `23:00`/`08:00`.
- [ ] Gece aşan aralık (`23:00 – 08:00`) açıklamada doğru yazılıyor.
- [ ] 4 ses satırı da çalıyor; çağrı sesi varlıkları eklendi; aynı anda tek önizleme.
- [ ] `Varsayılana döndür` dört satırı da sıfırlıyor.
- [ ] `Paneli otomatik kapat` kapalıyken `Görünme süresi` `disabled`.
- [ ] İstisna listesi boşken boş durum metni; `truncated` geldiğinde `+{n} daha`.
- [ ] `ne1` kendi grubunda; metni değişmemiş (sapma #9).
- [ ] `SPEC_DEVIATIONS` 10. kayıt eklendi ("bu cihaza kaydedilir" ↔ K3).
- [ ] Açık ve koyu temada `screens/05-bildirimler-turler.png` ile karşılaştırma yapıldı.

## Kapı

```
pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
```

Rapor: `docs/prompts/whispr-ayarlar/raporlar/10-s9-rapor.md`
