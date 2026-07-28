# Whispr Mobil — Mesajlaşma Yenilemesi · Uygulama Run Prompt'ları (MSG-1a … MSG-1i)

Kaynak teslim paketi: `design_handoff/design_handoff_whispr_mesajlasma/`
Hedef branch: **uat** · **commit atılmaz** · cihaz doğrulaması kullanıcıya aittir.

Bu dosya 7 dalgadan oluşur. Her dalga **ayrı bir Claude Code oturumunda** çalıştırılmak üzere yazılmıştır: §0 ORTAK BAĞLAM bloğunu kopyala, altına ilgili dalga bloğunu yapıştır, gönder. Dalgalar sıralıdır (M0 → M5); M4A ile M4B arası hariç paralel koşturulmaz.

| Dalga   | Kapsam                                                                                | Ekranlar               |
| ------- | ------------------------------------------------------------------------------------- | ---------------------- |
| **M0**  | Temel: renk/ölçü token'ları, mesaj punto sistemi, gruplama modeli, gövde primitifleri | —                      |
| **M1**  | DM sohbeti                                                                            | MSG-1d                 |
| **M2**  | Metin kanalı + thread                                                                 | MSG-1e, MSG-1f         |
| **M3**  | Etkileşim menüsü, composer yanıt durumu, ses kaydı, koyu tema                         | MSG-1g, MSG-1h         |
| **M4A** | Backend: eksik alanlar + yeni uçlar (şema → API → mobil istemci)                      | —                      |
| **M4B** | Liste sekmeleri                                                                       | MSG-1a, MSG-1b, MSG-1c |
| **M5**  | Görünüm ayarları + kapanış doğrulaması                                                | MSG-1i                 |

---

## §0 ORTAK BAĞLAM (her dalga promptunun başına aynen yapıştır)

