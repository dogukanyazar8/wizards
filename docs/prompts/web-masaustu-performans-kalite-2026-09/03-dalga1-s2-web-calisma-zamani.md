# D1 / Ş2 — Web çalışma zamanı ve render

Ön koşul: `00-ortak-baglam.md` okundu; `raporlar/00-baseline.json` var.
Tür: **salt okuma.** Yalnız `raporlar/S2.findings.json` + `raporlar/S2-rapor.md`.
Sahiplik: _yüklendikten sonra_ ana iş parçacığında olan her şey — render, yeniden render, realtime olayının önbelleğe ve DOM'a yansıması, zamanlayıcılar, bellek, kaydırma. Bayt/yükleme Ş1'in, sunucu Ş3'ün.

## Amaç

Kullanıcının saatlerce açık tuttuğu bir iletişim uygulamasında hissedilen üç şeyi açıklamak: **etkileşim gecikmesi** (kanal geçişi, yazma, menü), **akış altında takılma** (mesaj/tepki/yazıyor/konuşuyor olayları gelirken), **uzun oturumda şişme** (heap, DOM, dinleyici). Her bulgu bir trace'e veya D0 `M-LAB-P4…P10` ölçümüne bağlanır.

## Önceki bulgular (priorStatus zorunlu)

`denetim-2026-08/15` (ölü memo'lar, kaçan `queryKey`, scroll geçişleri, cache yeniden inşası), A2-003 (sanallaştırma), A5-002 (mesaj gruplama), principal F-02/F-03 (WIP'te uygulandı — realtime→önbellek yolu değişti, yeni hali oku).

## Tohum

```bash
graphify explain "LiveVoiceProvider()"
graphify explain "VoiceStateContext"
graphify explain "useMessages()"
graphify explain "SocketProvider()"
graphify path "apps/web/src/hooks/use-messages.ts" "apps/web/src/components/chat/message-list.tsx"
graphify explain "WizardsShell()"
```

```bash
rg -n "createContext|\.Provider value=" apps/web/src/components/providers apps/web/src/components/shell --glob '!*.test.*'
rg -n "setQueryData|invalidateQueries|refetchQueries|resetQueries" apps/web/src --glob '!*.test.*'
rg -n "setInterval\(|requestAnimationFrame\(|setTimeout\(" apps/web/src/components apps/web/src/hooks --glob '!*.test.*'
rg -n "socket\.on\(|socket\.off\(|\.on\(\"|\.off\(\"" apps/web/src/components apps/web/src/hooks --glob '!*.test.*'
rg -n "use no memo|\"use memo\"" apps/web/src
rg -n "useStore\(|create\(\(set" apps/web/src --glob '!*.test.*'
```

## Ölçüm araçları (kod değiştirmeden)

