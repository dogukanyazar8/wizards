# Ş3 — Davet: QR, hedefli davet, bekleyen davetler

> Dalga 1. Kaynak: `docs/prompts/whispr-sunucu/04-dalga1-s3-davet-api.md`.
> Otorite: `design_handoff/design_handoff_sunucu/design/Sunucu.dc.html` inline `style` + veri
> dizileri > `SPEC-SUNUCU.md` > `PROMPT.md`. Bağımlılık: Ş0. Dal: `uat`. Tarih: 2026-08-25.
>
> **UI yazılmadı.** Pencere Ş9'un, ayarlar bölümü Ş13'ün. `workspace-modals.tsx` ve
> `server-settings-overlay.tsx`'e yalnız iki **istemci yardımcı adı** yeniden adlandırıldığı
> için dokunuldu (tek satır import + tek satır çağrı, her dosyada bir tane).

---

## 0. Şeride başlarken bulunan gerçek — mobil dal daveti çoktan bitirmiş

Prompt "yeni tablo ve yeni paket yok" diyordu; gerçek bundan da ileride çıktı. Web dalında
hedefli davet, bekleyen davet ve QR'ın **hiçbiri** yoktu, ama mobil dal üçünü de uçtan uca
yazmış ve `invite-service.ts` içinde bırakmış:

| Hazır olan                                                                                                                     | Nerede                  | Ş3 ne yaptı                                                   |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------- | ------------------------------------------------------------- |
| `createTargetedServerInvite` (mobil sözleşme: sabit 7 gün + tek kullanım, **arkadaşlık kontrolü yok**, açık davet varsa `409`) | `invite-service.ts`     | Dokunulmadı; web için ayrı yol yazıldı (§2.1)                 |
| `notifyTargetedServerInvite` — `SERVER_INVITE` bildirimi + soket + mobil push                                                  | `invite-service.ts`     | **Aynen kullanıldı**; yeni bildirim tipi uydurulmadı          |
| `clearTargetedInviteNotifications`                                                                                             | `invite-service.ts`     | Kabul/ret dışında **iptalde de** kullanılmaya başlandı (§3.9) |
| `isLiveInvite` / `selectActiveLinkInvite`                                                                                      | `invite-selection.ts`   | Aynen kullanıldı                                              |
| `buildMobileServerInviteQrCode` (**sunucu tarafı** data-URL, `qrcode` paketiyle)                                               | `invite-service.ts`     | Yerinde bırakıldı; web QR'ı istemcide üretiliyor (§3.5)       |
| `qrcode@1.5.4` + `@types/qrcode@1.5.6`                                                                                         | `apps/web/package.json` | Yeni paket eklenmedi                                          |

Yani Ş3'ün gerçek işi "sıfırdan yazmak" değil, **web sözleşmesini mobilin ulaştığı yere
çekmek** ve iki dalın bilerek ayrıştığı üç noktayı kayda geçirmek oldu.

---

## 1. Ne yapıldı

### 1.1 Yeni dosyalar

| Dosya                                 | Satır | İş                                                       |
| ------------------------------------- | ----- | -------------------------------------------------------- |
| `apps/web/src/lib/invites/qr.ts`      | 193   | İstemci tarafı QR (`renderInviteQr`) + token→hex çevrimi |
| `apps/web/src/lib/invites/qr.test.ts` | 215   | 16 test (üretim + 4 ayrı hata yolu + gerçek paket yolu)  |

### 1.2 Düzenlenen dosyalar

