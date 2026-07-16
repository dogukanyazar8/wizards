# Whispr Mobile 1D Bildirimler Tasarımı

## Amaç

UAT'taki Bildirimler sekmesini, kanonik 1D referansındaki hiyerarşi ve geometriyle; yalnızca mevcut, doğrulanmış mobil bildirim verisini kullanarak sunmak.

## Mimari

`NotificationsScreen`, TanStack sorgusundan gelen `MobileNotificationItem` kayıtlarını yerel gün sınırlarına göre gruplar. Her satır yalnızca API'nin actor, server, channel, quote, actionUrl ve type alanlarından türetilir; ekran örneğindeki adlar, sayılar ve olay metinleri üretim koduna eklenmez.

Tıklama okunmamış kaydı mevcut mutasyonla okur ve güvenli `actionUrl` varsa mevcut mobil route-intent katmanına aktarır. Bildirim izni yalnızca izin kartındaki açık CTA ile istenir. Sesli oda katılımı yalnızca API'nin gerçek, sesli kanal bağlamı sunduğu olaylarda mevcut `joinVoiceChannel` akışı üzerinden başlatılır; bu akış mikrofon iznini kendi kullanıcı-aksiyon sınırında ister.

## Kapsam ve Sınırlar

- 1D ekranı, stilleri, prop kablosu ve odaklı component/contract testleri değişir.
- Mevcut bildirim sorgusu, mark-read mutasyonları, realtime invalidation ve native izin runtime'ı korunur.
- Ekran görsel veri üretmez. Test fixture'ları üretim verisi değildir ve gerçek API şemasını kullanır.
- Mevcut mobil API şeması ses, reaksiyon ve sunucu-katılımı için ayrı event türü taşımıyorsa, ekran bu olayları tahmin etmez; yalnızca gelen gerçek tür/bağlamı görselleştirir. Bu sözleşme genişletmesi ayrı bir backend ürünü gerektirir.
- Mevcut yerel değişiklikler korunur; özellikle `notifications-screen.styles.ts` içindeki font-ağırlığı temizliği geri alınmaz.

## Doğrulama

Component testleri izin çağrısının sadece CTA'da yapıldığını, gerçek unread mutasyonunu, gün gruplamasını, güvenli route aksiyonunu, render varyantlarını ve loading/empty/error/offline durumlarını kapsar. Ardından mobile test, component test, typecheck, quality gate, Android UAT build, cihaz capture ve 1d-light visual gate çalıştırılır.
