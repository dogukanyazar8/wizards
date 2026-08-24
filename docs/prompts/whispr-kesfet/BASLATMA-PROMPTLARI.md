# Başlatma promptları — Whispr Keşfet

Her şerit için kopyala-yapıştır metin. Sırayı bozma: **Dalga 0 tek başına koşar**, kapısı yeşil
olmadan Dalga 1 ve 2 başlamaz.

Ortak kural — her promptun başına şu blok eklenir:

```
Depo: C:\Users\doguk\Desktop\Wizards   Dal: uat
Önce oku (sırayla, atlama):
  docs/prompts/whispr-kesfet/README.md
  docs/prompts/whispr-kesfet/00-ortak-baglam.md
  design_handoff/kesfet-paketi/PROMPT.md
  design_handoff/kesfet-paketi/SPEC-KESFET.md
  design_handoff/kesfet-paketi/SPEC-ANA-SAYFA.md  (§1 ve §8)
Ölçüde şüphe: design_handoff/kesfet-paketi/referans/Kesfet-5B.dc.html içindeki inline style
değeri nihai otoritedir. Tahmin etme, oku.
Commit etme. Sol taraf (74 ray + 228 nav + kullanıcı barı) dokunulmaz.
Doğrulama: pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint &&
           pnpm --filter @wizards/web test
```

---

## Dalga 0 · Ş0 — sözleşme

```
Görev dosyası: docs/prompts/whispr-kesfet/01-dalga0-sozlesme.md — tamamını uygula.

Dört iş: (1) lib/discover/metrics.ts ölçü sözlüğü, dc.html'den birebir okunarak;
(2) Prisma migration: ServerCategory enum + Server.category + Server.languages +
DiscoverChannelActivity tablosu + indeksler, rebaseline-migrations altına;
(3) packages/types/src/discover-screen.ts zod sözleşmeleri + workspace.ts genişletmesi +
lib/discover/{routes,identity,contracts}.ts; (4) i18n discover.* sözlüğü (TR birebir SPEC §10 +
dosyada listelenen ek anahtarlar) + discover-screen-copy.test.ts.

Ekran çizme. Bileşen yazma. Migration'ı yerel DB'de koştur ve çıktısını rapora yaz.
ServerPublicProfile genişlemesi tip hatası bırakırsa üreteci geçici doldur ve TODO(Ş3): bırak.
Rapor: docs/prompts/whispr-kesfet/raporlar/01-dalga0-rapor.md
```

---

## Dalga 1 · Ş1 — dizin API'si

```
Görev dosyası: docs/prompts/whispr-kesfet/02-dalga1-s1-dizin-api.md — tamamını uygula.
Ön koşul: Dalga 0 kapısı yeşil.

Tek uç: GET /api/v1/discover/servers. Kategori filtresi, üç sıralama, dört alanlı arama,
kategori sayaçları, öne çıkan sunucu, keyset sayfalama.

lib/servers/server-discovery-service.ts DEĞİŞTİRİLMEZ — ortak parçaları import et.
İmleç sıralama anahtarını taşımak zorunda (dosyanın §3'ü). online sıralaması Redis türevlidir,
§3.1'deki havuz kuralını uygula ve kesmeyi logla.
Sadece kendi dosyalarını değiştir (§Sahiplenilen dosyalar).
Rapor: raporlar/02-s1-rapor.md
```

---

## Dalga 1 · Ş2 — kişi + kanal

```
Görev dosyası: docs/prompts/whispr-kesfet/03-dalga1-s2-kisi-kanal-api.md — tamamını uygula.
Ön koşul: Dalga 0 kapısı yeşil.

İki uç (GET /api/v1/discover/people, GET /api/v1/discover/channels) + saatlik kanal hareketi
rollup işi (lib/outbox/worker.ts saatlik bloğuna tek çağrı).

listFriendSuggestions'ı DOĞRUDAN çağır, kendi HTTP ucunu çağırma (hız sınırı tuzağı).
Kanal görünürlük yüklemi gizlilik kritiktir: §B.1'deki üç koşul + @everyone VIEW_CHANNEL
kontrolü. Kanal içeriği asla dönmez.
Sadece kendi dosyalarını değiştir.
Rapor: raporlar/03-s2-rapor.md
```