| Dosya                                                                   | Ne değişti                                                                                                                                                                             |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/types/src/workspace.ts`                                       | `CreateServerInviteSchema`, `ServerPendingInviteSchema`, `ServerPendingInviteUserSchema`, `ServerPendingInvitesResponseSchema`, `WorkspaceInvitesResponseSchema` + 5 tip dışa aktarımı |
| `packages/types/src/mobile-workspace-management.ts`                     | `MobileServerInviteSchema.targetUserId` **opsiyonel** (K10)                                                                                                                            |
| `packages/types/src/workspace.test.ts`                                  | 5 kapsam kaydı + 6 süre/6 kullanım çipinin sözleşme testi + hedef alanı testleri                                                                                                       |
| `apps/web/src/lib/workspace/invite-service.ts`                          | `resolveInviteChannelId`, `ensureInviteCreationAllowed`, `createTargetedWorkspaceInviteRecord`, `listPendingWorkspaceInvites`; `revokeWorkspaceInvite` bildirim temizliği (+283 satır) |
| `apps/web/src/lib/workspace/invite-service.test.ts`                     | 19 yeni test (`createWorkspaceInvite` 6, hedefli davet 6, bekleyen 4, iptal 2 — dosya 579 → 1202 satır)                                                                                |
| `apps/web/src/lib/workspace/invite-selection.ts`                        | `toMobileServerInvite` artık `targetUserId` geçiriyor (K10)                                                                                                                            |
| `apps/web/src/app/api/v1/servers/[serverId]/invites/route.ts`           | **GET** eklendi (`?pending=1`), POST gövdesi `CreateServerInviteSchema`                                                                                                                |
| `apps/web/src/lib/api-rate-limit.ts`                                    | `invite:list` kovası (60/60 sn — okuma bütçesi)                                                                                                                                        |
| `apps/web/src/app/api/v1/route-contract.test.ts`                        | `GET servers/[serverId]/invites` → `invite:list` eşlemesi kilitlendi                                                                                                                   |
| `apps/web/src/lib/workspace/client.ts`                                  | `createServerInvite`, `fetchServerInvites({ pending })`, `revokeServerInvite`                                                                                                          |
| `apps/web/src/lib/workspace/service.test.ts`                            | Ş3'ün genişlettiği sözleşme için karakterizasyon testi güncellendi                                                                                                                     |
| `.../mobile/servers/[serverId]/invites/route-logic.test.ts`             | 4 tam-şekil beklentisine `targetUserId` eklendi (K10 sonucu)                                                                                                                           |
| `components/shell/workspace-modals.tsx` · `server-settings-overlay.tsx` | Yalnız yeniden adlandırma (`createInviteRequest`→`createServerInvite`, `revokeInviteRequest`→`revokeServerInvite`)                                                                     |

### 1.3 Uç sözleşmesi (son hâli)

```
POST   /api/v1/servers/[serverId]/invites
       { channelId?, expiresInHours?, maxUses?, targetUserId? }  ->  201 WorkspaceInvite
