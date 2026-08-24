# Whispr "Mesajlar" ekranı — paralel run-prompt paketi

Whispr **web + masaüstü** uygulamasının ikinci büyük ekranı: sohbet rayı, Arkadaşlar görünümü, DM
ve grup sohbeti, thread ve arama panelleri, grup kurma ve anket modalları, boş durum. Toplam
**11 durum**.

Tasarım kaynağı (nihai otorite sırasıyla):

1. `design_handoff/mesajlar-paketi/referans/Mesajlar.dc.html` — her elemanın inline `style` değeri
2. `design_handoff/mesajlar-paketi/referans/Mesajlar-referans.html` — çalışan, tıklanabilir kopya
3. `design_handoff/mesajlar-paketi/SPEC-MESAJLAR.md` — ölçü, metin, davranış
4. `design_handoff/mesajlar-paketi/screens/*.png` — 12 ekran, 1360×920, koyu tema, ×1
5. `design_handoff/mesajlar-paketi/SPEC-ANA-SAYFA.md` §1 (token/tipografi) ve §8 (ölçekleme)

Görev tanımı: `design_handoff/mesajlar-paketi/PROMPT.md`.

## Paket neden "dalga"lı

Ana Sayfa paketi (`whispr-ana-sayfa-1a`) sıralıydı: her faz bir öncekinin sözleşmesine dayanıyordu.
Bu paket **paralel koşmak için** kuruldu. Yöntem tek cümle: **sözleşme önce donar, sonra şeritler
birbirinin dosyasına dokunmadan aynı anda ilerler.**

- **Dalga 0** tek turda biter ve her şeyi kilitler: ölçü sözlüğü, migration, `@wizards/types`
  şemaları, i18n sözlüğü. Bu dalga bitmeden hiçbir şerit başlamaz.
- **Dalga 1** ve **Dalga 2** şeritleri **ayrık dosya kümelerine** sahiptir. Her faz dosyasının
  §"Sahiplenilen dosyalar" bölümü bağlayıcıdır: şerit orada yazmayan bir dosyaya **yazmaz**, okur.
- Şeritler arası her temas noktası Dalga 0'da yazılmış bir **tip** ya da **prop sözleşmesi**dir.
  Karşı taraf henüz yokken şerit kendi tarafını sözleşmeye göre yazar ve testini sahte veriyle
  koşar.

```
Dalga 0  ─┬─ Ş0.1 ölçü sözlüğü + denetim kapsamı
          ├─ Ş0.2 migration + Prisma şeması
          ├─ Ş0.3 @wizards/types sözleşmeleri
          └─ Ş0.4 i18n messages.* sözlüğü            ← kapı: typecheck + test + db:generate

Dalga 1  ─┬─ Ş1 kabuk + sohbet rayı
          ├─ Ş2 API + realtime
          ├─ Ş3 Arkadaşlar görünümü
          └─ Ş4 bestekar + sesli mesaj               ← kapı: her şerit kendi testini geçirir

Dalga 2  ─┬─ Ş5 sohbet gövdesi
          ├─ Ş6 anket
          ├─ Ş7 sağ paneller
          └─ Ş8 modallar + boş durum                 ← kapı: her şerit kendi testini geçirir

Dalga 3  ─── Ş9 parity kapısı, a11y, kırılımlar, performans, QA
```

## Dosyalar

| Dosya                                  | Kapsam                                                                                              | Ön koşul         |
| -------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------- |
| `00-ortak-baglam.md`                   | Kurallar, doğrulanmış gerçekler, alınmış 12 karar, tuzaklar, kalite çıtası. **Uygulanmaz, okunur.** | —                |
| `01-dalga0-sozlesme.md`                | 4 paralel şerit: ölçü sözlüğü, migration, tipler, i18n                                              | —                |
| `02-dalga1-s1-kabuk-sohbet-rayi.md`    | 4 kolon kabuk, gezinme paneli 228, sohbet rayı 276                                                  | Dalga 0          |
| `03-dalga1-s2-api-realtime.md`         | Anket/sabitleme/öneri/global arama uçları, socket olayları                                          | Dalga 0          |
| `04-dalga1-s3-arkadaslar.md`           | 4 sekme, satır menüsü, öneriler, sıralama, boş durumlar                                             | Dalga 0          |
| `05-dalga1-s4-bestekar-sesli-mesaj.md` | `Aa` şeridi, kısayollar, sesli mesaj uçtan uca                                                      | Dalga 0          |
| `06-dalga2-s5-sohbet-govdesi.md`       | Başlık, sabitlenen şerit, mesaj listesi, hover şeridi, menüler                                      | Dalga 1 (Ş1, Ş2) |
| `07-dalga2-s6-anket.md`                | `MessagePoll` kartı + `PollComposer` modalı                                                         | Dalga 1 (Ş2, Ş4) |
| `08-dalga2-s7-sag-paneller.md`         | `ThreadPanel` 340 + `MessageSearchPanel` 340                                                        | Dalga 1 (Ş1, Ş2) |
| `09-dalga2-s8-modallar-bos-durum.md`   | `CreateGroupModal` 2 adım, yeni mesaj seçici, boş durum                                             | Dalga 1 (Ş1, Ş2) |
| `10-dalga3-parity-qa.md`               | 6 çözünürlük × 2 tema parity, a11y, kırılımlar, performans, kabul                                   | Dalga 2          |

## Nasıl koşulur

Her şerit tek geçişte uygulanabilir bir dilimdir.

```
1. 00-ortak-baglam.md oku
2. Şerit dosyasını oku
3. graphify query "<şeridin yüzeyi>" ile dokunulacak dosyaları doğrula
4. Uygula (test önce)
5. Şeridin kapı komutlarını koş
6. docs/prompts/whispr-mesajlar/raporlar/<no>-rapor.md yaz
7. Commit için izin iste — kendiliğinden commit yok
```

Aynı dalganın şeritleri **aynı anda** açılabilir. Farklı dalgalar açılmaz: Dalga 1 başlamadan
Dalga 0 kapısı yeşil olmalı.

## Çalışma koşulları

- Branch **`uat`**. Yeni branch, yeni worktree yok.
- caveman **ultra** modu.
- **graphify** kullanılır: her şeridin başında `graphify query`, sonunda `graphify update .`
- Kararsız kalınan yerde **kullanıcıya sorulur**, tahmin edilmez.
- Kalite çıtası: `00-ortak-baglam.md` §5. Sunucu tarafında zorlanmayan yetki, ölçülmemiş sorgu,
  testsiz yol, redaksiyonsuz presence kabul edilmez.

## Kapsam dışı

- Sol **sunucu rayı** (74) ve panelin altındaki **kullanıcı barı** — Ana Sayfa paketinde yapıldı,
  dokunulmaz. Gezinme panelinin **yalnız genişliği ve iki font boyutu** değişir (karar #2).
- Ana Sayfa bento ızgarası, komut paleti, `/mentions` · `/events` · `/inbox` ekranları.
- React Native mobil uygulama. Bu paket web + masaüstü (Tauri web'i sarar).
- Sunucu kanallarının **kendi** ekranı (kanal listesi, üye paneli, kanal ayarları). Ortak mesaj
  bileşenleri karar #10 gereği kanallarda da yeni görünümü alır; kanal kabuğu değişmez.
