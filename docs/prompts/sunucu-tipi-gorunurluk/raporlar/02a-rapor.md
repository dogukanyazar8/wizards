# 02a — S2 Bölüm A + Bölüm B raporu

Tarih: 2026-08-07. Dal: `uat`. Commit yok, `git add` yok — iş çalışma ağacında.

Kapsam: yalnız **Section A** (sunucu profil uçları) ve **Section B** (paylaşılan saf sunum
modeli). Section C (web kartı), D (mobil ekran), E (kopya metinleri) bu pasoya dahil değil —
başlanmadı.

---

## 1. Teslim listesine karşılık

### Section A — Uçlar

**Paylaşılan erişim kuralı (iki uç tarafından da kullanılıyor, tek yerde):**
`apps/web/src/lib/servers/server-public-profile-service.ts`'e iki yeni fonksiyon eklendi:

```ts
export async function getVisibleServerPublicProfileWithDatabase(
  database: PrismaClient,
  serverId: string,
  viewerId: string | null,
): Promise<ServerPublicProfile>;

export async function getVisibleServerPublicProfile(
  serverId: string,
  viewerId: string | null,
): Promise<ServerPublicProfile>;
```

Mevcut `getServerPublicProfileWithDatabase`'i **sarmalıyor**, içini değiştirmiyor:
`isPublic`/`discoverable`/`joined` zaten dönen `ServerPublicProfile`'ın alanları olduğu için
ekstra sorgu gerekmiyor — profil bir kez çekiliyor, üç alan kontrol ediliyor, uygun değilse
`ApiError("Server not found", 404, "SERVER_NOT_FOUND")` fırlatılıyor (mevcut "sunucu hiç yok"
koluyla **birebir aynı** hata — ayırt edilemez, sızıntı yok).

Temel fonksiyonun içine gömmedim çünkü `getServerPublicProfileWithDatabase` aynı zamanda davet
önizlemesinin (`mobile-invite-preview-service.ts`) kaynağı: özel, keşfedilemez bir sunucu geçerli
bir davet koduyla önizlenebilir kalmalı, üç koşuldan hiçbiri sağlanmasa bile. Kapıyı temel
fonksiyona koysaydım davet önizlemesi sessizce kırılırdı.

**Uçlar:**

| Rota                                            | Dosyalar                                            | Auth                                                                      | Rate limit action       |
| ----------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------- |
| `GET /api/v1/servers/[serverId]/profile`        | `route.ts`, `route-logic.ts`, `route-logic.test.ts` | Oturum **opsiyonel** (`auth()` doğrudan okunur, `requireApiUserId` değil) | `server:profile`        |
| `GET /api/v1/mobile/servers/[serverId]/profile` | `route.ts`, `route-logic.ts`, `route-logic.test.ts` | Bearer **zorunlu** (`authorizeMobileApiRequest`)                          | `mobile:server:profile` |

İkisi de `getVisibleServerPublicProfile` çağırıyor, `ServerPublicProfileSchema.parse(...)` ile
doğrulanmış aynı gövdeyi dönüyor — sarmalama yok, alan eklemesi yok.

**Rate limit kaydı** — kapalı union `api-rate-limit.ts`'e iki eylem eklendi:

```ts
"server:profile": { limit: 240, windowSeconds: 60 },        // server:detail ile aynı bütçe
"mobile:server:profile": { limit: 120, windowSeconds: 60 }, // mobile:server:detail ile aynı bütçe
```

### Section B — Paylaşılan sunum modeli

Yeni dosya: `packages/types/src/server-profile-presentation.ts` (+ `.test.ts`), barrel'a eklendi
(`index.ts`). Zod şeması yok — dört saf fonksiyon, dört tip. Tam imzalar §3'te.

- Sayı biçimlendirme (`formatServerProfileCount`) — 2g'nin iki örneğiyle birebir: `12400 tr →
"12,4B"`, `1200 tr → "1,2B"`, `en → "12.4K"/"1.2K"`.
- Kanal rozeti (`resolveServerProfileChannelBadge`) — 2g'nin KANALLAR listesindeki 4 satırın
  hepsi ayrı test: `duyurular` (salt okunur), `yol-haritası` (CANLI, `liveCount===0`),
  `beta-geri-bildirim` (**rozet yok**, `null`), `topluluk-sesli` (`14 kişi`).
- Arkadaş yığını (`resolveServerProfileFriendStack`) — en çok 4 avatar, taşma `mutualFriendCount`
  gerçek toplamından hesaplanıyor (tasarımın 3 avatar + "+9" = "12 kişi" örneğiyle test edildi).
- Katılma düğmesi (`resolveServerProfileJoinAction`) — `joined ? "Sunucuya git" : "Sunucuya
katıl"`.

