# F-01–F-05 uygulama ve doğrulama

Tarih: 2026-09-21. Branch: `main`. Başlangıç HEAD: `95493d2815b6f2439d79ccf3071380f673860c45`.

Beş bulgunun düzeltmesi mevcut çalışma alanına uygulandı. Kullanıcının mevcut WIP değişiklikleri korundu. Alt ajan kullanılmadı. Yeni bağımlılık, şema değişikliği veya migration yok. Commit, push ve deploy yapılmadı. Önceki `05-ilk-bes-bulgu-dogrulama-ve-cozum.md` uygulama öncesi analizi kaydeder; güncel uygulama durumu bu belgededir.

## Uygulanan davranış

| Bulgu | Düzeltme                                                                                                                                                                                                                                                                           | Temel güvence                                                                                                                                                                        |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F-01  | Drain, soketlere terminal namespace disconnect göndermeden mevcut `Server.close()` ile kapanır. İstemcide beş deneme sınırı kaldırıldı; Socket.IO'nun gecikmeli, jitter'lı transport retry mekanizması korunur.                                                                    | Gerçek polling ve WebSocket istemcileri aynı portta açılan yeni sunucuya bağlandı. Logout, unmount ve terminal iptal otomatik retry başlatmaz.                                       |
| F-02  | Kanal/DM join tamamlanması opsiyonel ACK ile bildirilir. Aktif geçmiş bundan sonra yenilenir; inaktif geçmişler reconnect'te stale işaretlenir. DM listesi, sunucu bilgileri ve ana sayfa özeti de mevcut query mekanizmasıyla yenilenir.                                          | HTTP sürerken gelen mesaj/düzenleme/silme cache tarafından ezilmez. Pending/failed balonlar korunur; uzaktaki silinmiş eski satırlar topluca geri eklenmez.                          |
| F-03  | İlk gönderim ve retry ortak, 10 saniye timeout'lu ACK yolunu kullanır. Son pending balonu global hatayla işaretleme kaldırıldı. Her nonce yalnız güncel denemesinin sonucunu kabul eder.                                                                                           | Ters sırada cevap, geç timeout, echo önce ACK sonra ve unmount senaryoları izole edilir. Retry aynı nonce'u kullanır; yeni nonce UUID ile sekmeler/cihazlar arasında ayrılır.        |
| F-04  | DB revalidation hatasında transport kapatılır; doğrulanamayan soket yetkili kalmaz. Middleware geçici doğrulama hatasını sabit `SESSION_CHECK_UNAVAILABLE` koduyla ayırır. Yalnız bu hata için tek timer ile artan gecikmeli, jitter'lı retry yapılır; gecikme en fazla 30 saniye. | Yeniden bağlantı her seferinde kimlik kontrolünden geçer. Gerçek iptal/ban/geçersiz oturum terminal kalır. Fail-open veya grace süresi eklenmedi. İç DB hatası istemciye verilmez.   |
| F-05  | 15 admin sayfası önce `requireAdminModule` sonucunu bekler, sonra veri yükleyicilerini çalıştırır. `/admin` ve alt yolları proxy oturum korumasına alındı.                                                                                                                         | Guard beklerken ve reddettiğinde admin veri yükleyicisi çağrısı sıfır. Yetkili durumda bağımsız yükleyiciler paralel çalışmayı sürdürür. Proxy, sayfa modül yetkisinin yerini almaz. |

## Önemli kararlar

- Transport retry sahibi Socket.IO Manager'dır. İkinci retry mekanizması yalnız Manager'ın otomatik tekrar denemediği geçici middleware reddi içindir. Görünürlük/online olayları terminal oturumu canlandırmaz.
- Snapshot uzlaştırması HTTP başlangıcındaki cache ile güncel cache'i karşılaştırır. Bütün eski sunucu satırlarını birleştirmek yerine yalnız yerel bekleyen mesajları ve istek sırasında gelen değişiklikleri korur. Ek event store veya kalıcı offline kuyruk kurulmadı.
- Join ACK eski istemciler için opsiyoneldir. Eski sunucu ACK göndermiyorsa 10 saniyelik timeout sonrasında yetkili HTTP endpoint üzerinden geçmiş okunur; açık join reddinde bu yenileme başlatılmaz.
- Hem echo hem ACK kaybolursa, geçmiş yanıtındaki yazar nonce'u pending balonu gerçek kayıtla eşleştirir. Nonce yalnız ilgili yazarın kanal/DM geçmiş yanıtına eklenir; ortak mapper ve diğer kullanıcılara yayınlanan payload'a taşınmaz.
- ACK başarısı sunucunun mesajı kaydettiğini belirtir; alıcının okuduğu anlamına gelmez. Timeout da mesajın kaydedilmediğinin kanıtı değildir. Aynı nonce ile retry, mevcut sunucu tekilleştirmesini kullanır.
- Web ve Tauri ortak frontend düzeltmelerini kullanır. Sunucu drain düzeltmesi ortak Socket.IO katmanındadır. Mobilin ayrı istemci lifecycle tasarımı değiştirilmedi.

