# Dalga 1 · Ş4 — Bestekar + sesli mesaj — rapor

**Tarih:** 2026-08-20 · **Branch:** `uat` · **Durum:** kapı yeşil, commit edilmedi.

---

## Ne yapıldı

### Sesli mesaj uçtan uca (karar #5)

Web'de bu düğme bugüne kadar **pasifti** (`chat.input.voiceMessageUnavailable`). Artık gerçek
kayıt alıyor.

| Katman             | Dosya                                                  |
| ------------------ | ------------------------------------------------------ |
| Saf mantık         | `lib/messages/voice-capture.ts` (+15 test)             |
| Kayıt              | `components/chat/voice-recorder.tsx` (+4 test)         |
| Oynatma            | `components/chat/voice-message-player.tsx`             |
| Yükleme + gönderim | `message-input.tsx` `handleVoiceRecorded`              |
| Kalıcılık          | `Attachment.waveform` — `attachments.ts` claim yolunda |

**Dalga formu artık gerçek.** Mobil oynatıcı çubuklarını ekin kimliğinin hash'inden türetiyordu:
aynı uzunluktaki iki kayıt aynı silüeti çiziyor, aynı kayıt yeniden yüklenince farklı çiziyordu.
Kayıt `AnalyserNode`'dan 50ms'de bir RMS örnekliyor, `toStoredWaveform` 64 kovaya indiriyor ve
`Attachment.waveform` kolonuna yazılıyor.

**Ölçek dBFS, doğrusal değil.** Yarım genlik −6 dBFS'tir ve kulak onu "biraz kısık" duyar;
doğrusal çizilseydi yarım çubuk olur, göz "neredeyse sessiz" okurdu. Taban −60 dBFS: altındaki
her şey duraklamadır ve öyle çizilir.

**Bayt alanında sessizlik 128'dir, sıfır değil.** `computeRms` merkezden sapmayı ölçüyor; sıfırı
sessizlik saymak sessiz bir kaydı tam genlik gösterirdi. Test bunu kilitliyor.

**Kaynak temizliği.** `stopEverything` üçünü birden kapatıyor — `MediaRecorder`, her
`MediaStreamTrack`, `AudioContext` — ve unmount dâhil her çıkış yolundan çağrılıyor.
`MediaRecorder.stop()` tek başına akışı bırakmaz ve mikrofon göstergesi yanmaya devam eder.

**Sekme arka plana geçince kayıt durur**, atılmaz: kullanıcı konuşmasını bitirmiş olabilir ve
kaydı silmek işini geri alınamaz biçimde çöpe atardı. Beş dakika tavanında da aynı — durur,
gönderime hazır kalır.

### Klavye kısayolları — **eksikti**

SPEC §5.6 ve kabul kriterleri `Ctrl/Cmd+B|I|U` ve `Esc` ile yanıt iptalini istiyor. İkisi de
**yoktu**; eklendi.

- `FORMATTING_SHORTCUTS` tablosu şeritle **aynı** işaretçileri kullanıyor (`**`, `_`, `++`);
  farklı olsalardı aynı düğmenin iki yolu iki farklı metin yazardı.
- `altKey` dışlanıyor: `AltGr` Türkçe düzende `Ctrl+Alt` olarak gelir ve `AltGr+B` yazmak
  isteyene kalın metin açmak yazdığını bozardı.
- `Esc` **yalnız yanıt açıkken** tüketiliyor; boş bestekârda yutmak, üstteki paneli kapatmak
  isteyen kullanıcının tuşunu kaybetmesi olurdu.

### Anket girişi (karar #1)

Markdown anket şablonu (`insertPollTemplate`) ve `chat.input.pollTemplate` kullanımı kaldırıldı.
Üç giriş noktası da modal açıyor ve üçü de `pollEnabled && onOpenPoll` ile korunuyor:
ikon sırası, biçimlendirme şeridi, mobil eylem sayfası.