---

## 2. Test sonuçları — gerçek komut çıktısı

### Section B, odaklı

```
$ cd packages/types && node --import tsx --test "src/server-profile-presentation.test.ts"
▶ formatServerProfileCount (5 test) ✔
▶ resolveServerProfileChannelBadge (3 test) ✔
▶ resolveServerProfileFriendStack (4 test) ✔
▶ resolveServerProfileJoinAction (2 test) ✔
ℹ tests 14 ℹ pass 14 ℹ fail 0
```

### Section A servis katmanı, odaklı

```
$ cd apps/web && node --import tsx --test "src/lib/servers/server-public-profile-service.test.ts"
▶ buildServerPublicProfile (6 test) ✔  [mevcut, dokunulmadı]
▶ getVisibleServerPublicProfileWithDatabase (6 test) ✔  [yeni]
ℹ tests 12 ℹ pass 12 ℹ fail 0
```

### Web + mobil route-logic, odaklı (köşeli parantez kaçışıyla, `00 §5`)

```
$ node --import tsx --test "src/app/api/v1/servers/[[]serverId[]]/profile/route-logic.test.ts"
✔ resolves the viewer, rate limits by their id, and returns the profile
✔ passes a null viewerId through to the profile lookup when there is no session
✔ rate limits an anonymous caller by a hashed client identity, not a shared key
✔ returns 404 when the server is hidden from this viewer
✔ stops at the rate limit before reading route params
ℹ tests 5 ℹ pass 5 ℹ fail 0

$ node --import tsx --test "src/app/api/v1/mobile/servers/[[]serverId[]]/profile/route-logic.test.ts"
✔ authorizes, resolves params, and returns the profile as the viewer
✔ returns 404 when the server is hidden from this viewer
✔ rejects an unauthenticated request before reading params
✔ rejects a malformed serverId param
ℹ tests 4 ℹ pass 4 ℹ fail 0
```

### Sözleşme testleri — üç kapalı liste bulundu ve güncellendi (bkz. §4)

```
$ node --import tsx --test "src/app/api/v1/route-contract.test.ts"
ℹ tests 25 ℹ pass 25 ℹ fail 0

$ node --import tsx --test "src/lib/api-rate-limit.test.ts"
ℹ tests 7 ℹ pass 7 ℹ fail 0
```

### `pnpm --filter @wizards/types test`

```
ℹ tests 193
ℹ suites 34
ℹ pass 193
ℹ fail 0
```

