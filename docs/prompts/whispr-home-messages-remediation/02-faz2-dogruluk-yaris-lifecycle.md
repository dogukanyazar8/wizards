# Faz 2 Prompt — Doğruluk, Yarış Durumları, Lifecycle

`00-ortak-baglam.md` ve Faz 1 raporunu tamamen oku. Faz 1 yeşil değilse güvenlik invariantını bypass
ederek ilerleme. Yerel `uat`; commit/push/deploy ve WIP temizliği yok.

## Hedef

Single-choice poll, voice recorder ve Home focus/presence akışlarındaki zamanlama bağımlı hataları DB ve
lifecycle sınırında deterministik kapat. Delay/retry, process-local mutex veya UI disable tek başına çözüm
değildir.

## Başlangıç

```powershell
graphify query "single choice poll concurrent vote transaction voice recorder getUserMedia lifecycle focus presence expiry cleanup race"
git status --short --branch
```

İncele:

- `apps/web/src/lib/polls/service.ts` ve testleri
- Poll schema/constraints/migration'ları
- `apps/web/src/components/chat/voice-recorder.tsx` ve testleri
- `apps/web/src/lib/messages/voice-capture.ts` ve testleri
- `apps/web/src/lib/home/focus.ts`, focus machine/countdown, presence service ve route logic testleri
- Focus expiry/cleanup çağıran tüm worker/request yolları

## 1. Single-choice poll atomikliği

Önce gerçek eşzamanlı regresyon testi yaz: aynı `(pollId, userId)` için iki farklı option'a aynı anda oy
isteği gönder. İki Promise de DB transaction'a girsin. Final DB durumunda en fazla bir `PollVote` kalsın;
DTO `myOptionIds` ve counts DB ile aynı olsun.

Gereksinimler:

- Mevcut toggle/undo semantiğini koru; testle sabitle.
- Çözüm DB transaction sınırında serialize etmeli. PostgreSQL row/advisory lock kullanılacaksa Prisma tagged
  template ile parametrele; string interpolation yok.
- Serializable transaction seçilirse yalnız serialization/deadlock kodlarına sınırlı, bounded retry uygula;
  genel hatayı retry etme.
- Multiple-choice poll paralel farklı option oylarını gereksiz serialize etmemeli.
- Unique constraint/lock tek instance değil çok process altında da invariantı korumalı.
- Transaction sonrası yayınlanan realtime DTO commit edilmiş durumu taşımalı; rollback olmuş state yayınlama.

## 2. Voice recorder lifecycle

Regresyon testleri:

- `getUserMedia()` promise'i component unmount sonrası çözülür: tüm track'ler hemen durur; state update,
  object URL, upload veya send olmaz.
- Kullanıcı kayıt başlatıp promise çözülmeden iptal eder: geç sonuç kaydı yeniden başlatmaz.
- Maksimum süre otomatik stop: kayıt preview/draft'a geçer; mesaj otomatik gönderilmez.
- Yalnız açık “Gönder” aksiyonu upload/send çağırır.
- Hızlı start-stop-start: eski generation yeni session'ı kapatmaz.
- Hata/izin reddi: stream/timer/listener/object URL temizlenir; güvenli ve erişilebilir hata görünür.

Küçük monotonic generation/session id ve mount/abort guard kullan. Tek lifecycle sahibini koru. MediaStream,
MediaRecorder, interval/timeout ve object URL cleanup'ını idempotent yap. Yeni global recorder manager kurma.

## 3. Focus expiry ve presence atomikliği

Regresyon testleri:

- Eski expiry sweep, kullanıcı yeni focus açtıktan sonra yeni focus'u kapatamaz.
- Kullanıcı manuel status değiştirirken stale cleanup status'u geri yazamaz.
- Cleanup yalnız beklediği `status`, `statusExpiresAt` ve/veya revision hâlâ eşleşiyorsa update yapar;
  koşul kaybolursa no-op.
- İki cleanup aynı anda çalışırsa final durum deterministik ve idempotenttir.

`updateMany` compare-and-set veya mevcut eşdeğer atomik DB deseni kullan. Önce okuyup sonra koşulsuz update
yapma.

`presence` + `focus` aynı request body'si için:

1. Tüm repo istemcilerini ara.
2. Hiçbir desteklenen istemci birlikte göndermiyorsa Zod/route sınırında 400 ile reddet ve testle kilitle.
3. Desteklenen istemci varsa restore semantiğini açıkça tanımla; `statusRestoreTo` accidental intermediate
   `next.status` değil sözleşmedeki baseline'dan türesin. Web/mobile testlerini birlikte güncelle.

Sessizce varsayım yapma; seçilen sözleşmeyi raporda gerekçelendir.

## Doğrulama

```powershell
pnpm.cmd --filter @wizards/web exec node --import tsx --test --test-force-exit src/lib/polls/service.test.ts src/components/chat/voice-recorder.test.tsx src/lib/messages/voice-capture.test.ts src/lib/home/focus.test.ts src/lib/home/focus-machine.test.ts src/lib/home/presence-service.test.ts src/app/api/v1/users/me/presence/route-logic.test.ts
pnpm.cmd --filter @wizards/web test
pnpm.cmd --filter @wizards/web lint
pnpm.cmd --filter @wizards/web typecheck
graphify update .
```

Concurrency testi gerçek paralellik/transaction göstermiyorsa faz tamamlanmış sayılmaz. DB ortamı yoksa test
`ENV BLOCKED`; process-local sahte testle PASS üretme.

Rapor: `docs/prompts/whispr-home-messages-remediation/raporlar/02-faz2-rapor.md`.