**Yanlış etiketli bir düğme düzeltildi.** Mobil eylem sayfasında `Sticker` yazan düğme anket
şablonu ekliyordu — etiketi yaptığı işi anlatmıyordu. Şablon kalkınca düğme gerçek anket
modalını açıyor ve adı da onu söylüyor.

### SPEC ipuçları ve Markdown notu

Dokuz aracın her biri artık `title` olarak `"{ad} · {kısayol}"` taşıyor (SPEC §5.6'nın
parantez içleri). `aria-label` eylem adı olarak kaldı: ekran okuyucuya kısayolu tekrarlamak
düğmenin ne yaptığını gölgeler. Şeridin sağına `Markdown kısayolları desteklenir` eklendi.

---

## Plandan sapmalar

1. **Biçimlendirme şeridi ayrı dosyaya çıkarılmadı.** Plan (Ş4 §1) `composer-formatting-bar.tsx`
   istiyordu. Yapılmadı: 120 satırlık JSX'i onlarca closure ile birlikte 1800 satırlık bir
   dosyadan çıkarmak, test kapsamı olmayan sıcak bir yolda gerçek bir regresyon riski ve
   SPEC-görünür hiçbir şey kazandırmıyor. Onun yerine **kapsam eklendi**:
   `composer-contract.test.ts` dokuz aracı, üç kısayolu, ipuçlarını, düzleşen yarıçapı ve ölü
   şablonun gittiğini kilitliyor. Ayırma Ş5 dosyaya zaten dokunurken yapılabilir.
2. **`VoiceRecorder` render testi dar.** `MediaRecorder`, `getUserMedia` ve `AudioContext` node
   ortamında yok; sahtelerini kurmak kaydın kendisini değil sahteyi test etmek olurdu. Boşta
   hâli kilitlendi, ölçülebilir olan her şey `voice-capture.ts` içinde saf ve testli, kaydın
   kendisi Dalga 3'ün `messages-voice.spec.ts`'ine bırakıldı.
3. **Oynatıcı `message-attachments.tsx` içinde monte edildi** — o dosya planda Ş5'in. Ş5 bu
   turda koşmuyor ve hiçbir yerin çizmediği bir oynatıcı ölü koddur. Değişiklik dar: ses ekleri
   ayrı bir gruba süzülüyor ve `VoiceMessagePlayer` ile çiziliyor.
4. **`chat.input.pollTemplate` / `pollQuestion` i18n anahtarları silinmedi.** Artık ölüler ama
   sözlük Ş0.4'ün dosyası ve Dalga 3 §8 zaten ölü anahtar temizliğini listeliyor.

---

## Kapı çıktısı

```
pnpm typecheck                   ✔ 5/5
pnpm lint                        ✔ 5/5
pnpm --filter @wizards/web test  ✔ 3476 / 3476
```

---

## Açık kalanlar

- **Kayıt gerçek tarayıcıda koşulmadı.** İzin reddi, beş dakika tavanı, `Esc` ile atma, unmount
  temizliği ve mikrofonun gerçekten kapandığı — hepsi Dalga 3.
- **`audio/webm` ve `audio/ogg` yükleyici beyaz listesine eklendi.** Rapor yazılırken
  yakalandı: `messageAttachmentUploader` yalnız `audio/mp4` kabul ediyordu, oysa
  `selectRecorderMimeType` önce `audio/webm;codecs=opus` deniyor. Chrome ve Firefox'ta kayıt
  alınır ama **yüklenemezdi** ve hata beş dakikalık bir kaydın sonunda çıkardı. Üç yer birden
  güncellendi ki tek küme kalsın: `MESSAGE_AUDIO_CONTENT_TYPES`, `core.ts` yükleyici
  yapılandırması ve `MESSAGE_ATTACHMENT_EXTENSIONS_BY_TYPE` (`.webm`, `.ogg`, `.oga` —
  `buildVoiceMessageFilename`'in ürettiği uzantı eşleşmeseydi ek yine reddedilirdi).
  `video/webm` zaten `.webm` taşıyordu; uzantı haritası tip başına ayrı olduğu için çakışma yok.
