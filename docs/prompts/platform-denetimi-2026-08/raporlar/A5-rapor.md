# A5 — Hata avı: kod hataları + UI/işlevsel kusurlar

Temel commit: `5a2b3990733b17672cf65fba631b7ec44a7bf96a` · Tarih: 2026-08-08
Kanonik veri: [`A5.findings.json`](A5.findings.json)

## Kapsam — bu eksen eksik tamamlandı

**Açıkça söylenmesi gereken:** A5 promptunun istediği kapsam 10 kritik akış × 4 durum = 40 hücre. Bu turda **6 hücre** dolduruldu. UI kusur sınıflarının (klavye, kaydırma, uzun içerik, dokunma hedefi, erişilebilirlik, tema kontrastı, sistem yazı tipi ölçeği) hiçbiri taranmadı. Desktop kabuk davranışı hiç incelenmedi.

Yapılan: eşzamanlılık/idempotans, hata yönetimi deseni, yerelleştirme bütünlüğü, zamanlayıcı sızıntısı, platformlar arası davranış ayrışması (kısmen).

**A5 ikinci tur istiyor** ve o tur bu turdan büyük olacak.

## Bulgu özeti

critical 0 · high 0 · medium 1 · low 1 — toplam **2**

| id     | Başlık                                                          | Sev    | Efor | Dalga |
| ------ | --------------------------------------------------------------- | ------ | ---- | ----- |
| A5-001 | İletme ve davet paylaşma `clientNonce` göndermiyor → çift mesaj | medium | S    | W1    |
| A5-002 | Mesaj gruplama yüklemi web/mobil ayrışıyor                      | low    | S    | W2    |

## Bulgular

**A5-001 — İdempotans zinciri iki yerde kopuk.**

Dosyanın kendi yorumu tekilliğin nasıl sağlandığını söylüyor:

> `apps/mobile/src/query/use-mobile-message-mutations.ts:204` — sunucudaki `(userId, clientNonce)` benzersiz indeksi tek koruma.

Normal gönderim yolu korunuyor: iyimser mutasyon sarmalayıcısı satır 243'te nonce üretiyor. Korunmayan iki yol:

| Yol                    | Konum                                 | Durum             |
| ---------------------- | ------------------------------------- | ----------------- |
| Mesaj iletme (forward) | `use-mobile-message-mutations.ts:502` | `clientNonce` yok |
| Davet paylaşma         | `mobile-invite-message-sheet.tsx:63`  | `clientNonce` yok |

Davet sheet'inde `sendingId !== null` kilidi var — eşzamanlı çift dokunuşu engelliyor, **zaman aşımı sonrası yeniden denemeyi engellemiyor**. İletme yolunda `forwardMutation`'ın `isPending`'i `use-mobile-messaging-feature.ts:253`'te dışarı verilmiyor, yalnız `mutateAsync` çıkarılıyor.

**A5-002 — Aynı kural, iki farklı yüklem.**

|                               | Web                   | Mobil                           |
| ----------------------------- | --------------------- | ------------------------------- |
| Pencere                       | 5 dk                  | 5 dk                            |
| Yüklem                        | `Math.abs(delta) < W` | `delta >= 0 && delta <= W`      |
| Sırasız mesaj (negatif delta) | **gruplar**           | gruplamaz                       |
| Tam 300.000 ms                | gruplamaz             | **gruplar**                     |
| Gün sınırı                    | `toDateString()`      | `getMobileDisplayMessageDayKey` |

Web tarafında sabit iki dosyada kopyalanmış (`message-list.tsx:15`, `thread-panel.tsx:13`). Bu, A1-003'ün öngördüğü ayrışma sınıfının davranış düzeyindeki kanıtı: aynı kural iki yerde bağımsız yazılmış ve zamanla ayrışmış.

## Arandı, temiz

Bu bölüm bulgu listesinden uzun — kod tabanının durumunu doğru yansıtan kısım burası.

