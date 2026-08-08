# 02 — S2: Sunucu profil kartı (2g), web + mobil

Önce `00-ortak-baglam.md` oku. `01`'in bitmiş olması ön koşuldur — bu prompt `getServerPublicProfile`'a dayanır.

Bu, kullanıcıya görünen **ilk** dalgadır. Her sunucunun `serverId` ile açılabilen bir profil kartı olur.

---

## Bağlayıcı kararlar

1. **Tek okuma kaynağı.** Web ve mobil aynı `getServerPublicProfile(serverId, viewerId)` çıktısını tüketir. İkinci bir sorgu, ikinci bir izin süzgeci, "web'e özel" bir alan yazılmaz.
2. **Kart salt okunurdur.** Katılma eylemi S3'e aittir. Bu dalgada `Sunucuya katıl` düğmesi çizilir ama **devre dışı ve görünür şekilde "yakında" değildir** — düğme, kullanıcı zaten üyeyse `Sunucuya git`, değilse davet akışına yönlendirir (mevcut davet yolu zaten çalışıyor). Davetsiz katılım S3'te açılır.
3. **Mobil 2g ekranı yeniden yazılmaz, genelleştirilir.** `apps/mobile/src/app/screens/about/about-community-invite-screen.tsx` zaten 2g tasarımını çiziyor ama davet koduna bağlı. Sunum katmanını `serverId` ile de beslenebilir hale getir; davet yolu aynı bileşeni kullanmaya devam eder.
4. **Erişim kuralı:** profil kartı `isPublic || discoverable || viewer üye` ise görünür. Aksi halde 404 — 403 değil. Özel bir sunucunun varlığı sızdırılmaz.
5. Rota şekli: web `/(main)/servers/[serverId]/about`, mobil `ServerProfile` ekranı + `serverId` parametresi. Derin bağlantı `mobile-linking.ts`'e eklenir.

---

## Bölüm A — Uçlar

`getServerPublicProfile` var ama hiçbir HTTP ucundan servis edilmiyor.

**Teslim:**

- `GET /api/v1/servers/[serverId]/profile` — web tüketicisi. Oturum varsa `viewerId` geçilir, yoksa `null`.
- `GET /api/v1/mobile/servers/[serverId]/profile` — mobil tüketicisi, Bearer oturumu.
- İkisi de erişim kuralını (karar 4) uygular ve `ServerPublicProfileSchema` şeklinde döner.
- Rate limit eylem adları `api-rate-limit.ts`'e kaydedilir (kapalı union, yoksa derlenmez).
- İş mantığı `route-logic.ts`'e ayrılır, rota transport kalır — `apps/web/src/app/api/v1/admin/servers/route-logic.ts` desenini izle.

**Dikkat:** `route-contract.test.ts` mutasyon rotalarını denetler; bunlar `GET`, o kontrol tetiklenmez. Ama admin olmayan yeni rota eklerken mevcut rota sözleşme testlerinin ne beklediğini bir kez oku.

## Bölüm B — Paylaşılan sunum modeli

Kart, ham profil verisinden türeyen birkaç görüntü kararı taşıyor. Bunlar **iki kez yazılmaz**.

**Teslim:** `packages/types/src/` altına saf bir sunum modeli:

- Sayı biçimlendirme: `12400 → "12,4B"`, `1200 → "1,2B"` (2g tasarımındaki biçim). Türkçe binlik ayracı virgül, kısaltma `B`. İngilizce karşılığı `K`.
- Kanal satırı rozeti: `readOnly → "salt okunur"`, `liveCount > 0 && type === "voice" → "N kişi"`, `type === "text" && liveCount === 0 → "CANLI"` yalnız tasarımın gösterdiği durumda — **HTML'i oku, uydurma.**
- Arkadaş yığını: en çok 4 avatar, fazlası `+N` rozeti; alt metin `"Arkadaşlarından N kişi bu sunucuda"`.
- Katılma düğmesi durumu: `joined ? "git" : "katıl"`.

