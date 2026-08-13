# 21 — Mobil: sessiz hatalar ve bozulan durum

`00-ortak-baglam.md` oku. Caveman ultra. `uat`. Commit yok.

**Ön koşul:** yok. Paketin son promptu.

## Sorun

Bir mutasyon başarısız oluyor ve kullanıcı hiçbir şey görmüyor. Bazı yerlerde bu sadece can sıkıcı; bir yerde kullanıcı taciz raporunun gittiğini sanıyor.

Kök neden aynı: **hata yolu opsiyonel bırakılmış.** `retry: 0` ayarlıyken (`mobile-query-client.ts:8`) tek bir 5xx son demek, ama mutasyonların çoğunda `onError` yok ve çağıranlar `.mutate()` kullanıyor — reddi çağırana ulaşmıyor.

Bu promptun ilkesi: **her kullanıcı eylemi bir sonuç bildirir.** Başarı sessiz olabilir; başarısızlık olamaz.

## Kapsam

### 1. Kötüye kullanım raporu sessizce kayboluyor

`apps/mobile/src/social/mobile-social-query.ts:338` · `mobile-user-profile-screen.tsx:468` · `profile-card/profile-card-overlay.tsx:300`

`reportUser` mutasyonunda ne `onError` ne `onSuccess` var; her çağıran sheet'i yazma çözülmeden kapatıyor. Kullanıcı "Taciz" seçiyor, sheet kapanıyor, hiçbir şey gösterilmiyor. Kart yolunda ise `await` bir `void (async …)()` içinde — rejection hem başarı toast'ını atlıyor hem unhandled rejection oluyor.

Yap: `onError` standart hata toast'ını kaldırsın; başarı toast'ı yalnız `onSuccess`'ten çıksın. **Bu maddeyi ilk yap** — listedeki en yüksek etkili olan.

### 2. Arkadaş ilişkisi yazmaları sessiz

`apps/mobile/src/social/friends-hub.tsx:754`, `:766`, `:1430` · `mobile-social-query.ts:375`

`removeFriend`/`blockFriend`/`unblockFriend` `onError`'sız `.mutate()` ile çağrılıyor. Kötü bağlantıda engelleme sessizce başarısız, satır yerinde kalıyor, kullanıcı engellendiğini varsayıyor.

Yap: üç mutasyona da `onError` ekle; dosya zaten `showToast` ve `resolveRequestErrorCopy` taşıyor.

### 3. Profil kartı eylemleri yakalanmayan rejection üretiyor

`apps/mobile/src/social/profile-card/profile-card-overlay.tsx:270`, `:245`, `:325`, `:344` · `mobile-user-profile-screen.tsx:345` · karşılaştır `friends-hub.tsx:639`

Dört eylem `void (async …)()` içinde `catch`'siz `await`. `createRequest`'in normal sunucu yanıtları (`ALREADY_PENDING`, `BLOCKED`, `FRIEND_REQUEST_POLICY`) rejection oluyor; "Arkadaş ekle" hiçbir şey yapmıyor gibi görünüyor. `friends-hub` aynı üç hatayı doğru karşılıyor.

Yap: her async gövdeyi try/catch'e al ve `resolveRequestErrorCopy` + `showToast` kullan — veya hata metnini mutasyonun `onError`'ına taşı (tercih edilen: tek yer).

### 4. `openDM` başarısızlığı ölü dokunuş

`apps/mobile/src/social/friends-hub.tsx:613`, `:747`, `:766`, `:829`, `:874`

Dört çağıran `void openDM(...)` ile rejection'ı atıyor. `retry: 0` ile bir hata satırın hiç gitmemesi demek, toast yok.

Yap: `mutateAsync`'i try/catch'e al, standart hata toast'ı.

### 5. Davet oluşturma boş `catch`'e gidiyor

`apps/mobile/src/workspace/mobile-server-invites-screen.tsx:79`, `:151`

Yorum "kullanıcı tekrar deneyebilir" diyor ama hiçbir şey ona denemesi gerektiğini söylemiyor; başarı yolunda hata yüzeyi yok.

Yap: `createError` state'i tut ve oluştur düğmesinin yanında göster — `mobile-server-settings-screen.tsx`'in `setError(...)` deseni.

### 6. Silme onayı sheet'i kendi hatasını yok ediyor

`apps/mobile/src/workspace/mobile-server-invites-screen.tsx:267` · `app/components/kit/destructive-confirmation-sheet.tsx:86` · karşılaştır `mobile-server-settings-screen.tsx:408`, `mobile-channel-settings-screen.tsx:116`, `mobile-server-members-screen.tsx:128`

`finally { setPendingDelete(null) }` sheet'i kapatıyor; sheet'in `open` false olunca hatayı temizleyen effect'i devreye giriyor. `deleteInvite`'in `onError`'ı iyimser olarak silinen satırı geri koyduğu için kullanıcı davetin kaybolup sessizce geri geldiğini görüyor. Kardeş ekranların üçü de bilerek yeniden fırlatıyor.

Yap: `pendingDelete`'i yalnız başarıda temizle, rejection'ın yayılmasına izin ver.

### 7. Kanal ayarları formu yazarken eziliyor