Section B'nin 14 testi bu 193'ün içinde (`formatServerProfileCount`, `resolveServerProfile*`
suite'leri).

### `pnpm --filter @wizards/web typecheck`

İlk koşum **kırmızıydı**, ama benim değil: `apps/web/src/app/api/v1/mobile/dm/[conversationId]/route-logic.ts`
(eşzamanlı grup-DM işinin uncommitted, `git status`'ta `??` görünen dosyası)
`"mobile:dm:hide"`/`"mobile:dm:mute"` eylemlerini `api-rate-limit.ts`'e hiç kaydetmeden
kullanıyordu. Ben `apps/web/src/lib/dm/**`'e dokunmadım (yasak), bu dosya da o kapsamın parçası
olduğu için elle düzeltmedim. Oturum sırasında eşzamanlı bir ajan bu iki eylemi kendi
`api-rate-limit.ts` düzenlemesiyle kaydetti (harness bunu "kullanıcı ya da linter değiştirdi"
diye bildirdi) ve typecheck kendiliğinden temizlendi:

```
$ pnpm --filter @wizards/web typecheck
$ node ../../scripts/quality/typescript-project-runner.mjs --project=web --mode=check
EXIT_CODE=0
```

Benim payıma düşen tek gerçek typecheck hatası: `route-logic.test.ts`'teki `context()` yardımcısı
`Record<string, string>` dönüyordu, ama web ucu `{ serverId: string }` gibi dar tipli (kardeş
rota `servers/[serverId]/route.ts` deseni). Yardımcının imzasını `{ serverId: string }`'e
daralttım, çalışma zamanı davranışı değişmedi.

### Tam web süiti (`pnpm --filter @wizards/web test`) — sonunda, bir kez

```
ℹ tests 1933
ℹ suites 437
ℹ pass 1933
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
EXIT_CODE=0
```

İki ayrı koşumda da 1933/1933 yeşil. `00 §5`'in bahsettiği bilinen kırmızı
(`apps/web/src/lib/dm/group-service.test.ts`) bu koşumlarda kırmızı görünmedi — muhtemelen
eşzamanlı oturum bu turda tutarlı bir noktadaydı; her hâlükârda benim değişikliklerim sıfır
başarısızlığa neden olmadı.

**Kapı komutu (`Invoke-LocalGate.ps1`) koşulmadı** — atama metnindeki "Doğrula" listesi
bunun yerine yukarıdaki odaklı komutlar + `pnpm --filter @wizards/types test` +
`pnpm --filter @wizards/web typecheck` + tam web süitini istedi; onu birebir izledim.

---

## 3. Devir sözleşmesi — Section C/D'nin import edeceği tam ad ve imzalar

**HTTP:**

- `GET /api/v1/servers/[serverId]/profile` → 200 gövdesi `ServerPublicProfileSchema`,
  oturumsuz erişilebilir, 404 = "yok ya da görünmez" (ayırt edilemez).
- `GET /api/v1/mobile/servers/[serverId]/profile` → aynı gövde, Bearer zorunlu.

**`packages/types/src/server-profile-presentation.ts`** (barrel'dan `@wizards/types` ile erişilir):

```ts
export type ServerProfileLocale = "tr" | "en";
export function formatServerProfileCount(value: number, locale: ServerProfileLocale): string;

export type ServerProfileChannelBadge =
  | { readonly kind: "read-only"; readonly label: string }
  | { readonly kind: "live"; readonly label: string }
  | { readonly kind: "live-count"; readonly count: number; readonly label: string }
  | null;
export function resolveServerProfileChannelBadge(channel: {
  readonly liveCount: number | null;
  readonly readOnly: boolean;
  readonly type: "text" | "voice";
}): ServerProfileChannelBadge;
// channel doğrudan bir ServerPublicProfileChannel geçilebilir (fazladan alanlar yok sayılır).

export type ServerProfileFriendStack = {
  readonly caption: string;
  readonly overflowCount: number;
  readonly visible: readonly ServerPublicProfileFriend[]; // en çok 4
};
export function resolveServerProfileFriendStack(
  mutualFriends: readonly ServerPublicProfileFriend[],
  mutualFriendCount: number,
): ServerProfileFriendStack | null; // 0 arkadaşta null — kart hiç render edilmez

export type ServerProfileJoinAction = { readonly kind: "go" | "join"; readonly label: string };
export function resolveServerProfileJoinAction(joined: boolean): ServerProfileJoinAction;
```

**`apps/web/src/lib/servers/server-public-profile-service.ts`** (yalnız web tarafı, Section C'nin
route.ts'i bunu import edebilir — mobil zaten HTTP üzerinden tüketiyor):

```ts
export async function getVisibleServerPublicProfile(
  serverId: string,
  viewerId: string | null,
): Promise<ServerPublicProfile>;
export async function getVisibleServerPublicProfileWithDatabase(
  database: PrismaClient,
  serverId: string,
  viewerId: string | null,
): Promise<ServerPublicProfile>;
```

---

## 4. Sapmalar

1. **Web ucu oturumsuz erişime açık, `requireApiUserId` değil `auth()` doğrudan okunuyor.**
   Prompt'un "Oturum varsa viewerId geçilir, yoksa null" cümlesini birebir uyguladım — mobil
   satırı ("Bearer oturumu") kasıtlı farklı yazılmış, bu asimetriyi gerçek kabul ettim.
   Sonucu: `route-contract.test.ts`'in `UNAUTHENTICATED_ROUTE_PATHS` kapalı listesine
   `"servers/[serverId]/profile"` eklemem gerekti (yorumla gerekçelendirildi). Anonim
   istekler `createClientRateLimitIdentity` (mevcut, OTA manifest'in de kullandığı yardımcı)
   ile IP tabanlı, kullanıcı bazlı olmayan bir kovaya rate-limitleniyor.

2. **İki ek kapalı liste bulundu, `00`'da adı geçmiyordu ama testler kırmızıya döndü:**
   `apps/web/src/lib/api-rate-limit.test.ts`'teki `M1_MOBILE_RATE_LIMITS` sabiti (Faz 4
   "reviewed limit and window" kilidi) ve `route-contract.test.ts`'in kendi
   `EXPECTED_M1_RATE_LIMIT_MAPPINGS` sayacı — ikisi de `"mobile:server:"` önekli her eylemi
   süpürüyor. `"mobile:server:profile"` ismi bu önekle eşleştiği için ikisine de kayıt
   eklemek ve sabit sayıyı (28→29, iki ayrı dosyada) güncellemek zorunda kaldım. Bunu
   varsayımla değil, testleri koşturup kırmızı görerek buldum.

3. **`getVisibleServerPublicProfileWithDatabase` mevcut fonksiyonu sarmalıyor, içine
   gömülmedi.** Gerekçe §1'de: davet önizlemesini kırmamak.

4. **Section B'nin kanal rozeti/arkadaş altyazısı/katılma metni yalnızca Türkçe döner —
   sayı biçimlendirici hariç, iki dilli değil.** Promptun ilgili üç maddesi yalnız Türkçe
   hedef metin veriyordu (`"salt okunur"`, `"CANLI"`, `"Arkadaşlarından N kişi bu sunucuda"`,
   `"git"/"katıl"`); yalnız sayı biçimlendirme maddesi açıkça "İngilizce karşılığı K" diyordu.
   Bunu literal okudum: `formatServerProfileCount` `locale` parametresi alıyor, diğer üçü
   almıyor ama `kind` ayrımcısını (`"read-only"|"live"|"live-count"`, `"go"|"join"`) da
   döndürüyor — Section E ileride İngilizce metni `kind`'a göre bağlayabilir, `label`'ı
   görmezden gelmesi hiçbir şeyi kırmaz. Bu, "component içinde if zinciri yazma" kısıtını
   hem TR hem gelecekteki EN için karşılıyor.

5. **`graphify update .` koşulmadı.** Kök `CLAUDE.md` bunu her kod değişikliğinden sonra ister,
   ama bu görevin bağlayıcı kısıtları `graphify-out/**`'a **dokunmayı yasaklıyor** (eşzamanlı
   işler orayı da yazıyor). Daha spesifik, bu görev için verilen kısıtı genel kurala tercih
   ettim ve atladım.

6. **Server-Timing eklenmedi.** `route-contract.test.ts`'in "keeps Server-Timing on the reads
   a slow client complains about" testi yeni rotamı zorunlu kılmıyor (sabit listede yok);
   promptun "Teslim" maddelerinde de geçmiyor, eklemedim.

---

## 5. Eklenmeyenler

- **Section C (web kartı), D (mobil ekran), E (kopya metinleri)** — göreve göre kapsam dışı,
  başlanmadı. `apps/mobile/**`'e hiç dokunulmadı (git status ile doğrulandı).
- **İngilizce rozet/arkadaş/buton metni** — §4.4'te gerekçelendirildi; yalnız `kind` + Türkçe
  `label` var.
- **`Invoke-LocalGate.ps1` kapı komutu** — atama metninin "Doğrula" listesi bunun yerine somut
  komutlar verdi, onlar koşuldu (bkz. §2).
- **Web kartı için ekran görüntüsü / mobil emülatör karşılaştırması** — `02` promptunun kendi
  "Kapı" bölümünde istenen kanıt; Section C/D henüz yok, görsel karşılaştırılacak bir ekran yok.

---

## 6. Bilinen boşluklar / dikkat

- Anonim web isteklerinde `x-real-ip` başlığı yoksa (yerel geliştirme, ters proxy'siz ortam)
  `createClientRateLimitIdentity` sabit bir `fallback:...` anahtarına düşer — yani gerçek IP
  başlığı olmayan tüm anonim istekler TEK kovayı paylaşır. Prod'da ters proxy `x-real-ip`
  koyduğu sürece bu sorun değil (bkz. `getTrustedClientIp`).
- Section C/D bu ucu tükettiğinde `mutualFriends` sırası servis katmanından geliyor
  (`updatedAt desc`) — `resolveServerProfileFriendStack` sırayı değiştirmiyor, ilk 4'ü alıyor.
- Bu oturum sırasında `route-contract.test.ts` ve `api-rate-limit.ts` eşzamanlı bir DM-grup
  oturumu tarafından da düzenleniyordu (canlı, aynı anda). Kendi eklemelerim doğru konumda
  kaldı ve testler yeşil, ama Section C/D'yi uygulayacak pasoların bu iki dosyayı tekrar
  okuyup kendi eklerini doğru yerden yapması gerekecek — dosyalar artık bu raporda
  gösterilenden farklı görünebilir.