GET    /api/v1/servers/[serverId]/invites            ->  { invites: WorkspaceInvite[] }
GET    /api/v1/servers/[serverId]/invites?pending=1  ->  { invites: ServerPendingInvite[] }
DELETE /api/v1/servers/[serverId]/invites/[inviteId] ->  { success: true }   (değişmedi)
```

Çipler (`Sunucu.dc.html:2660-2661`, satır satır okundu — tahmin yok):

| Grup                      | Değerler                         | Varsayılan (`dc.html:1835`) |
| ------------------------- | -------------------------------- | --------------------------- |
| Süre → `expiresInHours`   | `1 · 12 · 24 · 168 · 720 · null` | `168` (`7 gün`)             |
| Kullanım → `maxUses`      | `1 · 5 · 25 · 100 · 1000 · null` | `25`                        |
| Hedef kanal → `channelId` | sunucunun yazı kanalları         | ilk yazı kanalı             |

`null` iki alanda da `Süresiz`/`Sınırsız`. Altısı da `CreateServerInviteSchema`'dan geçiyor ve
`workspace.test.ts` on iki değeri tek tek doğruluyor.

---

## 2. Bilerek ayrışan iki sözleşme (web ↔ mobil)

### 2.1 Hedefli davet iki ayrı yolda

| Konu             | Mobil (`createTargetedServerInvite`) | Web (`createTargetedWorkspaceInviteRecord`)    |
| ---------------- | ------------------------------------ | ---------------------------------------------- |
| Arkadaşlık       | **Kontrol edilmiyor**                | **Zorunlu**, değilse `400 NOT_FRIENDS` (Ş3 §2) |
| Süre / kullanım  | Sabit 7 gün · 1 kullanım             | Çiplerden                                      |
| Açık davet varsa | `409 INVITE_ALREADY_PENDING`         | **Mevcut davet döner** (Ş3 §2)                 |
| Uç               | `POST .../invites/targeted`          | `POST .../invites` gövdesinde `targetUserId`   |

İkisi tek fonksiyona indirilmedi: mobil "Davet et" sayfası zaten arkadaş listesinden seçtiriyor
(kontrol UI'da), web penceresi ise serbest hedef alabiliyor; ve `409` mobil sayfanın
"Gönderildi" durumunu sürdüren kasıtlı bir sinyal. Ortak olan **yazma sonrası** kısım
(`notifyTargetedServerInvite`) tek yerde kaldı.

### 2.2 `targetUserId` neden `CreateInviteSchema`'ya konmadı

`MobileServerInviteCreateRequestSchema = CreateInviteSchema.extend({...}).strict()`. Alan tabana
konsaydı **mobilin düz bağlantı ucu da** hedefli davet kabul etmeye başlardı — ve o uç
arkadaşlık kontrolü yapmıyor. Bu yüzden yeni `CreateServerInviteSchema` tabanı sarıyor, hedef
alanını `TargetedInviteSchema.shape.targetUserId`'den alıyor (alan tanımı kopyalanmadı).

---

## 3. SPEC'ten sapmalar

1. **Bekleyen davet satırı kanal _adını_ değil `channelId`'yi taşıyor.** SPEC §8.7 satırda
   "kanal" istiyor; `WorkspaceInvite` bugüne kadar da yalnız `channelId` taşıdı ve mevcut davet
   listesini çizen yüzey adı sunucu detayındaki kanal listesinden çözüyor. Satıra ad koymak
   aynı gerçeğin ikinci kaynağı olurdu. Ş9/Ş13 adı detaydan çözer.
2. **"Kalan süre" sunucuda hesaplanmıyor.** Satır `expiresAt` taşıyor, `6 gün` metnini istemci
   üretiyor — mevcut davet listesi de böyle çalışıyor ve iki formatlayıcı istemezdik.
3. **Bekleyen ölçütü `isLiveInvite`'tan dar.** Prompt "kullanılmamış" diyor, bu yüzden filtre
   `uses = 0`. `isLiveInvite` "koltuk kaldı mı"ya bakar; 25 kullanımlık hedefli bir davet bir
   kez kullanıldıktan sonra teknik olarak canlıdır ama artık **bekleyen** değildir. Aynı hedefe
   ikinci davet üretmeme kontrolü ise `isLiveInvite` kullanıyor (orada soru "hâlâ kullanılabilir
   mi").
4. **`renderInviteQr(canvas, url, { theme })`'in `theme`'i `"light" | "dark"` birleşimi değil**,
   `{ foregroundToken, backgroundToken, scope }` nesnesi. Tema zaten token'ın kendi değerinde;
   kip adını ikinci kez taşımak bayatlayabilecek bir kopya olurdu. Farklı palet altında çizmek
   isteyen o paleti taşıyan öğeyi `scope` verir.
5. **QR kutu ölçüsü `SERVER_METRICS`'e girmedi.** Tasarımda QR'ın ölçüsü **yok** — referansta
   yalnız kesikli bir `QR kod` çipi var (`Sunucu.dc.html:1629`) ve K3 onu kaldırıyor. Ölçü
   uydurmak yerine `qr.ts` yedek değer taşıyor (`256` / `margin 1`), gerçek kutuyu çağıran
   geçiriyor. Ş9/Ş13 ölçüyü kendi sözlüğünden vermeli.
6. **QR rengi hex olarak _üretiliyor_, gömülü değil.** `qrcode` paketi `color.dark`/`color.light`
   için yalnız hex kabul ediyor (`@types/qrcode`: "Value must be in hex format (RGBA)"),
   `hsl(...)` dizesi geçmiyor. Bu yüzden `--foreground` / `--surface-card` çalışma anında
   okunup `hslToHex` ile çevriliyor. Kodda tek bir renk sabiti yok; token okunamazsa çizim
   **iptal** ediliyor (uydurulmuş varsayılan yok) ve bu test ediliyor.
7. **Varsayılan kanal yedeği genişletildi.** Eski sorgu `parentId: null` filtresi taşıyordu, yani
   yalnız kategorisiz kanalları görüyordu; bütün yazı kanalları kategorilenmiş bir sunucuda davet
   **kanalsız** oluşuyordu. SPEC'in çip listesi (`# welcome-chat` … `# dokumanlar`) kategorili
   kanalları da içeriyor, filtre kaldırıldı. Bu değişiklik mobil davet ucunu da etkiler.
8. **Verilen `channelId` artık yazı kanalı olmak zorunda.** Eski kontrol yalnız "bu sunucunun
   kanalı mı" diyordu; ses kanalı da kabul ediliyordu.
9. **`revokeWorkspaceInvite` hedefin bildirimini temizliyor.** Prompt §3 "iptal mevcut ucu
   kullanır" diyor ve uç değişmedi, ama hedefli davetin **tek girişi** bildirimidir: satır silinip
   bildirim bırakılsaydı hedef "Katıl"a basıp 404 alırdı. Kabul ve ret yollarının ikisi de zaten
   `clearTargetedInviteNotifications` çağırıyordu; iptal de çağırıyor. Mobil iptal ucu da aynı
   servisi kullandığı için bu düzeltme iki istemcide birden geçerli.