`apps/mobile/src/workspace/mobile-channel-settings-screen.tsx:60`, `:49` · karşılaştır `mobile-profile-edit-screen.tsx:100`

`channel` `workspace.data?.detail`'den türetiliyor; herhangi bir workspace invalidasyonu (realtime kanal güncellemesi, başka bir adminin komşu kanalı yeniden adlandırması, `refetchOnReconnect`) yeni nesne kimliği üretiyor ve üç alanı sunucu değerlerine sıfırlıyor — kullanıcı yazarken.

Yap: taslağı yalnız kanal **kimliği** değişince tohumla (veya son uygulanan sunucu değerleriyle karşılaştır). Profil editöründeki `baselineSignature`/`appliedSignatureRef` çifti referans.

### 8. Kanal oluşturma retry'ı kategoriyi çoğaltıyor

`apps/mobile/src/workspace/mobile-workspace-create-sheets.tsx:148`, `:174`

Kategori POST'u başarılı, kanal POST'u başarısız olduğunda toast'ın "Tekrar dene"si `submitChannel`'a `newCategoryOpen`/`newCategoryName` hâlâ set hâlde giriyor: aynı adda ikinci kategori. İki retry üç özdeş kategori bırakıyor, temizleyen yok.

Yap: oluşturulan kategori id'sini state'e yaz (veya kategori landing'de bayrakları temizle) ki retry onu yeniden kullansın.

### 9. Rol detayı üye listesini sayfalamıyor

`apps/mobile/src/workspace/mobile-role-detail-screen.tsx:84` · `mobile-server-management-client.ts:67` · karşılaştır `mobile-server-members-screen.tsx:297`

Infinite query okunuyor ama `fetchNextPage`/`hasNextPage` dosyada hiç geçmiyor. 50'den fazla üyesi olan sunucuda 51. üyeye bu ekrandan rol verilemiyor ve listenin kesildiğine dair hiçbir işaret yok.

Yap: `onEndReached` ile sayfalama ekle (veya üye ekranının FlashList desenini kullan).

### 10. Rol detayı sınırsız refetch döngüsü

`apps/mobile/src/workspace/mobile-role-detail-screen.tsx:111`, `:231`

Effect'in bağımlılığı `rolesQuery` — TanStack her render yeni proxy döndürüyor, yani effect her render koşuyor. `role` bulunamazsa: refetch → `isFetching` → oturur → `role` hâlâ yok → refetch. Silinen role deep link ile veya `deleteRole`'ün iyimser `onMutate`'i satırı kaldırırken tetikleniyor; ekran kalıcı iskelet gösterirken istek fırtınası atıyor.

Yap: tek seferlik retry'ı `useRef` ile kapıla (`roleId` bazlı), kararsız query nesnesinden türetme. **Bu madde HIGH — 1 ile birlikte önceliklendir.**

### 11. Ölü kod ve yanıltıcı sözleşmeler

- `apps/mobile/src/dm/mobile-group-client.ts:471` — okunmayan `groupMembers` anahtarı. **19 no'lu promptta ele alındı**; burada tekrar yapma, yalnız hâlâ duruyorsa raporla.
- `apps/web/src/lib/messages/attachment-visibility.ts:68` — sahip-baypas dalı erişilemez (DTO'da `userId` yok, beş çağıran `null` geçiyor). Yazarın kendi taranan yüklemesi diğer oturumlarında `url: null` geliyor. Ya `userId`'yi soket payload'ına taşı ya dalı sil ve yolu "yalnız CLEAN" olarak belgele.

## Yapılmayacak

- Yeni toast/hata bileşeni tasarlamak.
- Global bir hata sınırı veya mutasyon sarmalayıcısı kurmak — **cazip ama over-engineering.** Her mutasyonun `onError`'ı yeterli; üçüncü tekrar eden kalıba kadar soyutlama yok.
- `retry` politikasını değiştirmek.
- Ekran akışlarını yeniden tasarlamak.

## Kabul kriterleri

1. Başarısız bir rapor/engelleme/arkadaş çıkarma kullanıcıya hata gösteriyor.
2. Profil kartı eylemlerinde yakalanmayan rejection kalmadı.
3. Davet oluşturma ve silme hataları ekranda görünüyor.
4. Kanal ayarları formu arka plan refetch'iyle sıfırlanmıyor.
5. Kanal oluşturma retry'ı ikinci kategori üretmiyor.
6. Rol detayı 50'den fazla üyeyi listeleyebiliyor ve sonsuz refetch yapmıyor.

## Testler

- Her mutasyon için: reddedilen `mutationFn` ile toast'ın çağrıldığı.
- Onay sheet'i: rejection'da açık kalıp hata gösterdiği.
- Kanal ayarları: aynı kanal kimliğiyle yeni `detail` nesnesinin taslağı ezmediği.
- Kategori retry: ikinci `submitChannel`'ın `createCategory` çağırmadığı.
- Rol detayı: `role` bulunamadığında `refetch`'in bir kez çağrıldığı.

RNTL kuralı: her `it` bloğunda tek `render`.

## Doğrulama

```bash
pnpm --filter @wizards/mobile typecheck
```

```bash
cd apps/mobile && npx jest component-tests
```

```bash
pnpm --filter @wizards/mobile test
```