Saf fonksiyonlar, `node:test` ile doğrudan test edilir. Bileşen içinde `if` zinciri yazma.

## Bölüm C — Web kartı

`apps/web/src/components/` altına, 2g tasarımına (HTML satır 521–607) uygun.

**Teslim:**

- Rota `app/(main)/servers/[serverId]/about/page.tsx`
- Bileşen: banner + ikon (negatif üst boşlukla bindirme), ad + doğrulama rozeti, çevrimiçi/üye nokta çifti, açıklama, `KANALLAR` kartı, arkadaş yığını kartı, alt eylem çubuğu.
- Sunucu kabuğundan giriş noktası: `server-rail.tsx` veya sunucu başlık menüsünden "Sunucu profili". Mevcut menü desenini izle, yeni menü sistemi kurma.
- Boş/yükleniyor/hata durumları: repoda zaten `shell-skeletons.tsx` var, onu kullan.
- Erişilebilirlik: kanal listesi gerçek liste semantiği, düğmeler gerçek `button`, banner `img` ise `alt`.

**Desktop için ek iş yok** — Tauri kabuğu web'i sarar.

## Bölüm D — Mobil kartı

**Teslim:**

- `about-community-invite-screen.tsx`'in sunum gövdesi `serverId` ile de beslenebilir hale gelir. İki veri kaynağı (davet kodu / sunucu kimliği), tek görsel bileşen.
- Yeni rota `ServerProfile` — `mobile-navigation-types.ts` + `mobile-navigator.tsx` + `mobile-linking.ts` üçüne birden kaydedilir. **Üçünden biri unutulursa ekran sessizce açılmaz.**
- Sunucu ayarları / üyeler ekranlarından giriş noktası.
- Mevcut `mobile-about-community-2g.test.tsx` **düzenlenmeden yeşil kalır** — davet yolu davranışı değişmedi. Bu, genelleştirmenin doğru yapıldığının kapısıdır.

## Bölüm E — Kopya metinleri

`apps/mobile/src/.../mobile-copy.ts` ve web i18n dosyalarına TR + EN. Metinler 2g HTML'inden birebir alınır; olmayan metin uydurulmaz.

---

## Yapılmayacaklar

- Katılma/ayrılma mutasyonu (S3)
- Keşif listesi (S3)
- Profil düzenleme, banner yükleme (S4)
- Paylaş/kopyala dışında sosyal eylem
- Sunucu profili için ayrı bir önbellek katmanı — mevcut query istemcisi yeter

## Kapı

`00 §5`'teki komut biçimini kullan — bu makinede `pwsh` yok, mutlak yol şart:

```
powershell -File C:\Users\doguk\Desktop\Wizards\scripts\quality\Invoke-LocalGate.ps1 -Profile Standard
```

```
powershell -File C:\Users\doguk\Desktop\Wizards\scripts\quality\Invoke-LocalGate.ps1 -Profile Mobile
```

Yeni rota dizinleri köşeli parantez taşıyor (`[serverId]`). Odaklı test koşarken `00 §5`'teki glob kaçışını kullan, yoksa sessizce sıfır test koşar ve yeşil sanırsın.

Ek kanıt: web kartının ekran görüntüsü (tarayıcı önizlemesi), mobil ekranın emülatör görüntüsü. 2g tasarımıyla yan yana koy.

## Teslim listesi

- [ ] A: iki profil ucu + erişim kuralı + rate limit kaydı
- [ ] B: saf sunum modeli + testleri
- [ ] C: web rotası, kartı, kabuk girişi
- [ ] D: mobil ekran genelleştirildi, üç navigasyon kaydı, 2g testi düzenlenmeden yeşil
- [ ] E: TR + EN kopya
- [ ] Kapı: iki profil yeşil + görsel karşılaştırma