---

## Dalga 1 · Ş3 — etkinlik + profil + katılma

```
Görev dosyası: docs/prompts/whispr-kesfet/04-dalga1-s3-etkinlik-profil-katilma.md — tamamını uygula.
Ön koşul: Dalga 0 kapısı yeşil.

Üç iş: GET /api/v1/discover/events + ilgi mutasyonu; ServerPublicProfile'ın Ş0'da açtığı üç
alanı gerçek veriyle doldurma (role/presence, voiceRoomCount, category/languages);
lib/discover/join-client.ts (katıl/ayrıl/kod + parseInviteCode + geçersizleme).

Yeni katılma ucu AÇMA — üç mevcut uç sarmalanır. interestedCount satır sayısından türetilir,
+1 ile artırılmaz. Uydurma socket olayı dinleme; karşılığı yoksa TODO(api): yaz ve raporla.
Rapor: raporlar/04-s3-rapor.md
```

---

## Dalga 2 · Ş4 — kabuk + dizin kolonu

```
Görev dosyası: docs/prompts/whispr-kesfet/05-dalga2-s4-kabuk-dizin-kolonu.md — tamamını uygula.
Ön koşul: Dalga 0 kapısı yeşil.

İki iş: selectThirdColumn'a "discover" dalı + wizards-shell.tsx'te TAM OLARAK üç değişiklik
(genişlik, render dalı, prop); DiscoverSidebar (276) — saf sunum, sıfır fetch.

wizards-shell.tsx'te üçten fazla değişiklik yapma. Satırlar <button> değil <Link>.
Ray hiçbir sorgu açmaz; sayaçları prop olarak alır ve null iken pilsiz çizer.
Rapor: raporlar/05-s4-rapor.md
```

---

## Dalga 2 · Ş5 — sayfa + başlık + öne çıkan + filtre

```
Görev dosyası: docs/prompts/whispr-kesfet/06-dalga2-s5-akis-baslik-featured.md — tamamını uygula.
Ön koşul: Dalga 0 kapısı yeşil.

Sen sayfanın sahibisin: components/discover/discover-page.tsx burada yazılır. Ş6–Ş9 sana prop
ekler, içine kod yazmaz — o yüzden prop yüzeyini onların dosyalarındaki adlarla aç.

Durum tek kaynak: URL. Yalnız aktif şeridin sorgusu açılır. Panel açıkken şerit grubu, ikon
grubu ve öne çıkan blok üçü birden gizlenir (tek koşul). Esc önce modal, sonra panel.
Kart yerlerine geçici olarak Ş6'nın imzasıyla eşleşen basit yer tutucular koy ve TODO(Ş6): yaz.
Rapor: raporlar/06-s5-rapor.md
```

---

## Dalga 2 · Ş6 — kart dilleri + ızgara

```
Görev dosyası: docs/prompts/whispr-kesfet/07-dalga2-s6-kart-dilleri-izgara.md — tamamını uygula.
Ön koşul: Dalga 0 kapısı yeşil.

Dört kart (sunucu/kişi/kanal/etkinlik) + ızgara + 6 kartlık skeleton. Kartlar saf sunum:
sıfır fetch, sıfır router. Her eylem prop callback'i.

Kart kökü <article>, eylemler gerçek <button>, kart klavyeyle açılabilir (§0 deseni).
mention-card.tsx'in <article onClick> desenini KOPYALAMA — klavyeyle odaklanılamıyor.
Hiçbir kartta mavi doğrulama ikonu yok.
Rapor: raporlar/07-s6-rapor.md
```

---

## Dalga 3 · Ş7 — profil paneli

