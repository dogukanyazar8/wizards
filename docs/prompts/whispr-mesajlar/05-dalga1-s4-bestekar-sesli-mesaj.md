# Dalga 1 · Ş4 — Bestekar + sesli mesaj

**Ön koşul:** Dalga 0 kapısı yeşil. **Paralel:** Ş1, Ş2, Ş3 ile aynı anda.

Kapsam: SPEC-MESAJLAR §5.6 — biçimlendirme şeridi, giriş satırı, kısayollar; ve karar #5'in
uçtan uca sesli mesajı.

---

## Sahiplenilen dosyalar

```
apps/web/src/components/chat/message-input.tsx
apps/web/src/components/chat/message-input.test.tsx            (yeni)
apps/web/src/components/chat/composer-formatting-bar.tsx       (yeni — message-input'tan çıkarılır)
apps/web/src/components/chat/voice-recorder.tsx                (yeni)
apps/web/src/components/chat/voice-recorder.test.tsx           (yeni)
apps/web/src/components/chat/voice-message-player.tsx          (yeni)
apps/web/src/components/chat/message-editor.tsx
apps/web/src/lib/messages/voice-capture.ts + *.test.ts         (yeni — saf mantık)
apps/web/src/lib/messages/attachment-rules.ts                  (yalnız MIME beyaz listesi)
```

**Dokunulmaz:** `message-item.tsx` (Ş5), `message-list.tsx` (Ş5), anket modalı (Ş6).

---

## Sözleşme (dışa verdiklerin)

```ts
export type MessageComposerProps = {
  // ... mevcut prop'lar korunur
  /** Ş6 anket modalını açar. Bestekar modalı BİLMEZ. */
  onOpenPoll?: () => void;
  /** Anket girişinin çizileceği yer: 1:1 DM'de de aktif (karar #12). */
  pollEnabled?: boolean;
};
```

Ş6, `onOpenPoll` ile bağlanır. Bestekar `PollComposer`'ı içe aktarmaz — iki şerit aynı dosyaya
yazmasın diye.

---

## İş

### 1. Biçimlendirme şeridi ayrı bileşene çıkar

`message-input.tsx` bugün 1756 satır ve şeridi kendi içinde çiziyor. Şerit
`composer-formatting-bar.tsx`'e taşınır. **Davranış değişmez** — taşıma mekaniktir, mevcut
`insertOrderedList` / `insertCodeBlock` vb. yardımcılar prop olarak geçirilir.

Dokuz araç, SPEC'teki sırayla ve tam ipuçlarıyla:

| Araç    | Etiket        | İpucu       |
| ------- | ------------- | ----------- |
| `B`     | Kalın         | Ctrl+B      |
| `I`     | İtalik        | Ctrl+I      |
| `U`     | Altı çizili   | Ctrl+U      |
| `S`     | Üstü çizili   | `~~metin~~` |
| `•—`    | Maddeli liste | `-`         |
| `1.`    | Sıralı liste  | `1.`        |
| `>`     | Alıntı        | `>`         |
| `` ` `` | Satır içi kod | `` `kod` `` |
| ` ``` ` | Kod bloğu     | ` ``` `     |

Her araç min 31×31 radius 9; şerit kutusu radius `15 15 0 0`, `--surface-secondary`, alt kenarsız.
Sağda `Markdown kısayolları desteklenir` (11 muted).

`Aa` açıkken bestekar alanının üst köşe yarıçapı düzleşir (`0 0 15px 15px`) — mevcut
`formattingOpen` mekaniği korunur, yalnız yarıçap değerleri SPEC'e hizalanır (bugün 22).

### 2. Giriş satırı (SPEC §5.6)

Dış kutu padding `0 22 18`; alan radius 15, `--surface-card`, `1px --border`.

- Solda ek (+) butonu.
- Placeholder: DM'de `{ad}'e mesaj yaz`, grupta `{grup} grubuna yaz` — i18n
  `messages.composer.placeholderDm` / `placeholderGroup`, ad interpolasyonu ile.
  Türkçe iyelik eki (`Selin'e`, `Mert'e`) sözlükteki `{name}'e` kalıbıyla verilir; ünlü uyumu
  **çözülmez**, tasarımdaki kalıp neyse odur.
- Sağda 34×34 butonlar: `Aa` (açıkken `--primary/0.16` zemin + primary), emoji, `GIF`, ses kaydı,
  `Anket` (`pollEnabled` iken), sonra gönder (40×40 radius 12, `--primary`, beyaz uçak ikonu).
- Kısayollar: `Enter` gönder, `Shift+Enter` satır, `Ctrl/Cmd+B|I|U`, `Esc` yanıt/düzenlemeyi
  iptal. Hepsi bugün var; testle **kilitlenir** (bugün test yok).

### 3. Sesli mesaj — uçtan uca (karar #5)

**Saf katman** `lib/messages/voice-capture.ts` (DOM yok, test edilebilir):

