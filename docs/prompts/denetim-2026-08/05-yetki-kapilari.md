# 05 — Yetki kapıları: tek tanım, doğru sınır

`00-ortak-baglam.md` oku. Caveman ultra. `uat`. Commit yok.

**Ön koşul:** yok.

## Sorun

Aynı yetki kararı birden fazla yerde farklı yazılmış. Sonuç: admin panosu yetkisiz role veri veriyor, moderatör yöneticileri atabiliyor, iptal edilen izin 45 saniye çalışmaya devam ediyor.

Bu promptun tek ilkesi: **bir yetki kuralı bir yerde tanımlanır.** İki liste varsa biri diğerini import etsin.

## Kapsam

### 1. Admin panosu `ANALYST`e e-posta ve `ipHash` sızdırıyor

`apps/web/src/lib/admin/snapshots/overview.ts:142` · `snapshots/users.ts:38` · `snapshots/activity.ts:158` · `snapshots/audit.ts:46` · `snapshots/index.ts:73` · `capability-roles.ts:8`, `:20`, `:37`

`/api/v1/admin/dashboard` `dashboard.read` ile korunuyor (ANALYST dâhil) ama payload'ında kullanıcı e-postaları ve `AdminAuditLog` satırları (`ipHash` dâhil) var. `user.read` ANALYST'i, `audit.read` OWNER/ADMIN dışını dışlıyor. Panonun kendi yorumu bu sızıntının daha önce kapatıldığını iddia ediyor.

Yap:

- Üç snapshot projeksiyonundan `email` alanını **çıkar**. E-posta yalnız `user.read` kapılı uçtan servis edilsin.
- Audit dilimini `composeAdminDashboardSnapshot`'tan ayır; yalnız `adminRoleHasCapability(admin.role, "audit.read")` ise birleştir.
- `ipHash`'i audit projeksiyonundan çıkar; yalnız `audit.read` kapılı yüzeyde kalsın.

**Genel kural:** bir snapshot birleştiricisi, birleştirdiği her dilimin capability'sini bilmek zorunda. Bunu bir kez yapıp yeni dilim eklendiğinde unutulmaması için birleştiriciyi dilim→capability tablosu üzerinden çalıştır.

### 2. Moderatör tüm yöneticileri atabiliyor

`apps/web/src/lib/workspace/member-service.ts:556`, `:87` · `apps/web/src/lib/workspace/permissions.ts:97`

`kickWorkspaceMember` yalnız sahibi koruyor; aynı dosyadaki rol düzenleme `isProtectedRole` kontrolü yapıyor. `MODERATOR_PERMISSIONS` `KICK_MEMBERS` içeriyor.

Yap: kick yolunda hedefin rollerini yükle ve rol düzenlemedeki **aynı** reddi uygula. İki koşulu ayrı yazma — ortak bir `assertCanActOnMember` çıkar, iki çağıran onu kullansın.

### 3. İki "yükseltilmiş izin" listesi ayrışmış

`apps/web/src/lib/workspace/role-helpers.ts:21` · `apps/web/src/lib/workspace/permissions.ts:77`, `:173`

`ELEVATED_ROLE_PERMISSIONS` üç bit, `ADMIN_ACCESS_PERMISSIONS` dört bit (`MANAGE_CHANNELS` fazladan). Sahip olmayan bir `MANAGE_ROLES` sahibi, yalnız `MANAGE_CHANNELS` taşıyan bir rol üretip atayabiliyor; o rol korumalı sayılmıyor ama sahibi `ADMIN` erişim seviyesine çıkıyor.

Yap: `ELEVATED_ROLE_PERMISSIONS` `ADMIN_ACCESS_PERMISSIONS`'ı yeniden kullansın. Tek liste, iki tüketici.

### 4. İzin cache'i bayat revizyonla damgalıyor

`apps/web/src/lib/workspace/permission-cache.ts:521` · `permission-service.ts:381`, `:409`

Snapshot, izinler DB'den okunduktan **sonra** okunan revizyonla damgalanıyor. Aradaki bir yetki iptali eziliyor ve taze sayılıyor: iptal edilen `VIEW_CHANNEL`/`SEND_MESSAGES` 45 sn'ye (ayrıcalıklı bitler için 15 sn) kadar çalışıyor.

Yap: revizyon anahtarlarını **DB okumasından önce** örnekle ve yazma çağrısına geçir; yazarken versiyon ilerlemişse snapshot'ı at.

### 5. Kanal reaksiyonu yalnız `VIEW_CHANNEL` istiyor

`apps/web/src/lib/socket/handlers/message.ts:499`, `:523` · `apps/web/src/lib/socket/channel-membership.ts:6`

Kilitli/salt-okunur duyuru kanalında okuyabilen herkes reaksiyon ekleyebiliyor. DM yolu bunu bilerek tersine yapıyor: "reaksiyon konuşmaya katkıdır, gönderimin izniyle aynı kapıdan geçer".

Yap: iki reaksiyon handler'ında `ensureChannelMembership` yerine `requireChannelPermissionForUser(..., SEND_MESSAGES, { respectLocked: true })`.

## Yapılmayacak

- Yeni rol, yeni capability, yeni izin biti.
- Admin arayüzü yeniden düzenleme.
- İzin cache'inin TTL'lerini değiştirme — sorun tazelik değil, damgalama sırası.
- Yeni bir "yetki servisi" katmanı.

## Kabul kriterleri

1. `ANALYST` panosunda e-posta ve `ipHash` yok; `OWNER`da var.
2. Moderatör, korumalı rol taşıyan üyeyi atamıyor.
3. `MANAGE_CHANNELS` yalnız-bit rolü, sahip olmayan biri tarafından üretilemiyor **veya** korumalı sayılıyor (tek liste hangisini gerektiriyorsa).
4. DB okuması ile yazma arasında revizyon ilerlerse snapshot yazılmıyor.
5. Kilitli kanalda reaksiyon reddediliyor.

## Testler

- Snapshot birleştirici: rol → dilim matrisi tablo testi.
- `assertCanActOnMember`: sahip / korumalı rol / sıradan üye üçlüsü.
- Revizyon yarışı: enjekte edilmiş revizyon okuyucusu okuma ile yazma arasında değer değiştirsin, snapshot yazılmasın.
- Reaksiyon: kilitli kanalda ret.

## Doğrulama

```bash
pnpm --filter @wizards/web typecheck
```

```bash
pnpm --filter @wizards/web test
```