10. **`POST` yanıtı `{ code }`'dan tam `WorkspaceInvite`'a genişledi.** Hedefli davet satırı tek
    yanıtta kod + hedef + süre + kullanım istiyor. `code` yerinde durduğu için eski çağıran
    kırılmıyor; `service.test.ts`'in "byte-compatible" karakterizasyon testi yeni sözleşmeye
    güncellendi (adı da değişti).
11. **`allowMemberAdds` kapısı davete de kondu.** SPEC §8.6'nın anahtarı bugüne kadar yalnız
    `member-service.ts`'in "üye ekle" yolunda uygulanıyordu; `MANAGE_INVITES` taşıyan düz üye
    anahtar kapalıyken bile davet üretebiliyordu. İki yol artık `canAddMembers`'a bakıyor.

Renk/ölçü sapması **yok**: Ş3 hiç UI yazmadı, sözlüğe ölçü eklemedi, `globals.css`'e dokunmadı.

---

## 4. TODO(api)

| #   | Ne eksik                                                                                                                                                                                                                                                                                                                                                           | Kimde                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| 1   | **Kullanım sayacı canlı güncellenmiyor.** Prompt §5 "mevcut soket akışıyla; yeni olay yok" diyor, ama düz bir bağlantı harcandığında (`joinWorkspaceServerByInvite`) davet yöneticisine **hiçbir şey** gitmiyor. `server:settings:updated` yalnız hedefli davetin kabul/ret'inde ve yalnız **davet edene** atılıyor. `3 / 25` çipi ancak yeniden okumayla değişir. | Ş13 (karar: ya mevcut `server:settings:updated`'ı sunucu odasına genişlet, ya çipi pasif kabul et) |
| 2   | `?pending=1`'in mobil karşılığı yok. Mobil bekleyenleri `invites/sheet` içinde döndürüyor; K10 gereği mobil ekran değişmedi.                                                                                                                                                                                                                                       | Kapsam dışı                                                                                        |
| 3   | Web'de QR sunucu ucu **yok ve olmayacak** (Ş3 §4). Mobil `invites/[inviteId]/qr` ucu yerinde.                                                                                                                                                                                                                                                                      | —                                                                                                  |
| 4   | `renderInviteQr` gerçek kutu ölçüsünü çağırandan bekliyor (bkz. §3.5).                                                                                                                                                                                                                                                                                             | Ş9 · Ş13                                                                                           |
| 5   | Hedefli davet `targetUserId` mobil davet listesinde artık **görünür** ama mobil ekran onu çizmiyor (K10).                                                                                                                                                                                                                                                          | Mobil paketi                                                                                       |
| 6   | `server-parity.spec.ts`'in davet yüzeyleri hâlâ `test.fixme`. Ş3 UI yazmadığı için açılamadı.                                                                                                                                                                                                                                                                      | Ş9 · Ş13 · Ş14                                                                                     |

---

## 5. Doğrulama çıktısı

