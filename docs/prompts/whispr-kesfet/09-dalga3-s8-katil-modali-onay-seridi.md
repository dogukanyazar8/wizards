# Dalga 3 · Ş8 — Katıl modalı (496), onay şeridi, kabuk `Yeni` pili

**Ön koşul:** Ş5 + Ş3. **Paralel:** Ş7, Ş9. **Kapı:** modal + şerit testleri yeşil,
sol taraf diff'i yalnız `Yeni` pili.

---

## Sahiplenilen dosyalar

```
apps/web/src/components/discover/server-join-modal.tsx        (+ .test.tsx)
apps/web/src/components/discover/discover-joined-banner.tsx   (+ .test.tsx)
apps/web/src/lib/discover/new-server-badge.ts                 (+ .test.ts)
apps/web/src/components/shell/app-nav-panel.tsx               (yalnız Yeni pili)
apps/web/src/components/shell/server-rail.tsx                 (yalnız Yeni tile tonu)
apps/web/src/components/servers/server-discovery-screen.tsx   (SİLİNİR)
apps/web/src/lib/locale/messages/{tr,en}.ts                   (yalnız ölü anahtar tasfiyesi)
```

---

## 1. Katıl modalı (496 px)

`ui/modal.tsx` kullanılır — yeni modal primitifi yazılmaz.

```
örtü H(backdrop/.62) · kart r 22, H(surface-card), shadow 0 40px 90px -40px H(shadow-color)
başlık: 38×38 H(primary/.15) kişi-ekle ikonu · "Sunucuya katıl" 600/17/display
        alt "Davet kodu, bağlantı ya da dizinden seçim" · kapat 32×32
gövde: gap 15, pad 19/24
ayak: "Topluluk kurallarını kabul etmiş olursun" · İptal · Katıl
```

### 1.1 Davet kodu alanı

```
etiket "DAVET KODU VEYA BAĞLANTI"
alan h 42, r 12, H(surface-base), border 1px H(primary/.4)
önek "whispr.app/" 500/13 H(text-muted)  ← görsel önek, input değerinin parçası değil
input placeholder "davet-kodu", 600/13.5
sağda "Yapıştır" 30px düğme (H(surface-tertiary))
yardım: "Davetler bir kez kullanılabilir ya da süreli olabilir; sunucu sahibi belirler."
```

- `Yapıştır` `navigator.clipboard.readText()` çağırır. İzin reddedilirse buton pasif olur ve
  yardım metninin altına `Panoya erişilemedi` satırı gelir — sessiz başarısızlık yok.
- Girdi `parseInviteCode` (Ş3 §C.1) ile ayrıştırılır. Tam URL yapıştırıldığında input yalnız
  **kodu** gösterir (önek zaten görsel).
- Kod geçersizse alan kenarı `--danger` ve `Katıl` pasif; hata metni yardım metninin yerine
  geçer (ikisi aynı anda görünmez).

### 1.2 Ayırıcı ve dizin seçenekleri

```
hairline — "VEYA DİZİNDEN" — hairline
3 seçenek satırı: pad 10/12, r 13
  seçili: H(primary/.08) zemin + H(primary/.45) kenar
  34×34 tile + ad 600/13 + alt "{üye} üye · {kategori}" + 20 px radio (seçili H(primary) dolgu)
```