## Çalıştırılan kontroller

**PASS — 82 dosyalık ilgili regresyon seti:** `lib/socket`, `lib/messages`, `lib/dm` altındaki testler; `use-messages`, reconnect, admin page authorization, admin module access, session revocation, expired-session proxy, workspace message service ve channel send service testleri. Node test runner exit code `0`. Tam monorepo suite değildir.

**PASS — son odaklı koşu: 62 test, 0 fail, 0 skip.**

```powershell
# apps/web altında. Test process'i için sentetik localhost DB adresi;
# gerçek DB/Redis bağlantısı ve uygulama sunucusu kullanılmadı.
$env:DATABASE_URL='postgresql://prisma:prisma@127.0.0.1:1/unit'
node --import tsx --test --test-force-exit `
  src/hooks/use-messages.test.ts `
  src/hooks/use-messages-reconnect.test.ts `
  src/lib/admin/page-authorization.test.ts `
  src/lib/admin/module-access.test.ts `
  src/lib/messages/send-tracker.test.ts `
  src/lib/messages/author-nonce.test.ts `
  src/lib/socket/authentication.test.ts `
  src/lib/socket/session-revalidation.test.ts `
  src/lib/socket/connection-lifecycle.test.ts `
  src/lib/socket/drain.test.ts
```

Bu koşu gerçek localhost Socket.IO bağlantılarıyla polling/WebSocket kapanış-yeni sunucu bağlantısını ve geçici middleware reddinden sonra yeni handshake'i kapsar. Kanal/DM hook testleri gerçek TanStack QueryClient/InfiniteQueryObserver ve uygulama hook kaynağını kullanır; React effect yürütmesi, HTTP ve socket olayları test düzeneğidir. Admin testleri gerçek 15 page fonksiyonunu kontrollü guard/loader bağımlılıklarıyla çalıştırır; tam Next HTTP render değildir. DB nonce görünürlüğü testinde Prisma çağrıları izole edilmiştir.

**PASS:** web TypeScript kontrolü (`pnpm.cmd exec tsc --noEmit --incremental false --pretty false`), değiştirilen 41 TS/TSX dosyasında ESLint, Prettier biçimlendirmesi ve `git diff --check`.

İlk ESLint koşusu testlerdeki `module` değişken adı ve hook içi mutable memo kullanımı nedeniyle başarısızdı; test değişkenleri yeniden adlandırıldı, istek metadata'sı `useRef` içine alındı. Son ESLint ve typecheck koşuları temiz. Negatif DB senaryolarında testlerin ürettiği beklenen hata logları test başarısızlığı değildir.

## Kanıt sınırları

**Graphify:** `graphify update .` başarıyla tamamlandı; 44.404 node, 107.050 edge, 1.808 community. Güncel graph içinde değiştirilen 41 TS/TSX kaynağının tamamı var (`MISSING_CHANGED_SOURCES=0`). Büyük graph için HTML üretimi aracın 5.000 node sınırı nedeniyle atlandı; `graph.json` ve `GRAPH_REPORT.md` güncellendi. Kaynak/config/test kanıtları sonuçların dayanağıdır; graph yalnız gezinme aracıdır.

Gerçek DB unique constraint/migration durumu, dağıtık Redis, Railway rollout, tam Next production build/E2E, tarayıcı görsel kabulü, Tauri/native mobil runtime, CI ve yük testi çalıştırılmadı. Ölçülmüş üretim performans artışı veya tüm platformlarda canlı kabul iddiası yok.

Canlı kabulde: açık kanal ve DM ile deploy/kesinti; eşzamanlı iki gönderim; ACK/echo kaybında aynı nonce retry; DB arızası sırasında oturum iptali; yetkisiz admin isteği kontrol edilmeli. Bu kabul adımları canlı sistem değişikliği yetkisi gerektirir; bu yerel uygulama çalışmasının parçası olarak yapılmadı.