- **Chrome trace:** D0 Playwright altyapısıyla P4 (kanal geçişi), P6 (gönderim), P7 (kaydırma), P10 (akış) için CDP `Tracing.start` (kategoriler: `devtools.timeline`, `v8.execute`, `blink.user_timing`) → `raporlar/olcum/trace-P<n>.json`. En pahalı 10 görev, zorunlu reflow (`Layout` forced), stil yeniden hesaplama.
- **React Profiler:** profil build (`next build --profile` Next 16'da destekleniyor mu doğrula; desteklenmiyorsa React DevTools'un production-profiling yolunu kullan). P4 ve P10 için commit sayısı, commit süresi, en çok render olan 15 bileşen. React Compiler'ın derlediği/bail-out ettiği bileşenler: DevTools "Memo ✨" rozeti veya derleyici çıktısı.
- **Heap:** P10 başında ve sonunda heap snapshot (`HeapProfiler.takeHeapSnapshot`), `Detached` DOM ağaçları, büyüyen `Map`/dizi sahipleri.
- **Dinleyici simetrisi:** statik sayım (`socket.on` 119, `off` 123 — 2026-09-23 kaba grep) yetmez; mount/unmount döngüsünde (P4'te 20 kanal geçişi) `JSEventListeners` ve socket dinleyici sayısının sabit kalıp kalmadığı.

## Kapsam matrisi

| Birim                                                                                              | Hedef                                                           |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Oturumlu ağaçtaki context'ler (`components/providers/**`, `voice-context.tsx`)                     | %100 — değer ne sıklıkla değişiyor, kaç tüketici                |
| Realtime → önbellek yazıcıları (`setQueryData`/`invalidate*`)                                      | %100 envanter; mesaj, tepki, okundu, presence, ses yolları elle |
| Zamanlayıcılar (`setInterval`/rAF/tekrar eden `setTimeout`) `components`+`hooks`                   | %100                                                            |
| Liste yüzeyleri (mesaj, üye, kanal kenar çubuğu, DM listesi, arkadaşlar, bahsetmeler, sunucu rayı) | %100 — sanallaştırılmış mı, satır maliyeti                      |
| En büyük 15 istemci bileşeni (00 §4.2 listesi)                                                     | render sıklığı + sorumluluk sayısı                              |

## Aranacak kusur sınıfları

1. **Yüksek frekanslı context.** Ses: konuşma göstergesi, ses seviyesi, katılımcı listesi değişimi `VoiceStateContext`/`VoiceParticipantsContext` (`voice-context.tsx:109-110`) üzerinden tüm tüketicileri render ediyor mu? `live-voice-provider.tsx` (3.306 satır) hangi değerleri hangi sıklıkla yayıyor? Ölç: ses odasında 4 sahte katılımcı konuşurken saniyedeki commit sayısı.
2. **Realtime olay başına O(n) iş.** Her yeni mesajda sonsuz sorgunun tüm sayfalarını kopyalayan `setQueryData`, gruplama/sıralamanın tüm listede yeniden hesaplanması, geniş `invalidateQueries` anahtarları (olay başına ağ isteği). P10 sırasında olay başına ana iş parçacığı süresi.
3. **Satır başına zamanlayıcı.** Göreli zaman ("3 dk önce"), geri sayım, yazıyor animasyonu — her satırda ayrı `setInterval` mı, paylaşılan saat mi (`use-minute-clock.ts` var; 6 bileşen kullanıyor — geri kalanlar?).
4. **Sanallaştırma boşlukları.** `message-list.tsx` react-virtual kullanıyor; üye listesi, `channel-sidebar.tsx` (2.134), `friends-view.tsx` (1.543), DM listesi, sunucu rayı büyük veride tümünü DOM'a mı basıyor? Eşik: 500 üye / 200 kanal / 300 arkadaş ile DOM düğüm sayısı ve ilk render süresi. Sanal satır tuzağı: transform'lu satırda `z-index`/`position: fixed` yığın bağlamı (bilinen repo tuzağı) — öneri bunu bozmamalı.
5. **Etkileşim yolunda eşzamanlı ağır iş.** Kanal geçişinde bağımlı `useQuery` zinciri (şelale), `useEffect` içinde türetilmiş state (fazladan commit), büyük `JSON.parse`/sıralama, `message-input.tsx` (2.093) tuş başına yaptığı iş (mention/emoji/markdown ayrıştırma, taslak kaydı) — tuş başına süre `dusuk` profilde.
6. **Düzen zorlaması.** Okuma-yazma karışık DOM ölçümü (scroll-to-bottom, otomatik boyutlanan textarea, tooltip konumlama), `framer-motion` layout animasyonlarının listelerde kullanımı.
7. **Sızıntılar.** Unmount'ta kapanmayan socket/`window` dinleyicisi, LiveKit `Room`/track, `URL.createObjectURL`, `AudioContext`, `ResizeObserver`/`IntersectionObserver`; P10 heap eğimi.
8. **Zustand/React Query abonelik genişliği.** Tüm store'a abone olan bileşen, seçicisi her seferinde yeni nesne döndüren kullanım, `select` olmadan büyük sorgu verisine abonelik.
9. **Masaüstü özgü çalışma zamanı.** `components/desktop/desktop-experience.tsx` (1.357): Tauri köprüsüne ne sıklıkla `invoke`/`emit` yapıyor (tepsi bağlamı, pencere durumu, oyun algılama)? Pencere simge durumundayken zamanlayıcı ve animasyonlar duruyor mu (`visibilitychange`, WebView2 arka plan kısması)?
10. **React Compiler bail-out'ları.** Derlenmeyen sıcak bileşenler ve nedeni (kural ihlali, `"use no memo"`, desteklenmeyen desen). Bail-out gerçek render maliyeti üretiyorsa bulgu; üretmiyorsa bilgi notu.

## Yapılmayacaklar

- Değişiklik; `useMemo`/`memo` önerisi (00 §2 React Compiler kuralı) ölçümsüz.
- Ekran paylaşımı yayın/izleyici iç yapısı (ekran-paylaşımı paketi).
- Bayt tartışması (Ş1).

## Teslim

`raporlar/S2.findings.json` + `raporlar/S2-rapor.md`; rapora ek:

- **Etkileşim tablosu:** P4/P5/P6/P8 — `masaustu`/`dusuk` median/p95, en pahalı 3 görev (trace'ten, fonksiyon adıyla), sorumlu bileşen/dosya.
- **Olay maliyeti tablosu:** olay türü (mesaj, tepki, okundu, yazıyor, presence, konuşuyor) → olay başına ana iş parçacığı süresi, tetiklediği commit sayısı, ağ isteği.
- **Uzun oturum:** P10 heap/DOM/dinleyici başlangıç-son, sızıntı adayları ve tutucu zinciri.

## Kapı

00 §12'nin dört kontrolü (`S2`). Ek: en az üç trace dosyası `raporlar/olcum/` altında ve raporda referanslı; hiç dinamik ölçüm yoksa şerit tamamlanmamıştır.
