# 03b — S3 boşluk kapatma

Önce `00-ortak-baglam.md` oku. `03`'ün kodu indi ve testleri yeşil, ama dört boşluk açık kaldı; ikisi özelliği yarım bırakıyor.

Bu prompt tek geçişte uygulanır. Sıra önemli: **1 ve 4 önce** (ikisi de `packages/types`), sonra **2 ve 3** (platform UI'ları) — çünkü 4'ün şema değişikliğini 3 tüketiyor.

---

## Boşluk 1 — mobil görünürlük kaydetmesi 400 dönüyor (bloke edici)

`packages/types/src/mobile-workspace-management.ts:212-220`:

```typescript
const hasMobileServerUpdate = (value: z.infer<typeof MobileServerUpdateFieldsSchema>) =>
  value.name !== undefined ||
  value.shortName !== undefined ||
  value.description !== undefined ||
  value.messageCharacterLimit !== undefined ||
  value.deletedMessageNoticeMinutes !== undefined ||
  value.allowGifs !== undefined ||
  value.allowFileUploads !== undefined ||
  value.allowMemberAdds !== undefined;
```

`isPublic` ve `discoverable` bu listede yok. Mobil ayarlar ekranındaki iki anahtar çiziliyor ama kaydetme `"validation.form.atLeastOne"` ile 400 dönüyor.

**Bu, aynı hata sınıfının üçüncü tekrarı.** S1'de `UpdateServerSchema.refine()` tam olarak bu iki alan için aynı şekilde bozuktu. Yüklem alanları tek tek sayıyor ve sözleşmeye alan eklenince güncellenmiyor.

**Teslim:**

- Yükleme iki alanı ekle.
- **Aynı dosyadaki ve web ikizindeki diğer alan sayımlarını denetle.** `MobileServerUpdateFieldsSchema`'nın alan listesi ile yüklemin listesi birebir örtüşüyor mu? Başka bir yüklem/eşleme aynı eksikliği taşıyor mu? Bulduğunu düzelt, denetlediğini rapora yaz.
- Testi önce yaz: yalnız `isPublic` taşıyan güncelleme geçerli olmalı, yalnız `discoverable` taşıyan da. **Gerçekten boş bir güncellemenin hâlâ reddedildiğini de iddia et** — hatayı korumayı kaldırarak düzeltme.

**Kalıcı önlem:** yüklemi elle sayım yerine `MobileServerUpdateFieldsSchema`'nın anahtarlarından türetmeyi değerlendir (`Object.keys(schema.shape).some(...)`). Bu, sınıfı kökten kapatır. Ama şeklin farkı test edilebilir olmalı ve mevcut mesaj/davranış aynen korunmalı — riskli görürsen elle listeyi düzelt ve gerekçeni yaz.

## Boşluk 4 — ayarlar overlay'i her açılışta fazladan istek atıyor

`packages/types/src/workspace.ts:176-188`:

```typescript
export const WorkspaceServerDetailSchema = z.object({
  server: WorkspaceServerSummarySchema.extend({
    description: z.string().nullable(),
    isAdmin: z.boolean(),
    isOwner: z.boolean(),
  }),
  ...
});
```

`isPublic`, `discoverable`, `type` yok. `server-settings-overlay.tsx` bu yüzden görünürlük durumunu okumak için ayarlar her açıldığında `GET /api/v1/servers/[serverId]/profile` çağırıyor — zaten elindeki veri için ikinci bir gidiş-dönüş.

**Teslim:**

- Üç alanı `WorkspaceServerDetailSchema.server` bloğuna ekle.
- Sunucu detay servisini bunları dolduracak şekilde güncelle. Kolonlar `Server` üzerinde zaten var ve komşu sorgularda zaten seçiliyor.
- Overlay'deki geçici isteği kaldır; artık kendisine verilen alanları okusun.

**Dikkat:** şemaya zorunlu alan eklemek, nesneyi literal kuran bir fixture'ı veya eşleyiciyi kırabilir. Detay yükünün tüm tüketicilerinin hâlâ typecheck'ten geçtiğini doğrula.

`00 §4`'ün adlandırdığı tuzak: `packages/types`'a **yeni şema** eklemek `assertSchemaBehaviorCoverage`'a (`packages/types/src/workspace.test.ts`) fixture ister. Sen mevcut şemayı genişletiyorsun, muhtemelen gerekmez — varsayma, kontrol et.

---

## Boşluk 2 — mobil profil kartındaki "Sunucuya katıl" no-op (bloke edici)

`apps/mobile/src/app/screens/about/about-community-invite-screen.tsx`. Ekran iki kaynaktan besleniyor (davet kodu / `serverId`). Davet yolu kendi join mutation'ını zaten çalıştırıyor (`joinMobileCommunityServer`, `joined`/`joining` durumu `:476-477`). **`serverId` yolu hiç mutate etmiyor** — dosyadaki `:361-363` yorumu bunu açıkça söylüyor, çünkü S2 sırasında join ucu yoktu.

Artık var:

```
POST /api/v1/mobile/servers/[serverId]/join   // gövdesiz
     403 SERVER_BANNED · 403 SERVER_FULL · 404 SERVER_NOT_FOUND · 200 { success: true }
```

**Web tarafı bu turda bağlandı — davranışı ondan aynala,** iki platform aynı sonuçları bildirsin. Referans `apps/web/src/components/servers/server-profile-card.tsx`:

- `:116` `resolveServerProfileJoinAction(profile.joined)` etiketi çözer
- `:129` `useMutation({ mutationFn: () => joinPublicServerRequest(profile.serverId) })`
- `:139-142` hata `ServerDiscoveryClientError.code`'dan i18n anahtarına eşlenir
- `:275-277` hata kartı render edilir

**Teslim:**

- `serverId` yolunun join düğmesi gerçek ucu çağırır.
- Her durum kodu kullanıcıya ayrı ve dürüst bir metinle bildirilir. **Kopya zaten var** — mobil keşif geçişi banned/full/unavailable için TR+EN ekledi. Yeniden yazma, kullan.
- **404 "mevcut değil" olarak gösterilir, sebebi ayırt edilmez.** Bu bilinçli: sunucu özel bir sunucunun varlığını, olmayan bir sunucuyla aynı 404'ün arkasına saklıyor.
- Başarıda düğme üye eylemine döner — `resolveServerProfileJoinAction(joined)` bunu zaten kodluyor, etiketi yeniden türetme.
- **Davet yolunun mevcut davranışı değişmez.** Kapı: `apps/mobile/component-tests/mobile-about-community-2g.test.tsx` **düzenlenmeden** yeşil kalmalı.

## Boşluk 3 — `/discover` web'de erişilemez

Rota (`apps/web/src/app/(main)/discover/page.tsx`) çalışıyor ama kabukta hiçbir bağlantı yok. Kullanıcı oraya gidemiyor.

**Teslim:** `apps/web/src/components/shell/server-rail.tsx`'e tek bir giriş noktası. Rail, kullanıcının sunucu değiştirdiği ve eklediği yer — doğal ev orası.

Mevcut desen: rail `onNavigate: (href: string) => void` prop'u alıyor ve şöyle kullanıyor (`:273`, `:374`, `:480`):

```typescript
onClick={() => onNavigate("/channels/@me")}
```

**Yeni navigasyon yüzeyi veya menü sistemi kurma.** Kabuğun bu tür şeyleri koyduğu yere tek bir affordance.

---

## Yapılmayacaklar

- Keşif kartına yeni alan, yeni sıralama, öneri mantığı
- Join akışına retry/backoff katmanı
- Yeni kopya metni (2 ve 3 için gerekenler zaten var)
- `hasMobileServerUpdate` dışındaki yüklemleri "iyileştirme" — yalnız aynı eksikliği taşıyanları düzelt
- Görsel yeniden tasarım

## Kapı

`00 §5`'teki biçim — `pwsh` yok, mutlak yol şart:

```
powershell -File C:\Users\doguk\Desktop\Wizards\scripts\quality\Invoke-LocalGate.ps1 -Profile Standard
```

```
powershell -File C:\Users\doguk\Desktop\Wizards\scripts\quality\Invoke-LocalGate.ps1 -Profile Mobile
```

Mobilde **iki ayrı süit**, ikisini de koş:

```
pnpm --filter @wizards/mobile test
```

```
pnpm --filter @wizards/mobile test:components
```

Taban çizgileri: web `2032/2032`, mobil node `1667/1667`, mobil jest `1169/1169` (128 suite), `packages/types` yeşil. Üçü de düşmemeli.

## Teslim listesi

- [ ] 1: yüklem düzeltildi, aynı sınıf başka yerlerde denetlendi, RED-önce test, boş güncelleme hâlâ reddediliyor
- [ ] 4: üç alan şemaya + servise eklendi, overlay'in fazladan isteği kaldırıldı, tüketiciler typecheck'ten geçiyor
- [ ] 2: mobil join gerçek ucu çağırıyor, her kod ayrı metin, 404 ayırt edilmiyor, 2g testi düzenlenmeden yeşil
- [ ] 3: `server-rail.tsx`'e tek giriş noktası
- [ ] Kapı: iki profil + iki mobil süit yeşil

## Rapor

`docs/prompts/sunucu-tipi-gorunurluk/raporlar/03b-rapor.md`. Her boşluk için ne değiştiğini, boşluk 1 için hangi başka yüklemleri denetlediğini, boşluk 2 için her durum kodunun nasıl gösterildiğini ve web davranışıyla nasıl örtüştüğünü yaz. Tüm doğrulama komutlarının gerçek çıktısı. **Sapmalar** ve **Eklenmeyenler** bölümlerini doldur.