```
Görev dosyası: docs/prompts/whispr-kesfet/08-dalga3-s7-sunucu-profil-paneli.md — tamamını uygula.
Ön koşul: Ş3 + Ş5 + Ş6.

326 px panel. 54 px tile arka planla ÇAKIŞMAZ (negatif margin ve halka yok — sunucu kartındaki
dil buraya taşınmaz). Tanıdıkların bir SATIR LİSTESİDİR, avatar yığını değil.
voiceRoomCount kutusu voiceActiveCount'u göstermez.
Geniş ekranda odak tuzağı KURMA (panel kolon, overlay değil).
Rapor: raporlar/08-s7-rapor.md
```

---

## Dalga 3 · Ş8 — katıl modalı + onay şeridi + Yeni pili

```
Görev dosyası: docs/prompts/whispr-kesfet/09-dalga3-s8-katil-modali-onay-seridi.md — tamamını uygula.
Ön koşul: Ş3 + Ş5.

496 px modal (ui/modal kullan, yenisini yazma) + onay şeridi + kabuğa Yeni pili + eski ekranın
tasfiyesi.

Kabuk diff'i iki dosyada toplam 60 satırın altında kalmalı: yalnız koşullu stil ve Yeni pili.
Kod alanı ile radio seçimi birbirini dışlar. Görünürlük anahtarının ürün karşılığı yok —
uydurma uç çağırma, TODO(api): yaz.
server-discovery-screen.tsx'i sil ve ölü i18n anahtarlarını grep kanıtıyla temizle.
Rapor: raporlar/09-s8-rapor.md
```

---

## Dalga 3 · Ş9 — durumlar + ölçekleme + a11y

```
Görev dosyası: docs/prompts/whispr-kesfet/10-dalga3-s9-durumlar-olcekleme-a11y.md — tamamını uygula.
Ön koşul: Ş5 + Ş6.

Boş durum, hata durumu (GERÇEK hata kodu ve saat, DIR-502 sabiti değil), rem ölçekleme
(dört adım), üç kırılım, a11y kontrol listesinin tamamı.

components/discover/** içinde arbitrary px sınıfı sıfır olmalı ve bunu bir test kanıtlamalı.
zoom kullanma. Kontrastı ölç, varsayma; ölçüm çıktısını rapora yaz.
Rapor: raporlar/10-s9-rapor.md
```

---

## Dalga 4 · Ş10 — parity + QA

```
Görev dosyası: docs/prompts/whispr-kesfet/11-dalga4-s10-parity-qa.md — tamamını uygula.
Ön koşul: Ş0–Ş9 hepsi yeşil.

12 durum × 2 tema ekran görüntüsü karşılaştırması, 6 çözünürlük matrisi, e2e + a11y spec'leri,
performans ölçümü, kabul listesi.

Sapmayı piksel farkı olarak değil, hangi ölçünün yanlış olduğu olarak raporla.
Ş1 §6, Ş6 §1 ve Ş8 §1.3'teki üç açık kararı kullanıcıya sorulmak üzere raporun sonunda derle.
Rapor: raporlar/11-parity-rapor.md
```

---

## Koşum sırası özeti

```
1) Ş0                       → kapı: typecheck + test + db:generate + migration
2) Ş1, Ş2, Ş3, Ş4, Ş5, Ş6   → altısı Ş0'dan sonra; sırayla ya da paralel
3) Ş7, Ş8, Ş9               → Ş5+Ş6 (Ş7 ayrıca Ş3) bittikten sonra
4) Ş10                      → hepsi bittikten sonra
```

Tek oturumda sırayla koşuluyorsa önerilen sıra: **Ş0 → Ş4 → Ş5 → Ş6 → Ş1 → Ş2 → Ş3 → Ş7 → Ş8 →
Ş9 → Ş10**. Böylece ekran erken görünür hâle gelir ve API şeritleri gerçek bir tüketiciye karşı
yazılır.
