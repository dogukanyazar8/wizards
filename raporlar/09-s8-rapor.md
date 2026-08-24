# 09 — S8 katıl modalı ve onay şeridi raporu

## Sonuç

- `Modal` yeniden kullanılacak şekilde 496 px katıl yüzeyi eklendi; ölçüler `Kesfet-5B.dc.html` inline stillerinden alındı.
- Davet kodu ile sunucu radio seçimi birbirini dışlıyor. Tam davet URL'si kod biçimine indirgeniyor; hatalı kod mutasyon çağrısı yapmıyor.
- Pano reddi görünür hata veriyor. Katılma hatası modalı açık tutuyor.
- Görünürlük tercihi yalnız yerelde tutuluyor. Ürün/API karşılığı olmadığı için uç çağrısı uydurulmadı; kaynakta `TODO(api)` var.
- Başarılı katılım sonrası kalıcı `aria-live="polite"` onay şeridi gösteriliyor. `systemChannelId` yoksa varmış gibi metin/link üretilmiyor.
- 74 px ray ve 228 px nav yapısı korunarak yalnız koşullu yeni-sunucu görünümü ile `Yeni` pili eklendi. İki kabuk dosyasındaki görev-yerel değişim toplamı 53 satırdır (`< 60`).
- `WorkspaceServerSummary` katılma zamanını taşımıyor. 24 saat hesabı uygulanabilir durumda; mevcut ürün verisinde belgelenmiş fallback olan "ziyaret edilmemiş" kullanılıyor. Ziyaret listesi bozuk depolamaya dayanıklı ve en çok 200 kimlik tutuyor.
- Eski `server-discovery-screen.tsx` silindi. Kullanılmayan `ServerDiscoveryGridSkeleton` kaldırıldı. Eski keşif istemcisi/route'u silinmedi, deprecated işaretlendi.
- Eski keşif sözlük anahtarları TR/EN'den temizlendi; katılma hata anahtarları korundu.

## Modal primitive etkisi

`components/ui/modal.tsx` için tek davranış değişikliği opsiyonel `initialFocusRef` desteğidir. Mevcut Esc, odak kapanı ve kapatınca odağı tetikleyiciye döndürme davranışı korunur. Prop verilmezse önceki ilk-odak davranışı aynıdır; regresyon riski düşüktür.

## Tasfiye grep kanıtı

```text
ServerDiscoveryScreen: ZERO
ServerDiscoveryGridSkeleton: ZERO
legacy discover production consumers: ZERO
legacy discover dictionary keys: ZERO
```

Test dosyasındaki eski anahtar adları yalnız yokluk sözleşmesini doğrulayan negatif listedir; üretim tüketicisi değildir.

## Doğrulama

- `PASS` — odaklı S8 testleri: **53/53**.
- `PASS` — hedef dosyalarda ESLint.
- `PASS` — `pnpm --filter @wizards/web lint` (çıkış 0; config testleri 10/10).
- `FAIL` — `pnpm --filter @wizards/web typecheck`. S8 dışındaki eşzamanlı Ş2/Ş9/Etkinlik WIP'inde 26 hata: discover route/style testleri ve event form/filter/place/RSVP alanları. S8 dosyalarında hata yok.
- `ENV BLOCKED` — `pnpm --filter @wizards/web test`. Koşum yaklaşık 96 dakika tamamlanmadı; `app/summary/route-logic.test.ts` ile `search/command/route-logic.test.ts` izole süreçleri ilerlemedi ve kontrollü durduruldu.
- İstenen `typecheck && lint && test` zinciri typecheck çıkış 1 nedeniyle ilk adımda durdu. Lint ve test yukarıdaki şekilde ayrıca çalıştırıldı.
- `PASS` — görev dosyalarında `git diff --check`.

Commit oluşturulmadı.