Üç seçenek **gerçek veriden** gelir: ızgaradaki ilk üç **katılınmamış** sunucu. Varsayılan seçim
ilk sıradaki (SPEC'in "Startup Türkiye" varsayılanı örnek veridir). Katılınmamış sunucu yoksa bu
bölüm **hiç çizilmez** ve modal yalnız kod alanıyla kalır.

`role="radiogroup"` + `role="radio"` + `aria-checked`; ok tuşlarıyla gezinir.

**Kod alanı ile dizin seçimi birbirini dışlar:** koda bir şey yazıldığı anda radio seçimi
temizlenir; bir radio seçildiği anda kod alanı temizlenir. `Katıl` hangisi doluysa onu kullanır.

### 1.3 Görünürlük anahtarı

```
"Katıldığımı arkadaşlarım görsün" / "Profilinde ortak sunucu olarak listelenir"
toggle 44×26, açık H(primary)
```

`ui/toggle-switch.tsx` kullanılır. **Bu anahtarın ürün karşılığı yok.** Karar: değer
`UserServerSettings` üzerinde bir alan **açmaz**; bunun yerine mevcut hesap gizlilik tercihine
(`account-privacy.ts`) bağlanır. Karşılığı yoksa anahtar çizilir, değeri `localStorage`'da
tutulur ve `TODO(api): sunucu görünürlük tercihi ucu yok` ile işaretlenir. Uydurma uç çağrılmaz.

### 1.4 Gönderim

`Katıl` → kod varsa `redeemDiscoverInvite`, radio seçiliyse `joinDiscoverServer`.
Başarıda: modal kapanır, onay şeridi açılır, kabuk listeleri geçersizlenir (Ş3 §C.2).
Hatada: modal **açık kalır**, hata metni kod alanının altında görünür.

`Esc` modalı kapatır. Odak açılışta kod alanına gider, kapanışta tetikleyiciye döner.
Odak tuzağı `ui/modal` tarafından zaten kuruluyorsa kullanılır, yoksa modal bileşenine eklenir
(bu, `ui/modal`'a dokunmayı gerektirirse **ayrı bir madde** olarak raporlanır ve tüm modal
tüketicileri için regresyon riski değerlendirilir).

---

## 2. Katılım onay şeridi

```
margin 14/24/0 · pad 12/14 · r 14 · H(success/.12) · border 1px H(success/.35)
30×30 tik ikonu
"{sunucu} sunucusuna katıldın"
alt: "Sunucu rayına ve Sunucularım listesine eklendi · hoş geldin kanalı açıldı"
sağda "Sunucuya git" (primary, h 32) + 28×28 kapat
```

- Akış başlığının **hemen altında**, ızgaranın üstünde.
- `role="status"` + `aria-live="polite"` — ekran okuyucu katılmayı duyurur.
- `Sunucuya git` → `/channels/{serverId}`.
- Kapatma: kullanıcı kapatır **veya** rota değişir. Otomatik zaman aşımı **yok** (kullanıcı
  "Sunucuya git" butonunu kaçırmamalı).
- Alt metindeki "hoş geldin kanalı açıldı" iddiası: sunucunun `systemChannelId`'si varsa doğru.
  Yoksa alt metin `Sunucu rayına ve Sunucularım listesine eklendi` ile kısalır — yanlış bilgi
  verilmez. İki varyant iki ayrı i18n anahtarıdır.

---

## 3. Kabuk: `Yeni` etiketi (K4)

**Diff'in sol tarafa değen tek yeri.** SPEC §2 ölçüleri:

```
Sunucularım satırı (yeni):
  pad 8/9 · r 12 · background H(warning/.1) · border 1px H(warning/.35)
  28×28 tile r 9, H(warning/.2) zemin / H(warning) metin
  ad 600/13 H(foreground)
  sağda "Yeni" pili: pad 2/6, r 6, H(warning/.2)/H(warning), 600/9.5/display

Sunucu rayı tile (yeni):
  44×44 r 15 · H(warning/.2) zemin · 1.5px H(warning/.5) kenar
  box-shadow 0 6px 16px -10px H(warning)
```

### 3.1 `new-server-badge.ts`

```ts
const NEW_SERVER_TTL_MS = 24 * 60 * 60 * 1000;
const STORAGE_KEY = "wizards.discover.seenServers.v1";

/** joinedAt 24 saatten yeni VE sunucu henüz ziyaret edilmemişse true. */
export function isNewServer(
  serverId: string,
  joinedAt: string | null,
  now: number,
  seen: ReadonlySet<string>,
): boolean;
export function readSeenServers(): Set<string>;
export function markServerSeen(serverId: string): void;
```

`markServerSeen` sunucu rotasına girildiğinde çağrılır (`/channels/[serverId]` layout'unda tek
satır). Depolama bozuksa (`JSON.parse` patlarsa) boş küme döner — etiket görünür kalır, uygulama
patlamaz. Küme 200 girdiyi geçerse en eskiler budanır.

`joinedAt` `workspaceQueryKeys.servers` yanıtında yoksa bu bir `TODO(api):` olur ve etiket yalnız
"henüz ziyaret edilmedi" koşuluyla çalışır (24 saat kuralı devreye giremez). Bu durum raporlanır.

### 3.2 Değişiklik sınırı

`app-nav-panel.tsx` ve `server-rail.tsx` içinde **yalnız** koşullu stil ve `Yeni` pili eklenir.
Satır yapısı, sıralama, sürükle-bırak, bağlam menüsü, genişlik — hiçbiri değişmez.
Diff satır sayısı hedefi: iki dosyada toplam **< 60 satır**.

---

## 4. Eski ekranın tasfiyesi (K8)

1. `components/servers/server-discovery-screen.tsx` **silinir**.
2. `grep -rn "ServerDiscoveryScreen" apps/web/src` sıfır sonuç vermeli.
3. `lib/locale/messages/{tr,en}.ts` içinde Ş0.4'ün "silinir" tablosundaki anahtarlar silinir;
   silinen her anahtar için `grep` ile sıfır tüketici kanıtlanır.
4. `lib/servers/client.ts` içindeki `serverDiscoveryQueryKeys` ve `fetchServerDiscoveryPage`
   **kalır** — `/api/v1/servers/discover` ucu duruyor (K8) ve mobil olmayan başka bir tüketici
   çıkarsa diye. Kullanılmıyorsa `@deprecated` JSDoc etiketi eklenir.
5. `components/shell/shell-skeletons.tsx` içindeki `ServerDiscoveryGridSkeleton` tüketicisiz
   kalırsa silinir.

---

## 5. Testler

`server-join-modal.test.tsx`:

- kod yazınca radio seçimi temizleniyor; radio seçince kod temizleniyor
- geçersiz kodda `Katıl` pasif ve kenar `--danger`
- tam URL yapıştırıldığında input yalnız kodu gösteriyor
- pano izni reddedilince `Yapıştır` pasif + uyarı satırı
- katılınmamış sunucu yokken dizin bölümü çizilmiyor
- `Esc` kapatıyor, odak açılışta kod alanında
- hata durumunda modal açık kalıyor

`discover-joined-banner.test.tsx`:

- `role="status"` + `aria-live="polite"`
- `systemChannelId` yokken kısa alt metin kullanılıyor
- otomatik kapanma yok (sahte zamanlayıcı ilerletilince şerit duruyor)

`new-server-badge.test.ts`:

- 24 saat sınırı (23:59 → yeni, 24:01 → değil)
- ziyaret edilmiş sunucu 24 saat dolmadan da yeni değil
- bozuk `localStorage` içeriğinde boş küme, hata yok
- 200 girdi budaması

Kabuk testleri: `app-nav-panel.test.tsx` içinde `Yeni` pilinin yalnız yeni sunucuda çıktığı ve
**mevcut hiçbir testin kırılmadığı**.
