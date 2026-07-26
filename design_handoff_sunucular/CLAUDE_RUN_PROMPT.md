# Whispr Mobile — Sunucular Redesign Uygulama Promptu (çalıştırma talimatı)

İlk iş: `/caveman ultra` komutunu çalıştır ve oturum boyunca bu modda kal.

## Görev

Whispr mobil uygulamasının **Sunucular** bölümünü `design_handoff_sunucular/` paketindeki tasarıma göre yeniden yaz: 5 ekranın tamamı — **tasarım + içerik + işlev** üçü birden, eksiksiz.

1. **1a** — Sunucular, sol rail görünümü
2. **1b** — Sunucular, compakt görünüm
3. **1c** — Sunucu seçici + bildirimler sheet ("Kaçırdıkların" dahil)
4. **1d** — Oluştur menüsü (metin kanalı / ses kanalı / kategori)
5. **1e** — Kanal oluştur formu (tip seçici, slug, kategori çipleri, özel kanal + rol seçimi)

## Doğruluk kaynakları (öncelik sırasıyla)

1. `design_handoff_sunucular/screenshots/*.png` — 5 ekran görüntüsü, piksel referansı
2. `design_handoff_sunucular/Whispr Sunucular Redesign.dc.html` — tasarımın tek doğrusu; her ekranın DOM'u `id="1a".."1e"` bölümlerinde, tüm ölçü/renk/gölge değerleri inline style'da
3. `design_handoff_sunucular/PROMPT.md` — damıtılmış spesifikasyon: token tablosu (§0.1), yetki modeli (§0.2), ekran ayrıntıları (§1a–1e), **Kabul kriterleri** bölümü

PROMPT.md'deki tüm talimatlar ve 7 kabul kriteri bağlayıcıdır. Bir ölçü/renk PROMPT.md ile HTML arasında çelişirse HTML kazanır; davranış tarifi için PROMPT.md kazanır.

## Çalışma kuralları

- Branch: **uat**. Başka branch açma. Başlarken `git status` ile uat + temel durumu doğrula.
- **Commit atma** — kullanıcı açıkça istemedikçe hiçbir `git commit`/`git push` yok. İş bitince değişiklik listesiyle raporla.
- Görsel doğrulamayı **kullanıcı emülatörde kendisi yapacak**. Sen emülatör/APK build başlatma, screenshot alma, `visual:capture`/`visual:gate` çalıştırma (görsel gate zaten bozuk). Senin sorumluluğun: kod kalitesi kanıtlarıyla teslim + kullanıcıya ekran-başına kontrol listesi.
- Yeni npm bağımlılığı ekleme (gerekirse önce sor). Web tarafına dokunma; yalnızca `apps/mobile` + gerekirse `packages/types` sözleşme katmanı.
- Yıkıcı/geri alınamaz hiçbir işlem yok.

## Mevcut kod haritası (keşfe buradan başla)