| Hipotez                                                                     | Sonuç                                                                                                                                                                                      |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Locale anahtar farkı** (bir tarafta olup diğerinde olmayan metin)         | **Yok.** Web tr 2145 / en 2145, fark 0. Mobil tr 2116 / en 2116, fark 0. Dört kümede de sıfır sapma.                                                                                       |
| Temizlenmeyen `setInterval`                                                 | **Yok.** Web ve mobilde her dosyada `setInterval` sayısı ≤ `clearInterval` sayısı.                                                                                                         |
| Ekranlarda çevrimdışı durumu eksik (24 ekranın yalnız 2'si)                 | **Yanlış çıkarım.** Çevrimdışı global olarak karşılanıyor: `MobileNetworkProvider` + `MobileConnectivityBanner` + çevrimdışı mutasyonda uyarı toast'ı.                                     |
| Mutasyon hataları kullanıcıya gösterilmiyor (49 `useMutation`, 5 `onError`) | **Yanlış çıkarım.** Hata çağrı yerinde işleniyor: `catch { setError(labels.error) }` + `isPending` ile yeniden giriş kilidi (`mobile-role-detail-screen.tsx:150`).                         |
| İyimser güncelleme geri alınmıyor                                           | **Hayır.** `onSendFailed` + `mobileFailedSendRegistry` ile başarısız gönderim kaydediliyor ve yeniden denenebiliyor.                                                                       |
| 158 yutulan hata işleyicisi kullanıcıyı etkiliyor                           | **Örnekleme temiz.** Bakılanların tamamı desktop fire-and-forget çağrıları (`setAppBadge`, `publishDesktopGameOverlaySnapshot`, `hideDesktopCompanionSurfaces`). Tamamı sınıflandırılmadı. |

## Akış × durum matrisi

| Akış                          | Boş | Yükleniyor | Hata      | Çevrimdışı |
| ----------------------------- | --- | ---------- | --------- | ---------- |
| 1. Kayıt → doğrulama          | ?   | ?          | ?         | ?          |
| 2. Sunucu kur → davet → katıl | ?   | ?          | kısmi     | ?          |
| 3. Kanal mesajı gönder/ilet   | ?   | ?          | **tamam** | global     |
| 4. DM / grup DM               | ?   | ?          | **tamam** | global     |
| 5. Ses odası                  | ?   | ?          | ?         | ?          |
| 6. Bildirim rozeti            | ?   | ?          | ?         | ?          |
| 7. Profil / durum             | ?   | ?          | ?         | ?          |
| 8. Arama                      | ?   | ?          | ?         | ?          |
| 9. Keşif                      | ?   | ?          | ?         | ?          |
| 10. Oturum yenileme           | ?   | ?          | ?         | ?          |

`?` = bu turda izlenmedi. 40 hücrenin 6'sı dolduruldu.

## Ölçümler

| Metrik                          | Değer                                                      | Ağaç     |
| ------------------------------- | ---------------------------------------------------------- | -------- |
| Web locale anahtarı (tr / en)   | 2145 / 2145, fark **0**                                    | baseline |
| Mobil locale anahtarı (tr / en) | 2116 / 2116, fark **0**                                    | baseline |
| Temizlenmeyen `setInterval`     | **0**                                                      | baseline |
| Yutulan hata işleyicisi         | 158 (örnekleme temiz)                                      | baseline |
| Mobil ekran                     | 24 (empty 13 / error 10 / loading 10 / offline 2 + global) | baseline |
| Mobil `useMutation`             | 49                                                         | baseline |

## Kapı sonucu

```
findings 2 sema disi 0
kanit hatasi 0        (dosya + satir + alinti eslesmesi)
zayif senaryo 0
```

## Açık sorular

1. **Sekiz kritik akış izlenmedi** (kayıt, sunucu kurma/davet/katılım, ses odası, bildirim rozeti döngüsü, profil/durum, arama, keşif, oturum yenileme).
2. **UI kusur sınıfları hiç taranmadı**: klavye, kaydırma konumu korunması, uzun içerik taşması, dokunma hedefi boyutu, ekran okuyucu etiketleri, tema kontrastı, sistem yazı tipi büyütmesi.
3. Tarih/saat, çoğul kuralları, Unicode sınır değerleri incelenmedi.
4. Desktop kabuk davranışı hiç incelenmedi.
5. İletme akışının nihai UI bileşeninde yerel gönderim kilidi olup olmadığı izlenemedi — A5-001'in "çift dokunuş" kolu bu yüzden kısmen açık.
6. **Web'de mesaj iletme yeteneği yok görünüyor** (`forwardOfMessageId` yalnız servis katmanında, istemcide kullanılmıyor). Kusur mu bilinçli kapsam mı doğrulanmadı — **A6 parite matrisine girmeli**.
7. 158 yutulan hata işleyicisinin tamamı sınıflandırılmadı.