```ts
export function rmsToDbfs(rms: number): number;
export function bucketSamples(samples: readonly number[], buckets: number): number[];
export function toWaveform(dbfsSamples: readonly number[]): number[]; // 0..100, 64 kova
export function shouldStopForLimit(elapsedMs: number): boolean; // ≥ 5 dk
```

`normalizeWaveform` ve `formatVoiceDuration` **Ş0.3'ün** `@wizards/types/voice-message`
dosyasından gelir; burada ikinci kez yazılmaz.

**Kayıt bileşeni** `voice-recorder.tsx`:

1. Mikrofon izni: `navigator.mediaDevices.getUserMedia({ audio: true })`. Reddedilirse
   `messages.errors.micDenied` ve kayıt durumundan **çıkılır** (buton pasifleşmez, tekrar
   denenebilir).
2. `MediaRecorder` + `AudioContext.createAnalyser()`; genlik ~50ms'de bir okunur, dizide birikir.
   Kayıt bitince `toWaveform` 64 kovaya indirir. **Sahte dalga formu yok** — gerçek dBFS
   (mobil tarafın öğrendiği ders; `project_messaging_voice_1b_1c` notu).
3. Kayıt sırasında: kırmızı nokta + geçen süre (`formatVoiceDuration`) + canlı dalga formu +
   `İptal` ve `Gönder`. `Esc` iptal eder ve kaydı **atar**.
4. 5 dakikada otomatik durur ve gönderime hazır hâle geçer (atmaz).
5. Sekme arka plana geçerse kayıt **durur** — `visibilitychange` ile; kullanıcı ne kaydettiğini
   görmediği bir sesi göndermez.
6. Çıktı `Blob` → mevcut ek yükleme yolu (`UploadThing`), `durationMs` + `waveform` alanlarıyla
   birlikte (Ş2 §6'nın kabul ettiği alanlar).
   - **Tuzak:** UploadThing `awaitServerData` PUT'u açık tutuyor (`project_mobile_upload_hang`).
     Yükleme çağrısı bu bayrağı **kullanmaz**.
7. Kaynak temizliği: `MediaRecorder.stop()` + her `MediaStreamTrack.stop()` + `AudioContext.close()`.
   Bileşen unmount'ta da temizler. Test bunu doğrular — açık kalan mikrofon sekme göstergesinde
   kalır ve kullanıcıya gizli kayıt izlenimi verir.

**Oynatıcı** `voice-message-player.tsx` (Ş5 mesaj satırında monte eder, ama **bu şerit yazar**):

- 40px oynat/duraklat butonu, 64 kovalı dalga formu (ilerledikçe `--primary` dolgu), süre.
- Dalga formu boş gelen eski ekler için düz çubuk.
- Tek seferde tek ses çalar (modül seviyesinde tek `HTMLAudioElement` kaydı).
- Klavye: `Space` oynat/duraklat, `←/→` 5sn atlama; `role="slider"` + `aria-valuenow`.
- `prefers-reduced-motion` açıkken dalga formu animasyonu durur, dolgu anlık atlar.

### 4. Metin girişindeki anket şablonu kaldırılır

`insertPollTemplate` ve `chat.input.pollTemplate` / `pollQuestion` anahtarları **kaldırılır**:
`Anket` butonu artık `onOpenPoll()` çağırır (karar #1). Eski markdown anketlerin **render**'ı
(`parsePollBlock`, `message-item.tsx`) Ş5'te korunur — yalnız üretim yolu kapanır.

---

## Test

`message-input.test.tsx`:

- `Aa` şeridi açılıp kapanır; açıkken alanın üst yarıçapı düzleşir (sınıf iddiası).
- Dokuz aracın dokuzu `aria-label` taşır ve doğru işaretlemeyi ekler.
- `Enter` gönderir, `Shift+Enter` göndermez, `Ctrl+B` kalın ekler, `Esc` yanıtı iptal eder.
- `pollEnabled=false` iken anket butonu çizilmez; `true` iken `onOpenPoll` çağrılır.

`voice-recorder.test.tsx` (MediaRecorder + getUserMedia sahte):

- İzin reddi → hata metni, kayıt durumu kapanır.
- 5 dakikada otomatik durur, kayıt **atılmaz**.
- `Esc` kaydı atar ve akışları durdurur.
- Unmount'ta `track.stop()` ve `AudioContext.close()` çağrılır.

`voice-capture.test.ts`: `bucketSamples` tam 64 kova döndürür (girdi 7 ya da 7000 örnek olsun);
`toWaveform` 0–100 aralığında tamsayı verir; sessizlik hepsini 0 yapar, tepe 100'ü aşmaz.

## Kapı

```bash
pnpm --filter @wizards/web test -- --test-name-pattern "(message-input|voice)"
pnpm typecheck && pnpm lint
```

Rapor: `raporlar/05-rapor.md`. §"Sözleşme değişikliği" `MessageComposerProps` eklerini ve
`voice-message-player.tsx`'in dışa verdiği prop'ları yazar (Ş5 okuyacak).