| Komut                                    | Sonuç                                                             |
| ---------------------------------------- | ----------------------------------------------------------------- |
| `pnpm --filter @wizards/types test`      | ✅ **526 test**, 0 fail (Ş0 sonrası taban 524)                    |
| `pnpm --filter @wizards/db test`         | ✅ **146 test**, 0 fail                                           |
| `pnpm --filter @wizards/types typecheck` | ✅                                                                |
| `pnpm --filter @wizards/web typecheck`   | ✅                                                                |
| `pnpm --filter mobile typecheck`         | ✅ (K10 alanı opsiyonel olduğu için mobil fixture'ları değişmedi) |
| `pnpm --filter @wizards/web lint`        | ✅ 10 config testi + `eslint .` temiz (exit 0)                    |
| `pnpm --filter @wizards/web test`        | **6510 test · 6506 geçti · 1 kırık** (bkz. aşağıda)               |

Şeridin kendi testleri tek tek de koşturuldu:

```
node --import tsx --test src/lib/invites/qr.test.ts                        16/16 ✅
node --import tsx --test src/lib/workspace/invite-service.test.ts          31/31 ✅  (Ş3 öncesi 12)
node --import tsx --test src/lib/workspace/invite-selection.test.ts        12/12 ✅
node --import tsx --test src/app/api/v1/route-contract.test.ts             25/25 ✅
node --import tsx --test .../mobile/servers/**/invites/route-logic.test.ts 18/18 ✅
```

### 5.1 Ş3'ün açtığı ve kapattığı 4 kırık

K10 alanı mobil davet **projeksiyonuna** girince üç mobil uç testi tam şekil eşitliğinde düştü;
dördüncüsü web `POST` yanıtının genişlemesiydi. Dördü de aynı commit'te güncellendi:

| Test                                                                           | Neden                                                    | Ne yapıldı                                                                       |
| ------------------------------------------------------------------------------ | -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `mobile server invite route logic` — GET · POST                                | `assert.deepEqual` beklentisi `targetUserId` taşımıyordu | Beklentiye `targetUserId: null` eklendi                                          |
| `mobile invite sheet route logic` — PUT                                        | aynı                                                     | `targetUserId: invite.targetUserId` eklendi                                      |
| `workspace service characterization` — `createWorkspaceInvite byte-compatible` | `{ code }` şekli kilitliydi                              | Yeni sözleşmeye güncellendi + `server.findUnique` yaması `where`'e göre dallandı |

### 5.2 Kalan tek kırık **Ş3'e ait değil**

```
✖ workspace member ban service > commits ban, persistent revision and outbox before cluster eviction
  actual:   { deletedMessageCount: 0, success: true, userId: 'target' }
  expected: { success: true, userId: 'target' }
```

`member-ban-service.ts` ban yanıtına `deletedMessageCount` ekledi; alan Ş2'nin üye ve moderasyon
şeridine ait (`ServerBanSchema.deleteMessageSeconds`, K3). Ş3 o dosyaya hiç dokunmadı, kapatması
Ş2'nin.

> **Not:** `node --test` bu depoda `--test-force-exit` olmadan tek dosya koşturulduğunda
> kapanmıyor (bir test açık handle bırakıyor); `pnpm test` bayrağı zaten geçiyor. Tek dosya
> koşturan sonraki şerit bayrağı elle eklemeli, yoksa "takıldı" sanır.

---

## 6. Sonraki şerit için notlar

1. **`createWorkspaceInvite` artık tam davet döndürüyor, `{ code }` değil.** Yeni çağıran
   `result.code` yazmaya devam edebilir; ama `Object.keys` üzerinden şekil doğrulayan bir test
   yazılırsa kırılır.
2. **Davet oluşturma iki ayrı `prisma.server.findUnique` yapıyor.** Biri kod benzersizliği için
   (`where.inviteCode`), biri `allowMemberAdds` bayrağı için (`where.id`). Yamalı testte tek
   dönüş değeri vermek yetmez — `where`'e bakıp dallanmak gerekiyor (`service.test.ts` ve
   `invite-service.test.ts` ikisi de bu düzeni kullanıyor).
3. **Hedefli davette arkadaşlık kontrolü bilerek en önde.** Sıra değiştirilirse uç bir kullanıcı
   **arama** aracına dönüşür: arkadaş olmayan biri "bu kimlik var mı" sorusunu 404 ↔ 400 farkından
   okur. Testi bunu kilitliyor (`checks friendship before it ever looks the target up`).
4. **`ServerPendingInviteSchema`, `WorkspaceInviteSchema`'nın üst kümesi.** Taban şemayla
   ayrıştıran istemci bekleyen listesini de okuyabilir; yeni alan eklenirse bu ilişki korunmalı.
5. **`WorkspaceInvitesResponseSchema` / `ServerPendingInvitesResponseSchema` istemcide
   `parse` ediliyor.** `client.ts`'teki diğer okumalarla aynı düzen; uç yanıtı sessizce
   değişirse hata orada çıkar.
6. **`invite:list` kovası okuma bütçesi (60/60 sn), oluşturma kovasından (20/10 dk) ayrı.**
   `route-contract.test.ts` `GET`'in bu eyleme bağlı kaldığını zorluyor; bekleyen listesi
   yenilendiğinde davet üretme hakkı yanmaz.
7. **Ş9 penceresi `fetchServerInvites(serverId, { pending: true })` çağırırken aşırı yükleme
   imzasına dikkat etmeli** — `pending` sabit `true` geçilmezse dönüş tipi düz davet listesi olur.
8. **QR yalnız `canvas` öğesiyle çalışır ve asla fırlatmaz.** `false` dönerse bağlantı satırı ve
   `Kopyala` düğmesi çalışmaya devam etmeli; "QR üretilemedi" diye hata yüzeyi çizilmemeli.
9. **K10 alanı mobil tarafta dört tam-şekil beklentisini düşürdü.** `toMobileServerInvite`'a alan
   eklemek, `assert.deepEqual` ile tam nesne karşılaştıran her mobil uç testini kırar. Mobil
   sözleşmeye alan ekleyen sonraki şerit önce
   `mobile/servers/[serverId]/invites/route-logic.test.ts` düzenini gözden geçirsin.