- `apps/mobile/src/app/screens/workspace-browser.tsx` — sunucular ekranı; **rail zaten var** (`mobileServerRail*` style'ları), redesign'a uyarlanacak
- `apps/mobile/src/app/screens/workspace-channel-section-list.tsx` — kanal satırları + kategori bölümleri (`WorkspaceChannelCompactRow`, `WorkspaceChannelSectionList`)
- `apps/mobile/src/app/screens/home-screen.tsx` — üst kapsayıcı; `MobileWorkspaceBrowser`'ı sarar
- `apps/mobile/src/app/screens/mobile-workspace-server-switcher-sheet.tsx` — 1c'nin temeli olacak mevcut sunucu seçici sheet
- `apps/mobile/src/workspace/mobile-workspace-editor-sheets.tsx` — mevcut kanal/kategori oluşturma sheet'leri (1d/1e bunların yerini alır ya da bunları dönüştürür)
- `apps/mobile/src/workspace/mobile-server-create-join-sheet.tsx` — "Katıl / Kur" akışı (1a rail `+`, 1c başlık butonu buraya bağlanır)
- `apps/mobile/src/workspace/mobile-server-management-client.ts` + `apps/mobile/src/query/use-mobile-server-management-mutations.ts` + `apps/mobile/src/app/features/use-mobile-server-management-feature.ts` — kanal/kategori oluşturma API katmanı; ad çakışması hatası burada yüzeye çıkar
- `apps/mobile/src/app/screens/mobile-appearance-settings-screen.tsx` — `MobileWorkspaceLayout = "rail" | "compact"` ayarı zaten mevcut; iki görünüm bu ayarla seçilir
- `apps/mobile/src/app/components/kit/sheet-primitives.tsx` — tüm sheet'ler bu primitives + overlay portal host kayıt sistemiyle açılır (RN `Modal` KULLANMA; mevcut registry kalıbını izle)
- `apps/mobile/src/design/tokens.ts`, `themes.ts`, `palette.ts` — design token katmanı
- `apps/mobile/src/locale/mobile-copy.ts` — kopya/i18n ("Kanallarda ara", "Kaçırdıkların" anahtarları kısmen mevcut)
- `apps/mobile/src/query/mobile-voice-states-query.ts` — canlı ses katılımcıları (1a canlı satır, 1c "seste" meta)
- Bildirim verisi (1c "Kaçırdıkların"): `apps/mobile/src/notifications/` + `notifications-screen-model.ts` — bahsetme + ses başlangıcı bildirimlerini sunucular-arası birleşik, en yeni üstte ver

Bu harita başlangıç noktasıdır; değiştirmeden önce her dosyanın güncel halini oku ve çağrı zincirini kendin doğrula.

## Tasarım ve içerik kuralları

- PROMPT.md §0.1 token'larını `design/tokens.ts`/`themes.ts` üzerinden uygula; component içine ham hex gömme. Token katmanında karşılığı olmayan değer varsa token olarak ekle.
- Türkçe kopya PROMPT.md'deki metinlerle **birebir**; tüm yeni metinler `mobile-copy.ts` üzerinden hem `tr` hem `en` anahtarıyla eklenir (tr = tasarımdaki birebir kopya). Hard-coded string yok.
- Sayılar/metalar gerçek veriden: üye sayısı, kanal sayısı, "seste" sayısı, okunmamış/bahsetme rozetleri, son mesaj önizlemesi, zaman damgaları, canlı katılımcı avatarları. Mock/placeholder veri bırakma.
- Rozet önceliği her yerde aynı: bahsetme (kırmızı `@n`) > okunmamış (primary `n`) > yok.
- `isAdmin` yetki modeli (§0.2): yetkisizde oluşturma giriş noktaları render edilmez (disabled değil, yok).
- Kategori daralt/aç durumu kullanıcı başına kalıcı — repodaki mevcut persistence altyapısını kullan (yeni storage mekanizması icat etme).
- Tüm dokunma hedefleri ≥ 44px; sheet'ler sürüklenerek kapanır (sheet-primitives bunu veriyorsa yeniden yazma).

## Kalite kuralları (pazarlıksız)

- **TDD**: davranış içeren her yeni mantık için önce test — rozet öncelik seçimi, slug'lama (boşluk→`-`, küçük harf), ad çakışması hatası, kategori collapse persistence, isAdmin gating, "Kaçırdıkların" birleştirme/sıralama, sunucu pili toplam okunmamış hesabı. Saf mantığı test edilebilir model/util dosyalarına çıkar (repodaki `*-model.ts` kalıbı).
- Yasak: `any`, `as any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, boş `catch`, `console.log` kalıntısı, ölü kod, kullanılmayan export/style.
- Uyarı yok: typecheck, ESLint (`lint:hooks` dahil) ve test çıktılarında **sıfır warning**; çalışma zamanında yeni React uyarısı üretme (key, act, "Cannot update during render", VirtualizedList iç içe vb.).
- Yan etki yok: mevcut ekran/akışların davranışı değişmeyecek (kanal ekranı, DM, voice, uzun basma kanal menüsü aynen çalışır). Mevcut hiçbir testi silme/zayıflatma; API sözleşmesini kırma.
- Performans: listeler FlashList kalıbında kalır; farklı satır tipleri için `getItemType` doğru ayarlanır (yanlış tip karışımı görsel bozar); render-sırasında hesap yerine memoize edilmiş seçiciler. **Repo değişmezleri**: (1) bir chat-surface'ın tek sahibi olur, (2) TanStack Query sonucu nesne kimliği üzerine asla memoize edilmez (referans her fetch'te değişir), (3) sheet'ler tek overlay portal host'a kayıtla açılır.
- React Compiler etkin repoda — kurallara uygun, koşulsuz hook çağrıları; render sırasında mutasyon yok.

## Test/doğrulama tuzakları (bil, zaman kaybetme)

- Typecheck `tsc6` (reponun özel TypeScript binary'si) ile koşar; stok `tsc` çağırma.
- Node testleri **`apps/mobile` dizininden** çalıştırılır: `node --test --import tsx scripts/<ad>.test.ts` — repo kökünden `tsx` çözülemez.
- RNTL 14 async'tir: `render()` ve `fireEvent.*` **await edilir**; unutulursa aynı dosyadaki sonraki testler zehirlenir ("getByTestId is not a function").
- `tsc6`/`tsx` binary'si kaybolursa (`ENOENT ... C:\p\...`): `pnpm install --force` ile onar.
- Voice-invite boundary testinde önceden var olan bir kırmızı görülebilir — senin değişikliğinden bağımsızsa raporla, kovalamaya girme; kendi dosyalarında kırmızı bırakma.

## Zorunlu doğrulama sırası (hepsi geçmeden bitmiş sayılmaz)

Kök dizinden:

```
pnpm --filter @wizards/mobile typecheck
pnpm --filter @wizards/types typecheck   # types'a dokunduysan
pnpm --filter @wizards/mobile lint
pnpm --filter @wizards/mobile lint:hooks
pnpm format
```

`apps/mobile` dizininden:

```
pnpm test              # node --test tüm scripts/*.test.ts
pnpm test:components   # jest component testleri
pnpm quality:check
```

Son kapı (kök dizinden, PowerShell):

```
powershell -ExecutionPolicy Bypass -File scripts/quality/Invoke-LocalGate.ps1 -Profile Mobile
```

Her komutun gerçek çıktısını gör; "geçti" demeden önce sıfır hata + sıfır warning kanıtla. Kırmızı varsa kök nedenini çöz, baskılama.

## Teslim

1. Değişen dosyaların listesi + her birinin tek satır gerekçesi.
2. Doğrulama komutlarının sonuç özeti (sayılar: kaç test, kaç geçti).
3. PROMPT.md'deki 7 kabul kriterinin her biri için tek satır durum (karşılandı / nasıl).
4. Kullanıcının emülatörde bakacağı ekran-başına kontrol listesi (1a–1e + yetkisiz kullanıcı senaryosu + rail↔compakt geçişi).
5. Commit YOK — kullanıcı görsel doğrulamadan sonra kendisi karar verecek.
