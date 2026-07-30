# Mobile Release Identity Automation

## Decision

Android APK içindeki `versionName` ve `versionCode` yayın kimliğinin kaynağıdır. Workflow yalnızca SemVer (`version`) alır; EAS tarafından artırılan gerçek `versionCode`, APK üretildikten sonra `aapt` ile okunur.

## Behavior

- Aynı SemVer için sunucudaki APK `versionCode` değeri kurulu uygulamadan büyükse güncelleme sunulur.
- Hakkında ekranındaki sürüm ve Build değerleri native binary kimliğinden gelir.
- Artifact kaydı, Release `buildNumber` ve `sizeBytes` alanlarını aynı transaction içinde eşitler.
- Admin arayüzünde Build elle değiştirilemez.
- CI, APK `versionName` değerinin dispatch SemVer ile aynı olduğunu doğrular.
- Artifact adı, R2 anahtarı, `latest.json` ve Admin kaydı gerçek APK `versionCode` değeriyle üretilir.
- Yayın sonrası karar denetimi `installed=0.0.0` yerine hedef SemVer ve bir önceki `versionCode` ile çalışır.

## Trade-off

Workflow artifact yolu build sırasında geçici bir ad kullanır; kalıcı yayın anahtarı ancak APK kimliği doğrulandıktan sonra belirlenir. Bu, elle girilen Build uyumsuzluğunu ortadan kaldırır.

## Compatibility

Native kimlik okunamazsa sürüm etiketi mevcut bootstrap sürümüne düşer; Build için admin metadata kullanılmaz ve `—` gösterilir. iOS güncelleme davranışı değişmez.
