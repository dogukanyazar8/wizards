# 11 — Moderasyon durum makinesi ve sunucu denetim izi

`00-ortak-baglam.md` oku. Caveman ultra. `uat`. Commit yok.

**Ön koşul:** 05 landed (yetki kapıları; audit yazımı aynı işlemlere giriyor).

## Sorun

Kapatılmış moderasyon vakası yeniden açılabiliyor ve ikinci aksiyon 500 veriyor. Ayrıca sunucu içi ayrıcalıklı eylemlerin **hiç** izi yok, ama izni arayüzde veriliyor.

## Kapsam

### 1. Kapatılmış vaka yeniden üstlenilebiliyor

`apps/web/src/lib/moderation/case-actions.ts:117` · `apps/mobile/src/admin/mobile-admin-model.ts:176`

`claimCase` yalnız `assigneeId: null` filtreliyor; "sadece OPEN vaka üstlenilir" kuralı yalnız iki istemcide. `applyModerationCaseAction` `assigneeId` yazmadığı için üstlenilmeden çözülen vaka `null` kalıyor — web kuyruğu `scope=resolved` kabul edip üstlen düğmesini çiziyor. Tek tıkla DISMISSED/ACTIONED vaka `IN_REVIEW`'e dönüyor ve açık vaka sayacı yayını onun üzerinden tetikleniyor.

Yap: `claimCase` `where`'ine `status: { notIn: [...RESOLVED_STATUSES] }` ekle. Mevcut 409 yolu bu durumu zaten karşılıyor — yeni hata kodu üretme.

### 2. `APPEALED` çözülmüş sayılmıyor

`apps/web/src/lib/moderation/case-actions.ts:69`, `:401` · `apps/web/src/lib/moderation/appeal-service.ts:43`

`RESOLVED_STATUSES` `APPEALED`'i içermiyor. ACTIONED → itiraz → ikinci aksiyon: koruma geçiyor, ban tekrar uygulanıyor, `resolveCase` commit oluyor, sonra raporcu `dedupeKey` unique'inde P2002 ile 500 atıyor. Ban zaten inmiş, ilk raporcu dışında kimse bilgilendirilmemiş.

Yap:

- `"APPEALED"`'i `RESOLVED_STATUSES`'a ekle.
- Raporcu fan-out'unu `createMany({ skipDuplicates: true })` yap — dedupe'ı istisna yerine sorgu çözsün.

### 3. Vaka dosyası sınırsız yükleniyor

`apps/web/src/lib/moderation/case-queries.ts:204`, `:177`, `:187`

Raporlar, olaylar ve deliller `take`'siz, her biri kullanıcı join'li. `attachReportToCaseInTransaction` aynı özneye karşı her raporu tek vakaya topladığından brigadlanmış hesapta tek vaka binlerce satır. Mobil ikizi `take: 5` yapıyor.

Yap: üç ilişkiye `take` + "daha eski kayıtlar" sayfalaması ekle. Zaman çizelgesi birleştirmesi JS'te kalabilir, ama sınırlı girdiyle.

### 4. Sunucu `AuditLog` tablosunun tek yazıcısı yok

`packages/db/prisma/schema.prisma:1788` · `apps/web/src/lib/workspace/permissions.ts:27` · `apps/web/src/components/shell/server-settings-overlay.tsx:101` · karşılaştır: `writeAdminAuditLog`

Kick, rol verme, kanal silme, geçmiş temizleme, sunucu ayarı değişikliği — hiçbiri iz bırakmıyor. Tek referans hesap silmedeki `deleteMany`. `VIEW_AUDIT_LOG` izni sunucu ayarlarında sunuluyor ve kalıcı olarak boş bir tabloya açılıyor.

Bu maddenin eforu **L**. İki yoldan biri seçilmeli — **karar kullanıcıya sorulmalı**:

- **(A) Yaz.** Her ayrıcalıklı workspace mutasyonunun mevcut işlemi içinde bir `AuditLog` satırı. Admin tarafındaki `writeAdminAuditLog(client)` deseni birebir kopyalanır (tek yardımcı, `tx` alır, çağıran eylem türünü verir). Kapsam: kick, ban, rol oluştur/düzenle/sil, rol ata/kaldır, kanal oluştur/düzenle/sil, kategori değişiklikleri, sunucu ayarları, davet oluştur/sil, geçmiş temizleme. Okuma yüzeyi de gerekir (`VIEW_AUDIT_LOG` bir şey göstersin).
- **(B) Kaldır.** `VIEW_AUDIT_LOG` iznini ve arayüzdeki anahtarı kaldır, modeli sil. Tutulmayan bir söz vermekten iyidir.

(A) doğru olan ama tek promptta bitmez. Seçilirse **ayrı bir alt-paket** olarak planla: bu prompt yalnız (i) kararı sorar, (ii) (A) seçilirse yazma yardımcısını ve **iki** mutasyonu (kick + rol atama) referans uygulama olarak yazar, kalanını listeler.

Yardımcıyı yazarken: tek fonksiyon, `tx` alır, `serverId`/`actorId`/`action`/`targetType`/`targetId`/`metadata` yazar. Eylem türleri için string birleşimi (union) kullan, serbest metin değil.

## Yapılmayacak

- Moderasyon durum makinesini yeniden tasarlama.
- Yeni vaka durumu eklemek.
- Admin audit yüzeyini değiştirme (o çalışıyor).
- (A) seçilirse tüm mutasyonları tek seferde bağlamak — referans iki tanesi, kalanı listelenir.

## Kabul kriterleri

1. Çözülmüş vaka üstlenilemiyor (409).
2. İtiraz edilmiş vakaya ikinci aksiyon reddediliyor; raporcu bildirimi P2002 atmıyor.
3. Vaka dosyası sınırlı sayıda rapor/olay/delil yüklüyor ve devamı sayfalanabiliyor.
4. (A) seçilirse: kick ve rol atama `AuditLog` satırı yazıyor, aynı işlemde.

## Testler

- `claimCase`: her çözülmüş durum için ret.
- İkinci aksiyon: `APPEALED` reddi.
- Raporcu fan-out: yinelenen `dedupeKey` ile fırlatmama.
- Vaka dosyası: `take` uygulandığı.
- (A) seçilirse: kick işleminde audit satırının yazıldığı (sahte `tx` ile).

## Doğrulama

```bash
pnpm --filter @wizards/web typecheck
```

```bash
pnpm --filter @wizards/web test
```