```
Repo: C:\Users\doguk\Desktop\Wizards (pnpm monorepo). Branch: uat.
Çıktı stili: caveman ultra. Kod, kod yorumları, commit mesajları ve hata metinleri normal yazılır.

MUTLAK KURALLAR
1. COMMIT ATMA. push atma. branch değiştirme. Sadece çalışma ağacında düzenleme yap.
2. Doğrulamayı cihazda kullanıcı yapacak. Emulator/cihaz capture çalıştırma, visual baseline
   dosyalarına dokunma, `visual:capture:*` / `visual:gate` komutlarını koşma.
3. Tasarımdan sapma yapma. Ölçü/renk yuvarlama, "daha iyi" alternatif, eksik bırakma yok.
   Bir şey teknik olarak imkânsızsa uygulamayı durdurma; en yakınını uygula ve SAPMA RAPORU'na yaz.

KAYNAK OTORİTESİ (bu sırayla)
1. design_handoff/design_handoff_whispr_mesajlasma/Whispr Mesajlaşma Redesign.dc.html
   — inline stiller son sözdür; ölçü şüphesinde buradan oku.
2. design_handoff/design_handoff_whispr_mesajlasma/PROMPT.md — tüm token/ölçü/davranış tablosu.
3. design_handoff/design_handoff_whispr_mesajlasma/screenshots/1a…1i (780x1688, 2x).
Ekran id'leri bu iş boyunca MSG-1a … MSG-1i olarak anılır. Repo'daki
`DEVICE_CAPTURE_TARGETS` içindeki 1a…1j anchor'ları BAŞKA bir şeydir; onlara dokunulmaz.

ALINMIŞ KARARLAR (tartışmaya kapalı)
K1. DM balonlu, metin kanalı + thread balonsuz düz akış. Kanalda mesaj başına kutu/çerçeve/
    gölge/arka plan YOK.
K2. Zaman damgası mesajın içinde. DM'de balonun son satırının sağında, kanalda yazar adının
    yanında. Ayrı meta satırı yalnız dosya kartı ve sesli mesajda.
K3. Backend tam kapsamda geliştirilecek: tasarımın istediği ama API'de olmayan her alan/uç
    M4A dalgasında yazılır. Sahte/mock veri ile ekran doldurulmaz.
K4. Mesajlaşma renkleri kendi token grubuna girer: `theme.messaging` (+ `theme.elevation`
    ekleri). Uygulamanın global light/dark palet değerleri DEĞİŞTİRİLMEZ — mevcut koyu tema
    #131529/#1C1F3A'dır, tasarımın #12141F/#1B1E2C/#1E2235 değerleri messaging grubuna yazılır.
    Emsal: `redesignVoiceRoomLight/Dark` + `theme.voiceRoom`.
K5. Yeni "mesaj yazı boyutu" (4 kademe: 14 / 15 / 16.5 / 18) mevcut global metin boyutu
    tercihinden (5 kademe, tüm tipografiyi ölçekler) BAĞIMSIZDIR. Mesaj gövdesine global ölçek
    uygulanmaz; global tercih kaldırılmaz.
K6. MSG-1i ekranı yeni tasarım diliyle yeniden kurulur ve MEVCUT tüm seçenekler korunur:
    tema + ses odası görünümü + aksan rengi + düzen + global metin boyutu + (yeni) mesaj yazı
    boyutu + sıkı yerleşim + sistem yazı boyutunu izle. Hiçbir mevcut özellik silinmez.

REPO SÖZLEŞMELERİ (ihlali test kırar)
- `scripts/mobile-design-contract.test.ts`: `src/app/**`, `src/navigation/**` ve
  `src/voice/mobile-voice-room-panel.tsx` içinde HAM RENK YASAK — `#RRGGBB` ve `rgba(` geçemez.
  Her renk `src/design/palette.ts` → `src/design/themes.ts` üzerinden token olarak gelir.
  Aynı test `Animated` importunu react-native'den yasaklar (animasyon: react-native-reanimated
  4.5.0) ve pseudo-icon (metin olarak "x"/"FILE") kullanımını yasaklar.
- İkonlar: `src/design/mobile-line-icons.tsx` + `mobile-line-icon-definitions.ts` (stroke tabanlı,
  24x24 viewBox). Yeni ikon gerekiyorsa buraya eklenir. `@expo/vector-icons` yeni yerlerde
  kullanılmaz.
- i18n: `src/locale/mobile-copy.ts` içinde tek sözlük, `tr` ve `en` iki dal, DÜZ camelCase
  anahtar (`dmInboxTitle` gibi — PROMPT.md'deki `messages.title` noktalı adları repo formatına
  çevrilir). Her yeni anahtar İKİ dile de yazılır; `scripts/mobile-copy-parity.test.ts` bir dalda
  diğer dilin metnini yakalar. Hardcode string yok.
- Ölçü/şekil sabitleri `src/design/tokens.ts` altında toplanır; bileşen içinde serbest sayı
  bırakma (renk dışı sayılar testte yakalanmaz ama merkezi tut).
- Tema erişimi: `useTheme()` / `useThemedStyles()` (`src/app/providers/mobile-theme-provider.tsx`).
- Tercih kalıcılığı: AsyncStorage anahtarları `src/design/mobile-appearance-preferences.ts`
  içinde tanımlıdır, provider `mobile-theme-provider.tsx`'dir.

DOSYA HARİTASI (mevcut)
  Mesajlar ekranı kabuğu ....... apps/mobile/src/app/screens/dm-screen.tsx (+ .styles.ts, .types.ts)
  Sohbetler sekmesi ............ apps/mobile/src/app/screens/dm-inbox.tsx
  Arkadaşlar / İstekler ........ apps/mobile/src/social/friends-hub.tsx
  DM sohbeti ................... apps/mobile/src/app/screens/dm-conversation-screen.tsx
  DM gövde primitifleri ........ apps/mobile/src/app/components/dm-chat-primitives.tsx (+ .styles.ts)
  Metin kanalı ................. apps/mobile/src/app/screens/channel-screen.tsx (+ .styles.ts)
  Thread ....................... apps/mobile/src/app/screens/message-thread-screen.tsx (+ .styles.ts)
  Ortak mesaj primitifleri ..... apps/mobile/src/app/components/message-primitives.tsx (+ .styles.ts)
  Uzun basış menüsü ............ apps/mobile/src/app/components/message-action-menu.tsx
  Tepki detay sheet ............ apps/mobile/src/app/components/message-reaction-detail-sheet.tsx
  Emoji seçici ................. apps/mobile/src/app/components/message-emoji-picker.tsx
  Sesli mesaj (oynatma) ........ apps/mobile/src/app/components/message-voice-attachment.tsx
  Sesli mesaj (kayıt) .......... apps/mobile/src/media/mobile-voice-message-recorder.ts
  Composer ..................... apps/mobile/src/app/composer/mobile-composer.tsx (+ .styles.ts)
  Link önizleme ................ apps/mobile/src/messages/mobile-link-preview-card.tsx
  Mention ...................... apps/mobile/src/app/mobile-mention.ts, mobile-mention-registry.tsx
  Görünüm ayarları ............. apps/mobile/src/app/screens/mobile-appearance-settings-screen.tsx
  Tema/tercih provider ......... apps/mobile/src/app/providers/mobile-theme-provider.tsx
  Renk/ölçü .................... apps/mobile/src/design/palette.ts, themes.ts, tokens.ts
  Realtime ..................... apps/mobile/src/realtime/ (dm:typing:update, typing:update mevcut)
  Sorgular ..................... apps/mobile/src/query/mobile-message-queries.ts
  Sosyal istemci ............... apps/mobile/src/social/mobile-social-client.ts, mobile-social-query.ts
  Şemalar ...................... packages/types/src/mobile.ts, mobile-social.ts, messages.ts
  Mobil API .................... apps/web/src/app/api/v1/mobile/**
  Prisma ....................... packages/db/prisma/schema.prisma

DOĞRULAMA KOMUTLARI (bunlar kullanılır, başkası değil)
  pnpm --filter @wizards/mobile typecheck        # tsc6; MUTLAKA pnpm ile çalıştır
  pnpm --filter @wizards/types typecheck
  pnpm --filter @wizards/web typecheck           # backend dokunulduysa
  cd apps/mobile && npx jest component-tests/<ad>.test.tsx
  cd apps/mobile && pnpm test                    # node --test --import tsx scripts/*.test.ts
  cd apps/web && pnpm test                       # backend dokunulduysa

TUZAKLAR
- `typecheck`/`lint` npm ile koşarsa runner "Version 7.0.2" beklentisiyle DERLEMEDEN ölür.
  Daima pnpm.
- RNTL 14 async: `render()` ve `fireEvent.*` promise döner — ikisini de `await` et. Await'siz
  bir press, aynı dosyadaki SONRAKİ testleri bozar (izole koşunca geçer, birlikte koşunca patlar).
- `node --import tsx` repo kökünden değil, paket dizininden koşulur.
- Prisma: migration'lar yalnız `packages/db/prisma/rebaseline-migrations` altından okunur;
  yanlış dizine yazılan migration sessizce hiç koşmaz. Yerel DB db-push ile yönetilir.
- Mobil komponent testinde DB yoktur: yeni backend bağımlılığı DI (props/istemci enjeksiyonu)
  ile test edilebilir kalmalı.
- Bir dosyayı düzenlemeden önce oku; bu ekranların çoğu 400–1400 satırlık mevcut kod içerir,
  sıfırdan yazmak yerine yerinde dönüştür.

ÇALIŞMA BİÇİMİ
- TDD: önce başarısız test, sonra uygulama, sonra yeşil.
- İş bitince ilgili typecheck + test komutlarını koş, çıktıyı rapora yapıştır. Koşmadığın bir
  şeyi "geçti" diye yazma.
- Bitiş raporu şu 5 başlıkla verilir:
  1) Değişen/eklenen dosyalar  2) Uygulanan kontrat maddeleri  3) SAPMA RAPORU (tasarımdan her
  sapma + nedeni)  4) Koşulan komutlar + sonuç  5) CİHAZ DOĞRULAMA LİSTESİ (kullanıcının telefonda
  tek tek bakacağı maddeler).
```

---

## Dalga M0 — Temel sistem (token + punto + gruplama + gövde primitifleri)

```
[§0 ORTAK BAĞLAM buraya]

GÖREV
Mesajlaşma yenilemesinin taşıyıcı katmanını kur. Bu dalgada EKRAN GÖRÜNÜMÜ değişmez — altyapı
kurulur ve mevcut ekranlar yeni altyapıyı tüketmeye başlar. Sonraki 5 dalga bunun üstüne biner.

OKU
- design_handoff/design_handoff_whispr_mesajlasma/PROMPT.md §0 (tamamı), §1, §3, §5
- Whispr Mesajlaşma Redesign.dc.html — 1d ve 1e bloklarının inline stilleri
- apps/mobile/src/design/palette.ts, themes.ts, tokens.ts
- apps/mobile/src/app/providers/mobile-theme-provider.tsx
- apps/mobile/src/design/mobile-appearance-preferences.ts
- apps/mobile/src/app/components/dm-chat-primitives.tsx (getDMChatMessageGroupModel)

İŞ 1 — Renk token'ları
`palette.ts` içine iki yeni sabit ekle: `redesignMessagingLight`, `redesignMessagingDark`.
Değerler PROMPT.md §0.1 ve §0.2 tablolarından BİREBİR alınır. Anahtar isimleri (ikisinde de aynı
küme olacak):
  screen, surface, bubbleIn, bubbleInText, bubbleOut, bubbleOutText, cardBorder, divider,
  hairline, field, segmentTrack, textPrimary, textSecondary, textTertiary, listTime, bubbleMeta,
  groupLabel, accent, accentSoft, mentionPill, mentionRow, online, onlineText, onlineSurface,
  idle, danger, dangerSurface, newDivider, avatarTintGold*, avatarTintViolet*, avatarTintNeutral*,
  avatarTintIndigo*, avatarTintGreen* (her biri bg+fg), toggleOff, sliderTrack, sliderStop,
  sliderThumbBorder, reactionMineSurface, reactionMineRing, reactionMineText, reactionOtherSurface,
  reactionOtherText, tickSent, tickRead, recordDot, recordDeleteSurface, recordDeleteIcon,
  replyQuoteRule, replyQuoteName, replyQuoteText, systemEventIcon, systemEventText.
Koyu tema değerleri PROMPT.md §0.2'den; §0.2'de karşılığı olmayan anahtar için açık tema
değerinin koyu eşleniğini türetme kuralını dosya yorumuna yaz (tahmin değil, kural).
`themes.ts` içinde `MobileTheme` arayüzüne `readonly messaging: MobileMessagingPalette` ekle,
light/dark temalara bağla. `theme.elevation` altına ekle: `messageBubbleIn`, `messageBubbleOut`,
`segmentActive`, `reactionStrip`, `selectedBubble`, `actionMenu`, `sliderThumb`, `toggleThumb`
(PROMPT.md §0.3 değerleriyle; koyu temada gelen balon gölgesi yok = shadowOpacity 0).

İŞ 2 — Ölçü token'ları
`tokens.ts` içine `mobileMessagingMetrics` ekle: PROMPT.md §0.5'teki tüm şekil ölçüleri
(balon 18 / kuyruk 7, avatar boyut+radius çiftleri, ikon butonu 38/13, composer 40/14 ve 42/15,
FAB 40/14, composer alanı 42/16, arama pill 42/14, segment 36/11 + track 14 + padding 3 + gap 3,
ayar kartı 24 / padding 14, satır padding 14x16, ayırıcı marginLeft 69, çevrimiçi noktası 13/12)
ve §1'deki yerleşim sabitleri (DM balon arası 3, grup arası 10 / tepkili 14, giden blok
paddingLeft 38, kanal devam mesajı padding 1/16/1/61, tepki çipi DM h25 r13 marginTop -9
marginLeft 10, kanal çipi h26 r13 marginTop 4, liste saç çizgisi 79/76/78).

İŞ 3 — Mesaj punto sistemi (yeni özellik çekirdeği)
Yeni dosya: apps/mobile/src/design/mobile-message-typography.ts
  - `MOBILE_MESSAGE_FONT_SIZES = ["small","medium","large","xlarge"]`, px 14 / 15 / 16.5 / 18.
  - Satır yüksekliği çarpanları: DM 1.42 (xlarge'da 1.40), kanal/thread 1.45 (xlarge'da 1.42).
  - Sıkı yerleşim açıkken: DM 1.34 / kanal 1.36; grup arası 10→6, balon dikey padding 9/8→7/6,
    kanal satır padding 6→4.
  - `normalizeMobileMessageFontSize(value)`, `getMobileMessageBodyStyle({size, surface, compact})`
    → `{ fontSize, lineHeight }` (lineHeight px olarak hesaplanır; RN oran kabul etmez).
  - "Sistem yazı boyutunu izle" açıkken: efektif punto = kademe px × OS ölçeği,
    **14–22 px arasına clamp**. OS ölçeği `PixelRatio.getFontScale()`.
  - AsyncStorage anahtarları `mobile-appearance-preferences.ts` içine:
    `MOBILE_MESSAGE_FONT_SIZE_PREFERENCE_KEY = "whispr.mobile.message-font-size"`,
    `MOBILE_MESSAGE_COMPACT_PREFERENCE_KEY  = "whispr.mobile.message-compact"`,
    `MOBILE_MESSAGE_FOLLOW_SYSTEM_PREFERENCE_KEY = "whispr.mobile.message-follow-system-font"`.
  - K5: bu sistem `composeMobileTheme` fontScaleStep'inden bağımsızdır; mesaj gövdesine global
    ölçek UYGULANMAZ.
`mobile-theme-provider.tsx`: üç tercihi de yükle/yaz, context'e ekle
(`messageFontSize`, `setMessageFontSize`, `messageCompact`, `setMessageCompact`,
`messageFollowSystemFont`, `setMessageFollowSystemFont`) ve `useMobileMessageBodyStyle(surface)`
hook'unu dışa ver. RN'de CSS değişkeni yoktur; `--msg-size` yerine bu hook tek kaynaktır.
DİKKAT: `StyleSheet.create` ile donmuş bir fontSize kullanma — gövde stili hook'tan gelen inline
stille birleştirilir, aksi hâlde punto değişimi aynı karede yansımaz.

İŞ 4 — Gruplama modeli
Yeni dosya: apps/mobile/src/app/components/message-grouping.ts (saf fonksiyon, node ile test edilir)
  - Kural: aynı authorId + 5 dakika içinde + arada sistem mesajı / gün değişimi yok → tek grup.
  - Her mesaj için `{ isGroupStart, isGroupEnd, showAvatar, showAuthorRow, tailCorner }` üretir.
  - Kuyruk köşesi (7px) yalnız grubun SON balonunda; avatar grubun altına hizalı, grup başına bir kez.
  - Okunmamış ayırıcısı `lastReadMessageId`'den hesaplanır ve ekran açıkken yeniden konumlanmaz
    (ilk hesaplanan değeri sabitle).
  - `dm-chat-primitives.tsx` içindeki `getDMChatMessageGroupModel`'i bu modele DEVRET (çift
    gruplama mantığı bırakma).

İŞ 5 — Ortak gövde primitifleri
`message-primitives.tsx` içine (yeni dosya açmadan, mevcut modüle) ekle:
  - `MessageBodyText` — punto hook'unu tüketen tek gövde bileşeni; `letterSpacing: -0.005em`
    karşılığı ve mention/link parçalarını satır içi render eder.
  - `MessageTimestampInline` — balonun son satırının sağına oturan saat + tik bloğu
    (`flexDirection:"row"`, `alignItems:"flex-end"`, `gap: 9`). Ayrı satır AÇMAZ.
  - `MessageReplyQuote` — dolgusuz alıntı: `borderLeftWidth: 2.5`, `paddingLeft: 8`,
    `marginBottom: 6`, ad + tek satır ellipsis (maxWidth 196). Giden balonda çizgi ve ad
    `rgba(255,255,255,.78)` token'ı.
  - `MessageDeliveryTicks` — 14x14 özel çift tik (HTML'deki iki path). Tek tik gönderildi,
    çift tik okundu; `aria`/`accessibilityLabel` ile de bildirilir.
  - `MessageTypingDots` — üç nokta, 6px (DM balon formu) / 5px (kanal + liste), opaklık 1/.65/.35,
    gap 4, 1.2s döngü, 160ms fark, `translateY(-4)`. reanimated ile; reduce-motion açıkken durur.
Bu beşi M1–M4B boyunca TEK kaynaktır; ekranlarda kopyası yazılmaz.

TESTLER (yaz ve yeşil bırak)
- apps/mobile/scripts/mobile-message-typography.test.ts — 4 kademe px, satır yüksekliği,
  compact varyantı, follow-system clamp (14–22), normalize fallback.
- apps/mobile/scripts/mobile-message-grouping.test.ts — 5 dk sınırı, sistem mesajı grubu böler,
  gün değişimi böler, kuyruk yalnız son balonda, okunmamış ayırıcı sabitliği.
- apps/mobile/component-tests/mobile-message-typography-provider.test.tsx — tercih değişimi
  gövde fontSize'ını aynı render'da değiştirir, başlık/saat/composer değişmez.
- Mevcut `scripts/mobile-design-contract.test.ts` yeşil kalmalı (ham renk sızdırma).

KABUL
- `theme.messaging` iki temada da tam küme; hiçbir ekran dosyasında ham renk yok.
- Mesaj gövdesi punto tek hook'tan; global font scale gövdeyi etkilemiyor.
- Gruplama tek modelden; DM primitifleri kendi kopyasını kullanmıyor.
- Görsel çıktı bu dalgada değişmemiş olabilir; regresyon da olmamalı (mevcut component testleri geçer).

YAPMA
- Global light/dark palet değerlerini değiştirme.
- Mevcut `MOBILE_FONT_SCALE_STEPS` tercihini silme/yeniden anlamlandırma.
- Ekran yerleşimlerini bu dalgada değiştirme.
```

---

## Dalga M1 — DM sohbeti (MSG-1d)

```
[§0 ORTAK BAĞLAM buraya]

ÖN KOŞUL: M0 bitmiş olmalı (theme.messaging, punto hook'u, gruplama modeli, gövde primitifleri).

GÖREV
DM sohbet ekranını `screenshots/1d-dm-sohbet.png` ile ayırt edilemez hâle getir.

OKU: PROMPT.md §1 (tamamı), §2 "1d", §4; HTML'in 1d bloğu; screenshots/1d-dm-sohbet.png
DOSYALAR: dm-conversation-screen.tsx, dm-chat-primitives.tsx(+styles),
message-primitives.tsx(+styles), mobile-composer.tsx(+styles), message-voice-attachment.tsx

KONTRAT (birebir)
1. Başlık: durum çubuğu zemini surface. 26px geri alanı + 38/r13 avatar (12px çevrimiçi noktası,
   2.5px ring) + ad 15.5/800 ls -.01em + "Çevrimiçi" 11.5/700 online rengi + 38/r13 field zeminli
   sesli ve görüntülü arama butonları. Alt kenar 1px divider gölgesi.
2. Mesaj alanı: `flex:1`, içerik tabana yapışır (justifyContent flex-end davranışı),
   padding 12/16/8. Gün ayırıcı DM'de ÇİZGİSİZ ortalı etiket, 10.5/800 ls .12em.
3. Balon: radius 18, kuyruk köşesi 7 yalnız grubun son balonunda (gelen sol-alt, giden sağ-alt).
   Gelen: surface zemin + `elevation.messageBubbleIn`. Giden: accent zemin, beyaz metin,
   `elevation.messageBubbleOut`. maxWidth %76.
4. Gruplama: aynı kişi ardışık balon arası 3px, gruplar arası 10px (tepki varsa 14px), avatar
   30/r11 grubun ALTINA hizalı ve grup başına bir kez; giden grupta avatar yok, blok paddingLeft 38.
5. Saat balonun İÇİNDE, son satırın sağında (MessageTimestampInline), 10.5/600.
6. Yanıt alıntısı dolgusuz (MessageReplyQuote). Giden balonda çizgi/ad rgba(255,255,255,.78).
7. Tepki çipleri balon kenarına biner: satır marginTop -9, marginLeft 10, h25/r13, padding 0/8,
   gap 4–5. Kendi tepkim: accentSoft zemin + 1.4px ring + accent sayı. Diğerleri: surface +
   yumuşak gölge + textSecondary sayı. Sayı 11/800.
8. Sesli mesaj balonu: padding 9/12, 32px yuvarlak oynat butonu (rgba(255,255,255,.18) zemin,
   13px üçgen), 104x22 dalga SVG PATH (canvas değil), stroke 2.4 round, çalınan kısım tam opak,
   kalan %45, süre 11.5/700. Mevcut `message-voice-attachment.tsx` Ionicons kullanıyor →
   line-icon setine geçir.
9. Dosya eki: minWidth 236, r18, padding 9/13, 38/r13 ikon kutusu (dangerSurface + danger dosya
   ikonu), ad 13.5/700 ellipsis, meta 11.5/600, sağda 18px indir ikonu accent. GİDEN tarafta
   balon değil BEYAZ KART; saat + tik kartın altında ayrı satırda (K2'nin tek istisnası).
10. Yazıyor göstergesi: gelen balon formunda, padding 12/14, MessageTypingDots 6px.
11. Composer: `+` 40/r14 + alan h42/r16 (placeholder 14/500, 19px gülen yüz) + 42/r15 accent
    buton. Alan boşken MİKROFON, metin yazılınca 150ms'de UÇAK ikonuna döner.
12. Etkileşim (PROMPT.md §4): çift dokunma → hızlı ❤️ + 220ms scale(1→1.25→1); sağa kaydırma
    60px eşiğinde yanıt (ikon 0→1 opaklık); basılı durum scale(.97) 150ms; yeni mesaj 180ms
    translateY(8→0) + opaklık; kendi mesajım optimistic, tik gönderim onayında güncellenir;
    dipteyken otomatik takip, değilse "↓ 3 yeni mesaj" pill'i (accent, alt orta).
13. Erişilebilirlik (PROMPT.md §7): liste role="log" + aria-live polite; her ikon butonuna
    accessibilityLabel; tepki çipi etiketi "👏, 2 kişi, sen de tepki verdin" biçiminde; tik
    durumu etiketle de bildirilir; reduce-motion'da zıplama/nabız kapanır.

METİNLER: mock değil, gerçek veriden. Tasarımdaki Türkçe stringler i18n değerleridir;
yeni anahtarları `dm*` / `chat*` önekiyle mobile-copy.ts'e tr+en ekle.

TESTLER
- component-tests/mobile-dm-conversation-redesign.test.tsx (MEVCUT — genişlet): balon geometrisi,
  grup boşlukları, saatin balon içinde olduğu, kuyruk yalnız son balonda, tepki çipi binmesi,
  dosya kartının giden tarafta beyaz kart + ayrı meta satırı olduğu, composer mikrofon↔uçak dönüşü.
- component-tests/mobile-dm-8b-enrichments.test.tsx ve mobile-dm-attachment-send-10c.test.tsx
  yeşil kalmalı.

KABUL: PROMPT.md §8 maddeleri 2, 3, 4, 5, 14, 15, 16, 17, 18 — 1d için tek tek doğrula.
YAPMA: zaman damgasını ayrı satıra almak (dosya/ses hariç), dolgulu alıntı kutusu, çerçeveli
tepki çipi, balon içinde ikinci yüzey tonu.
```

---

## Dalga M2 — Metin kanalı + Thread (MSG-1e, MSG-1f)

```
[§0 ORTAK BAĞLAM buraya]

ÖN KOŞUL: M0 + M1 bitmiş.

GÖREV
Metin kanalını ve thread görünümünü balonsuz düz akışa çevir; 1e ve 1f ekran görüntüleriyle
ayırt edilemez hâle getir.

OKU: PROMPT.md §1, §2 "1e" ve "1f", §4; HTML'in 1e/1f blokları; screenshots/1e, 1f
DOSYALAR: channel-screen.tsx(+styles), message-thread-screen.tsx(+styles),
message-primitives.tsx(+styles), mobile-link-preview-card.tsx, mobile-composer.tsx

KONTRAT — 1e
1. Ekran zemini surface (BEYAZ). Yardımcı bloklar (sabit şeridi, link önizleme, thread kaynağı)
   screen tonunda. Ekranda en fazla iki yüzey tonu.
2. K1: mesaj başına kutu/çerçeve/gölge/arka plan YOK. Eski "beyaz çerçeveli kart" düzeni tamamen
   kalkar. Yalnız avatar + ad/saat + gövde.
3. Başlık: geri + 38/r13 accentSoft hash ikonu + "welcome-chat" 15.5/800 / "24 üye · 3 çevrimiçi"
   11.5/600 + 38/r13 arama ve üyeler butonları.
4. Sabitlenmiş şeridi: padding 8/16, screen zemini, üst+alt 1px divider; 14px pin ikonu +
   "2 sabit" 12/800 accent + tek satır ellipsis özet + 15px chevron. Dokunma → sabitlenmiş
   mesajlar sheet'i (mevcut pins API: /api/v1/mobile/channels/[channelId]/pins).
5. Akış padding 8/0/6. İlk mesaj satırı: 34/r12 avatar, yazar adı 13.5/800 ls -.01em, saat
   10.5/600 bubbleMeta. Devam mesajı avatarsız, padding 1/16/1/61 — gövde ilk gövdeyle PİKSEL hizalı.
6. Gün ayırıcı kanalda İKİ YANI 1px divider çizgili ortalı etiket.
7. Link: 15/600 accent, alt çizgi rengi rgba(79,70,229,.35), underline offset 3. Link önizleme
   kartı maxWidth 268, r14, screen zemin, padding 9/12; "WHISPR.APP" 9.5/800 ls .1em,
   başlık 13/800, açıklama 11.5/500 lh 1.45.
8. Tepkiler gövdenin ALTINDA marginTop 4, h26/r13; diğerleri field zeminli; sonda 26x26
   "tepki ekle" butonu (gülen yüz ikonu).
9. Thread göstergesi: accentSoft r12 blok, 2 adet 20/r7 binişik avatar, "4 yanıt" 12/800 accent,
   "son 09:12" 11.5/600, 13px chevron. Dokunma → 1f'e push, 250ms sağdan.
10. Sistem mesajı: padding 8/16/8/22, 15px yeşil giriş ikonu + 12/500 metin, kullanıcı adı 800.
11. "YENİ" ayırıcı: newDivider çizgi + danger etiket, okunmamış ilk mesajın hemen üstünde,
    ekran açıkken yeniden konumlanmaz.
12. Mention satırı: mentionRow zemin, borderLeft 3px accent, padding 8/16/8/13, lineHeight 1.5;
    satır içi mention pill 700 accent metin, mentionPill zemin, padding 1/5, r6.
13. Yazıyor: padding 10/16/2/61, 5px accent noktalar + "Dogukan yazıyor" 11.5/700.
14. Composer placeholder "#welcome-chat kanalına yaz"; kalanı 1d ile aynı.
15. BOT rozeti: 9/800 ls .06em, accent on accentSoft, padding 2/5, r5.

KONTRAT — 1f
1. Başlık: geri + "Thread" 15.5/800 / "#welcome-chat · 4 yanıt" + h38 accentSoft "Takip" pill'i
   (çan ikonu, 12/800 accent) + 38/r13 üç nokta.
2. Kaynak mesaj bloğu: flex:none, screen zemin, üst+alt 1px divider, padding 12/16/14; kanal
   satırının aynısı + tepki çipleri (diğerleri burada surface zeminli).
3. "4 YANIT" etiketi + sağa uzayan 1px divider çizgi.
4. Yanıtlar kanal satır formatında, padding 6/16.
5. Composer üstünde onay satırı: 19x19 r6 accent kutu + beyaz tik + "Yanıtı #welcome-chat
   kanalına da gönder" 12/700. VARSAYILAN İŞARETLİ; tıklanınca field zemin + dashed border boş kutu.
   Bu bayrak gönderim isteğine gerçekten iletilir.
6. Composer placeholder "Thread'e yanıt yaz".

TESTLER
- component-tests/mobile-channel-chat-redesign.test.tsx (MEVCUT — genişlet): hiçbir mesaj satırında
  kutu/gölge stili olmadığı, devam mesajının paddingLeft 61 olduğu, gün ayırıcının çizgili olduğu,
  mention satırı zemini + borderLeft, YENİ ayırıcısı konumu, thread göstergesi metinleri.
- component-tests/mobile-message-thread-*.test.tsx (yoksa aç): kaynak blok yüzeyi, onay satırı
  varsayılan işaretli ve gönderim yüküne yansıyor.
- scripts/mobile-channel-message-state.test.ts yeşil kalmalı.

KABUL: PROMPT.md §8 maddeleri 1, 9(kısmi), 14–18 — 1e ve 1f için doğrula.
YAPMA: kanalda balon, mesaj başına çerçeve, ikinciden fazla yüzey tonu, ikon-emoji karışımı.
```

---

## Dalga M3 — Etkileşim menüsü, yanıt composer'ı, ses kaydı, koyu tema (MSG-1g, MSG-1h)

```
[§0 ORTAK BAĞLAM buraya]

ÖN KOŞUL: M0–M2 bitmiş.

GÖREV
Uzun basış etkileşim katmanını ve ses kaydı composer'ını tasarımdaki hâle getir; DM'in koyu tema
varyantını kapat.

OKU: PROMPT.md §2 "1g" ve "1h", §0.2, §0.3, §4; HTML'in 1g/1h blokları; screenshots/1g, 1h
DOSYALAR: message-action-menu.tsx(+styles), message-row-long-press-context.tsx,
message-emoji-picker.tsx, mobile-composer.tsx(+styles), mobile-voice-message-recorder.ts,
message-reaction-detail-sheet.tsx, dm-chat-primitives.tsx

KONTRAT — 1g
1. Arkada GERÇEK sohbet akışı durur (boş/dondurulmuş kopya değil). Üzerine inset:0 scrim
   rgba(20,23,42,.45) + blur(3). Başlık opacity .5; composer SOLUKLAŞMAZ.
2. Seçili mesaj YERİNDE KALIR — taşınmaz, ölçeklenmez; yalnız `elevation.selectedBubble` kazanır.
3. Katmanlar alttan yukarı, padding 0/16/14, gap 9:
   - Tepki şeridi (sol hizalı, marginLeft 38): surface r24, padding 5/7; 5 emoji butonu 40x40/r20
     (21px emoji), seçili olan accentSoft zeminli; sonda 38/r19 field "+" → emoji seçici.
     Sıra sabit: 👍 ❤️ 😂 😮 🙏.
   - Eylem menüsü: genişlik 238, r20, padding 5, satır padding 10/11, r15, gap 11, İKON SOLDA 17px.
     Sıra: Yanıtla (accent ikon, 700), Thread başlat (accent ikon, 700), İlet, Kopyala, Sabitle
     (600, ikon textSecondary), 1px ayırıcı, Sil (danger, 700).
4. Açılış: uzun basış 400ms + hafif haptik; scrim 150ms fade; şerit ve menü 180ms ease-out +
   scale(.96→1). Kapanış: scrim'e dokunma / geri / eylem seçimi.
5. Tepki çipine uzun basış → "kim tepki verdi" sheet'i (mevcut bileşen).
6. Composer yanıt durumu: üstte borderLeft 2.5px accent + "ogi_uat kişisine yanıt" 11.5/800 accent
   + tek satır alıntı + 26/r9 field kapat butonu; alanda yazılmış metin 14/600; aksiyon butonu UÇAK.

KONTRAT — 1h
1. Yerleşim 1d ile BİREBİR aynı; yalnız renkler `theme.messaging` koyu değerleri. Gelen balonlarda
   gölge YOK. Yanıt alıntısı çizgisi #7C74FF, ad #A5A8FF, metin rgba(255,255,255,.5) — token olarak.
2. Kayıt durumu composer'ı: solda 40/r14 sil butonu (recordDeleteSurface + recordDeleteIcon çöp
   ikonu) · ortada h42/r16 rgba(255,255,255,.07) alan: 9px recordDot (1s nabız), 12.5/800
   `fontVariant: ["tabular-nums"]` süre, canlı 112x20 dalga (kaydedilen .9 / gelecek .22 opaklık)
   · sağda 42/r15 accent gönder.
3. Davranış: mikrofona basılı tut → kayıt; 60px sola kaydır → iptal; yukarı kaydır → kilitle
   (ekran görüntüsü kilitli durumu gösterir); gönder = uçak. Mevcut
   `mobile-voice-message-recorder.ts` üstüne kur, ikinci kayıt yolu açma.
4. Reduce-motion: nabız ve dalga animasyonu durur, opaklık geçişleri kalır.

TESTLER
- component-tests/mobile-message-action-menu.test.tsx (MEVCUT — genişlet): eylem sırası, ikon
  konumu, Sil'in ayırıcı altında ve danger olduğu, tepki şeridi emoji sırası, composer
  soluklaşmadığı, seçili mesajın transform almadığı.
- component-tests/mobile-message-menu-lifecycle.test.tsx yeşil kalmalı.
- component-tests/mobile-voice-record-composer.test.tsx (YENİ): kayıt durumunda üç bölge,
  sola kaydır iptal eşiği 60px, kilit durumu, süre biçimi.
- component-tests/mobile-communication-theme.test.tsx — koyu tema token'ları.

KABUL: PROMPT.md §8 maddeleri 9, 10, 19 + 14–18.
YAPMA: seçili mesajı büyütmek/taşımak, scrim arkasını boş bırakmak, kaydı ikinci bir kayıt
motoruyla kurmak.
```

---

## Dalga M4A — Backend (şema → API → mobil istemci)

```
[§0 ORTAK BAĞLAM buraya]

ÖN KOŞUL: M0 bitmiş (M1–M3 ile paralel koşabilir; M4B bunu bekler).

GÖREV
Liste ekranlarının (MSG-1a/1b/1c) ve punto senkronunun ihtiyaç duyduğu, bugün API'de OLMAYAN
veriyi uçtan uca üret. K3 gereği mock/placeholder yok.

MEVCUT DURUM (doğrulanmış boşluklar)
- `MobileDMConversationListItemSchema` (packages/types/src/mobile.ts:510): `unreadCount` ve
  `muted` var; **mentionCount YOK**, katılımcıda **isBot YOK** (Prisma User.isBot:345 VAR),
  `lastMessage` yalnız düz `text` — **sesli mesaj/ek türü YOK**, **teslim durumu (tik) YOK**.
- `MobileFriendSchema` (mobile-social.ts:40): `status`, `customStatus`, `lastSeenAt` var;
  **aktif ses odası YOK**, **cihaz türü (Mobil/Masaüstü) YOK**.
- `MobileFriendRequestSchema` (mobile-social.ts:51): **ortak sunucu sayısı/adı YOK**,
  **"X aracılığıyla" (kim tanıştırdı) YOK**.
- **Arkadaş önerisi ucu hiç yok** ("TANIYOR OLABİLİRSİN": ortak arkadaş sayısı / ortak sunucu adı).
- Gönderilen isteği geri alma: `DELETE /friends/requests/[id]` var — doğrula, yoksa ekle.
- `MobileAccountSettingsResponseSchema` (mobile-social.ts:320): görünüm/appearance alanı YOK →
  mesaj punto tercihinin cihazlar arası senkronu için gerekli.
- Liste seviyesinde canlı "yazıyor": `dm:typing:update` socket olayı VAR ama sohbet açıkken
  tüketiliyor; liste için konuşma bazlı map gerekiyor.

İŞ
1. Prisma (packages/db/prisma/schema.prisma): gereken alan/tabloları ekle. Migration dosyası
   YALNIZ `packages/db/prisma/rebaseline-migrations` altına yazılır (başka dizindeki migration
   sessizce hiç koşmaz). Yerel DB db-push ile yönetiliyor — komutları raporda belirt, kullanıcı
   onayı olmadan production'a dokunacak bir şey çalıştırma.
2. packages/types: şemaları genişlet. Her yeni alan `.default(...)` veya `.nullable().default(null)`
   ile eklenir — güncellenmemiş sunucu yanıtı hâlâ parse etmeli (repo'nun yerleşik kuralı).
   Yeni şemalar: `MobileFriendSuggestionSchema`, `MobileFriendSuggestionsResponseSchema`,
   `MobileAccountAppearanceSchema` (messageFontSize/compact/followSystem).
3. apps/web/src/app/api/v1/mobile:
   - `friends/route.ts`: friend payload'ına aktif ses odası + cihaz + (varsa) ortak sunucu bilgisi.
   - `friends/requests/route.ts`: her isteğe ortak sunucu listesi/sayısı + "via" bilgisi.
   - `friends/suggestions/route.ts` (YENİ): ortak arkadaş sayısı ve/veya ortak sunucu üzerinden
     öneri; kendi arkadaşları, engelledikleri ve bekleyen istekler hariç; limit ile sınırlı.
   - `dm/route.ts` (konuşma listesi): `mentionCount`, katılımcı `isBot`, `lastMessage.kind`
     ("text" | "voice" | "file" | "image") + `durationSec`, ve okunma/teslim durumu.
   - `account/settings/route.ts`: appearance alanlarının okunması + PATCH ile yazılması.
   Her uç: mevcut auth/rate-limit/zod doğrulama sarmalayıcılarını AYNEN kullan, yeni desen icat etme.
4. apps/mobile: `mobile-social-client.ts` + `mobile-social-query.ts` içine öneri sorgusu ve
   yeni alanların tüketimi; `mobile-message-queries.ts` içine liste seviyesi typing map'i
   (`dm:typing:update` → conversationId bazlı, sohbet açık olmadan da güncellenir);
   punto tercihi için ayar senkronu (yerel yazma anında, sunucu yazımı debounce).
5. Socket: yeni olay gerekiyorsa `mobile-realtime-contract.ts` allowlist'ine ekle — allowlist
   dışı olay sessizce düşer.

TESTLER
- packages/types: her yeni şema için `*.test.ts` (default'lu parse, eski payload uyumu).
- apps/web: yeni/değişen uçlar için route testleri (yetki, boş sonuç, sınır, sıralama).
- apps/mobile scripts: `mobile-dm-conversations-query.test.ts` genişlet (mentionCount, voice
  preview, typing map), sosyal istemci için öneri sorgusu testi.

KABUL
- Tasarımın istediği HER alan gerçek veriden geliyor; hiçbir ekran sabit/uydurma değer okumuyor.
- Eski sunucu yanıtı hâlâ parse ediyor (default'lar).
- typecheck: types + web + mobile üçü de temiz.

YAPMA: kişisel veriyi genişletirken yetki kontrolünü gevşetme; öneri ucunda engellenmiş/gizli
kullanıcıyı sızdırma; migration'ı yanlış dizine yazma.
```

---

## Dalga M4B — Liste sekmeleri (MSG-1a, MSG-1b, MSG-1c)

```
[§0 ORTAK BAĞLAM buraya]

ÖN KOŞUL: M0 + M4A bitmiş.

GÖREV
Mesajlar menüsünün üç sekmesini 1a/1b/1c ekran görüntüleriyle ayırt edilemez hâle getir.

OKU: PROMPT.md §2 "1a", "1b", "1c", §4 son satır; HTML 1a/1b/1c blokları; screenshots/1a,1b,1c
DOSYALAR: dm-screen.tsx(+styles), dm-inbox.tsx, friends-hub.tsx, mobile-line-icons.tsx

KONTRAT — ortak
- Segment/arama/çevrimiçi şeridi yükseklikleri ve 20px yatay padding ÜÇ sekmede de aynı; sekme
  değişiminde zıplama yok.
- Sekme değişimi: içerik 150ms fade + 6px yatay kayma; segment thumb 200ms ease-out.
- Satır başına KART YOK — düz liste + saç çizgisi. Liste satırı ≥66px, dokunma hedefi ≥38px.

KONTRAT — 1a (Sohbetler)
1. Başlık "Mesajlar" 23/800 ls -.03em + sağda 40/r14 accent FAB (kalem ikonu, elevation).
   ALT BAŞLIK YOK — mevcut `dmInboxDescription` satırı ("Sohbetlerin ve arkadaşların") KALDIRILIR.
2. Segment: Sohbetler / Arkadaşlar / İstekler; aktif beyaz kart + `elevation.segmentActive`;
   track r14 padding 3 gap 3, item h36 r11. İstekler segmentinde danger sayaç rozeti
   (minWidth 17, h17, r9, 10/800).
3. Arama pill'i "Kişi, mesaj veya kanal ara", 16px büyüteç, margin 12/20/0, h42 r14.
4. Çevrimiçi şeridi: "ÇEVRİMİÇİ" 11/800 ls .1em + yeşil sayı, padding 15/20/9; yatay kaydırılabilir,
   gap 13, öge genişliği 52: 50/r17 avatar + 10.5/600 ad. Durum: yeşil nokta; ses odasındakinde
   19x19 r7 surface kutu içinde accent dalga ikonu; boşta sarı nokta. Son öge 1.6px dashed
   çerçeveli "Ekle".
5. Sohbet listesi: satır padding 10/20, saç çizgisi marginLeft 79, avatar 46/r16.
   - Okunmamış: ad 15/800, önizleme 13/600 textTertiary, saat 11/800 accent, 20px accent sayaç.
   - Okunmuş: ad 15/700, önizleme 13/500 textSecondary, saat 11/700 listTime.
   - Yazıyor durumu: önizleme yerine 5px accent üç nokta + "yazıyor" 13/700 accent (M4A typing map).
   - Mention: 20px accent kare + beyaz `@` ikonu (M4A mentionCount).
   - Okundu tiki, susturulmuş 15px çan ikonu, sesli mesaj mikrofon ikonu + "Sesli mesaj · 0:42",
     BOT rozeti — hepsi M4A alanlarından.
6. Ekranda 7 sohbet görünür; son satırın kırpılması normaldir.
7. Dock: padding 9/10/4, 21px ikonlar, üst kenar 1px.

KONTRAT — 1b (Arkadaşlar)
- Başlık FAB'ı "arkadaş ekle" ikonuna döner; arama placeholder "Arkadaş ara".
- İki grup: "ÇEVRİMİÇİ n" ve "ÇEVRİMDIŞI n" (grup etiketi 11/800 ls .1em + sayı 11/800).
- Satır: 44/r15 avatar (çevrimiçi noktası 12px), ad + alt satır. Ses odasındaki kişide accent
  dalga ikonu + "live-room · paycore" ve sağda "Katıl" pill'i (h38, padding 0/12, r13, accentSoft,
  12/800 accent, mikrofon ikonu). Cihaz satırında telefon ikonu + "Mobil".
- Çevrimdışı: avatar opacity .6, ad rengi koyu-nötr; alt satır `lastSeenAt`'ten
  ("3 sa önce görüldü" / "Dün 23:10" / "2 gün önce") — mevcut `mobile-relative-time.ts` kullanılır.
- Her satır sağında 38/r13 mesaj butonu (çevrimiçi: accentSoft + accent ikon; çevrimdışı: field +
  textTertiary ikon); çevrimiçi satırlarda ek "daha fazla" üç nokta butonu.
- Saç çizgisi marginLeft 76.

KONTRAT — 1c (İstekler)
- "GELEN İSTEKLER n" (sayı danger): satır alt metni "2 ortak sunucu · paycore" /
  "selin_qa aracılığıyla · dün" (M4A). Sağda 40/r14 accent onay butonu (elevation) + 40/r14
  surface + border red butonu (17px textTertiary çarpı).
- "GÖNDERİLEN n": "Yanıt bekleniyor · 2 gün", sağda h36 surface "Geri al" pill'i (12.5/700).
- "TANIYOR OLABİLİRSİN": "4 ortak arkadaş" / "design-guild üyesi", sağda h36 accentSoft "Ekle"
  pill'i (+ ikonu, 12.5/800 accent) — M4A öneri ucu.
- Ad ağırlığı: gelen isteklerde 800, diğer gruplarda 700. Saç çizgisi marginLeft 78.
- İstekler sekmesinde arama pill'i YOK (mevcut davranış korunur).

TESTLER
- component-tests/mobile-dm-inbox-redesign.test.tsx (MEVCUT — genişlet): başlıkta alt metin
  olmadığı, segment rozeti, çevrimiçi şeridi öge genişliği/durum göstergeleri, okunmuş/okunmamış
  satır tipografisi, mention rozeti, yazıyor satırı, saç çizgisi 79.
- component-tests/mobile-friends-screen.test.tsx (MEVCUT — genişlet): iki grup, Katıl pill'i,
  çevrimdışı opaklık, satır butonları.
- component-tests/mobile-friend-requests-*.test.tsx (yoksa aç): üç grup, buton çiftleri, öneri
  satırı.
- Üç sekme için "yükseklikler eşit, zıplama yok" testi.

KABUL: PROMPT.md §8 maddeleri 6, 7, 8, 14–18.
YAPMA: satırı karta çevirmek, ekranda üçten fazla yüzey tonu, arayüz etiketinde emoji.
```

---

## Dalga M5 — Görünüm ayarları + kapanış (MSG-1i)

```
[§0 ORTAK BAĞLAM buraya]

ÖN KOŞUL: M0–M4B bitmiş.

GÖREV
Görünüm ayarları ekranını tasarımın dilinde yeniden kur ve mesaj yazı boyutu özelliğini uçtan uca
bitir. Ardından tüm iş için kapanış doğrulaması yap.

OKU: PROMPT.md §2 "1i", §3 (tamamı), §7; HTML 1i bloğu; screenshots/1i
DOSYALAR: mobile-appearance-settings-screen.tsx(+styles), mobile-theme-provider.tsx,
mobile-message-typography.ts, mobile-appearance-preferences.ts, mobile-copy.ts

K6 — İÇERİK KURALI
Ekran tasarımın diliyle (kart r24, iç padding 14, satır padding 14/16, iç ayırıcı marginLeft 69,
grup etiketi 11.5/700 ls .12em) yeniden kurulur ve MEVCUT TÜM SEÇENEKLER KORUNUR. Bölüm sırası:
  1. TEMA — tasarımdaki 3 eşit sütunlu önizleme (aşağıda).
  2. SES ODASI GÖRÜNÜMÜ — mevcut seçenekler, tasarım kartı/satır diliyle.
  3. AKSAN RENGİ — mevcut 6 swatch, tasarım kartı içinde.
  4. MESAJ YAZI BOYUTU — canlı önizleme + duraklı slider (yeni).
  5. METİN BOYUTU (arayüz) — mevcut 5 kademeli global tercih; başlığı ve alt metni mesaj
     puntosundan ayırt edilecek şekilde yaz (K5: ikisi bağımsız).
  6. DÜZEN — mevcut workspace layout seçimi.
  7. Toggle kartı: "Sıkı yerleşim" / "Satır aralığını daraltır" ve "Sistem yazı boyutunu izle" /
     "Cihaz erişilebilirlik ayarını uygular" (ikisi de varsayılan KAPALI).
  8. Alt not: 11.5/500 lh 1.55 — "Yazı boyutu yalnızca DM ve kanal mesaj gövdesini ölçekler;
     başlıklar, zaman damgaları ve arayüz metinleri sabit kalır."
Hiçbir mevcut ayar silinmez.

KONTRAT
1. Başlık: geri + "Görünüm" 21/800 ls -.025em.
2. TEMA kartı: 3 eşit sütun; her biri 56px yüksek mini önizleme (r14) + etiket. Seçili → 2px accent
   kenar + etiket 12/800 accent; diğerleri 1px border + 12/600 textSecondary. Önizlemeler:
   açık = screen zemin + surface/accent 7px çubuklar, koyu = messaging koyu zemin + kart/accent
   çubuklar, sistem = ikiye bölünmüş. (Mevcut `redesignAppearancePreview` token'ları kullanılır.)
3. MESAJ YAZI BOYUTU başlığı + sağda CANLI değer "Orta · 15 px" 11.5/800 accent.
4. Canlı önizleme: r18 screen zemin blok, padding 12; içinde gelen (surface, r16/6) ve giden
   (accent, r16/6) birer balon. Gövdeler punto ile ölçeklenir, SAATLER 10.5px SABİT kalır.
   Metinler: "Yazı boyutunu buradan ayarla" / "Sohbetlerde bu şekilde görünecek".
5. Slider: solda 12/700 "A", sağda 19/800 "A"; track 6px r3, dolu kısım accent, 4 durak (5px
   noktalar; dolu kısımdakiler beyaz), thumb 22px surface + 1.5px kenar + `elevation.sliderThumb`.
   Sürükleme DURAKLARA KİLİTLENİR (serbest değer yok), her durakta hafif haptik.
   Durak etiketleri: Küçük / Orta / Büyük / En büyük — 11/600, aktif 11/800 accent.
6. Toggle: 46x28 r14, padding 2, thumb 24px surface; açık accent + thumb sağda, kapalı toggleOff +
   thumb solda; 160ms ease-out.
7. "Sistem yazı boyutunu izle" AÇIKKEN: efektif punto = kademe × OS ölçeği, 14–22'ye clamp;
   slider devre dışı (opacity .5) ve sağdaki değer etiketi EFEKTİF px'i gösterir.
8. Davranış: değişiklik ANINDA uygulanır (reload yok); açık sohbetler ve önizleme aynı karede
   güncellenir. Kalıcılık: AsyncStorage + M4A'daki ayar senkron ucu (cihazlar arası).
   Sohbet açıkken punto değişirse kaydırma konumu son okunan mesajda kalır (anchor: en alttaki
   görünür mesaj id'si).
9. Erişilebilirlik: slider `accessibilityRole="adjustable"`, `accessibilityValue.text` = kademe
   adı, artır/azalt aksiyonları duraklar arasında gezer.

TESTLER
- component-tests/mobile-appearance-settings-redesign.test.tsx (MEVCUT — genişlet): 8 bölümün
  hepsi var, mesaj puntosu slider'ı 4 durağa kilitleniyor, değer etiketi canlı, follow-system
  açıkken slider devre dışı + efektif px, toggle varsayılanları kapalı, önizleme balonlarında saat
  sabit kalıyor.
- component-tests/mobile-appearance-settings-screen-integration.test.tsx yeşil kalmalı.
- scripts/mobile-message-typography.test.ts (M0) genişlet: senkron yazımı ve clamp.

KAPANIŞ DOĞRULAMASI (bu dalganın son işi)
1. PROMPT.md §8'deki 20 kabul kriterini TEK TEK dolaş; her biri için "nerede karşılandığı"
   (dosya:satır) veya "karşılanmadı + neden" yaz. 20. madde (yan yana fark yok) cihazda
   kullanıcıya bırakılır — o maddeye "cihaz doğrulaması bekliyor" yaz.
2. PROMPT.md §9 "Yapılmayacaklar" listesini grep ile denetle: kanalda balon kalmış mı, ayrı satır
   zaman damgası, dolgulu alıntı kutusu, ikame font, gövdede 14px altı punto.
3. Tüm doğrulama komutlarını koş, çıktıları rapora yapıştır.
4. i18n denetimi: yeni anahtarların tamamı tr+en; `pnpm --filter @wizards/mobile test` içindeki
   copy-parity testi yeşil.
5. Kullanıcıya 9 ekran için cihaz doğrulama listesi çıkar (her ekran = ilgili PNG + bakılacak
   3–6 madde).

YAPMA: mevcut ayar seçeneklerini silmek, punto ayarını arayüz metinlerine uygulamak, slider'ı
serbest bırakmak, gövdeyi 14px altına indirmek.
```

---

## Ek — Bu iş boyunca geçerli sapma kaydı

Her dalga raporunun 3. başlığı (SAPMA RAPORU) bu dosyanın altına biriktirilir. Bilinen, en baştan
kabul edilmiş iki sapma:

1. **Visual gate baseline'ları**: `apps/mobile/scripts/visual-baselines/whispr-mobile-redesign/v1`
   altındaki `1b` (kanal) ve `1c` (DM inbox) anchor'ları bu yenilemeyle görsel olarak değişir.
   Baseline yenilemesi cihaz capture gerektirir ve kullanıcıya aittir; hiçbir dalga baseline
   dosyasına dokunmaz.
2. **RN'de `--msg-size` yok**: tasarımın CSS değişkeni mekanizması React Native'de
   `useMobileMessageBodyStyle()` hook'u olarak karşılanır. Davranış (tek kaynak, yalnız gövdeyi
   ölçekler, anında yansır) birebir korunur.
