# İndirme ve Sorun bildir pencereleri — 3 dalgalık run-prompt paketi

Tasarım kaynağı: `design_handoff/indirme-sorunbildir-paketi/`. Branch `uat`, commit yok.

| Dosya                | İçerik                                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `00-ortak-baglam.md` | Kaynak dosyalar, 6 bağlayıcı karar, token/font eşlemesi, mühendislik kuralları, doğrulama komutları |
| `dalga-1.md`         | Ş1–Ş7 · sözleşme, DB kataloğu, iki uç, yükleme izni, günlük tamponu, i18n                           |
| `dalga-2.md`         | Ş8–Ş12 · ray düğmeleri + Sorun bildir penceresinin 13 durumu                                        |
| `dalga-3.md`         | Ş13–Ş16 · İndirme penceresi, admin katalog yönetimi, a11y/parity kapanışı                           |

## Başlatma promptları

Her dalga temiz bir oturumda başlatılır. Bir önceki dalga çıkış kriterlerini geçmeden sonraki
dalga başlamaz.

### Dalga 1

```
docs/prompts/indirme-sorunbildir/00-ortak-baglam.md ve docs/prompts/indirme-sorunbildir/dalga-1.md
dosyalarını oku, sonra Dalga 1'i (Ş1–Ş7) uçtan uca uygula.

Tasarım kaynağı design_handoff/indirme-sorunbildir-paketi/ — SPEC.md tek doğru kaynak, dışına
çıkma. Branch uat, commit yok. Bu dalgada hiçbir .tsx ekran dosyasına dokunma.

Kararsız kaldığın her noktada dur ve sor; varsayımla ilerleme. Bitirince dalga çıkış
kriterlerindeki beş doğrulama komutunu koş ve çıktılarını raporla.
```

### Dalga 2

```
docs/prompts/indirme-sorunbildir/00-ortak-baglam.md ve docs/prompts/indirme-sorunbildir/dalga-2.md
dosyalarını oku, sonra Dalga 2'yi (Ş8–Ş12) uçtan uca uygula.

İlk iş: design_handoff/indirme-sorunbildir-paketi/referans.html'i tarayıcıda aç ve 1–13
numaralı çiplerin hepsine tıkla; davranışı oradan, ölçüyü SPEC.md'den al. ekranlar/01..13*.png
ile karşılaştır. Ön koşul Dalga 1 tamamlanmış olmalı — değilse dur.

Yeni renk, ölçü, durum veya metin icat etme. Branch uat, commit yok. Kararsız kaldığında sor.
Bitirince typecheck/test/lint koş ve SPEC A.12'deki 13 durumu tek tek işaretle.
```

### Dalga 3

```
docs/prompts/indirme-sorunbildir/00-ortak-baglam.md ve docs/prompts/indirme-sorunbildir/dalga-3.md
dosyalarını oku, sonra Dalga 3'ü (Ş13–Ş16) uçtan uca uygula.

referans.html'deki 14 ve 15 numaralı çipler hedef; ekranlar/14-indirme-prod.png ve
15-indirme-uat.png ile satır satır karşılaştır. Ön koşul Dalga 1 ve 2 — değilse dur.

SPEC B.7'deki "Sürüm notları" düğmesinin hedefi için uygun mevcut yüzey yoksa dur ve sor.
Branch uat, commit yok. Bitirince PROMPT.md'deki 19 kabul maddesini tek tek işaretle ve
docs/prompts/indirme-sorunbildir/SONUC.md kapanış raporunu yaz.
```
