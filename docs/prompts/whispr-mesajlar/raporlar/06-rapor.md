# Dalga 2 · Ş5 — Sohbet gövdesi — rapor

**Tarih:** 2026-08-20 · **Branch:** `uat` · **Durum:** kapı yeşil, commit edilmedi.

---

## Ne yapıldı

| Katman                   | Dosya                                                                     |
| ------------------------ | ------------------------------------------------------------------------- |
| Saf metin çıkarımı       | `lib/messages/message-blocks.ts` (+13 test)                               |
| Başlık                   | `components/messages/conversation-header.tsx` (+9 test)                   |
| Sabitlenen şerit + liste | `components/messages/pinned-strip.tsx`, `pinned-list-sheet.tsx` (+8 test) |
| Satır                    | `components/chat/message-item.tsx` (+16 sözleşme testi)                   |
| Şerit/menü               | `components/chat/message-toolbar.tsx`                                     |
| Liste                    | `components/chat/message-list.tsx`                                        |

### Başlık tek bileşen oldu

`DmConversationHeader` ve `DmGroupConversationHeader` **silindi**; ikisinin yerine tek
`ConversationHeader` geldi. Ayrı iki bileşen sağdaki ikon şeridini ve panel vurgusunu iki kez
taşıyordu.

**250 üyeli grupta roster çekilmiyor.** Yığın en çok üç avatar çiziyor, fazlalık `memberCount`
alanından türüyor — taşınan kayıt sayısından değil. Bu ayrım önemli: fazlalık `members.length`'ten
türeseydi, çağıran dört kayıt taşıdığı için 250 üyeli grupta `+1` yazardı.

**Panel vurgusu `aria-pressed` taşıyor.** Yalnız renk olsaydı ekran okuyucu kullanıcısı hangi
panelin açık olduğunu hiç öğrenemezdi.

### Sabitlenen şerit (karar #7)

Eski şerit `DMConversationDTO.pinnedMessage` okuyordu: **tek** bir sabit, sayı yok, kapatma yok,
listeye giriş yok. Yeni şerit Ş2'nin ucundan liste çekiyor, sayıyı yazıyor, kapanıyor ve
`Tümünü gör` ile tam listeyi açıyor.

Kapatma **kalıcı değil**: `dismissedId` yalnız o an görülen sabiti saklıyor, yeni bir sabit
gelince şerit geri dönüyor. Kalıcı olsaydı, birinin sabitlediği bir mesaj diğerine hiç
görünmezdi.

Listede kaldırma yetkisi uçtan geliyor (`removable`). İstemci "kendi mesajı mı" diye tahmin
etseydi, başkasının mesajını da kaldırabilen yöneticiyi kaçırırdı.

### Satır — SPEC §5.3 / §5.4

- **Eylem şeridi `--act` ile.** `opacity-[var(--act,0)]` + `group-hover` **ve**
  `group-focus-within`. Yalnız hover olsaydı tepki/yanıt/sabitle klavyeyle hiç erişilemezdi.
  Şerit artık SPEC'in beş düğmesini taşıyor (tepki · yanıt · thread · sabitle · `...`).
- **`...` menüsü gerçek bir menü oldu.** 206px, `role="menu"`, beş satır. Masaüstünde liste,
  dar ekranda eski eylem çubuğu kalıyor: parmakla ulaşılan bir yüzeyde 13px menü satırı küçük
  bir hedef.
- **Yetkisiz satır çizilmez**, pasif bırakılmaz. Pasif bir `Düzenle`, kullanıcıya yapamayacağı
  bir şeyi göstermekten başka bir şey demez.
- **Rol çipi** (`Yönetici`) ve **bahsetme şeridi** eklendi. Bahsetme türetimi memolu ve satırın
  içinde: listede olsaydı her kaydırma karesinde bütün sayfa için yeniden hesaplanırdı.
- **Anket yuvası** (`pollSlot`) açıldı. Satır anketi **bilmiyor**; test bunu kilitliyor
  (`castPollVote(`, `usePoll(`, `socket.on("poll:updated"` kaynakta geçmiyor).

### DM sabitleme yolu ayrı

Kanalda mesajın kendisi güncelleniyor; DM'de sabit listesi ayrı bir varlık ve onu konuşma
tutuyor. Satır kendi başına uç çağırsaydı şerit değişikliği görmez, sayı güncellenmezdi — bu
yüzden satır yalnız `onTogglePin` ile haber veriyor.

---

## Bulunan hata: denetim aracını bozan ters tırnak

`copy-audit` yorumları maskelerken kaynağı karakter karakter tarıyor ve bir ters tırnağı şablon
değişmezinin başlangıcı sanıyor. Bir **regex değişmezinde tek sayıda** ters tırnak varsa
(``/`([^`
]+)`/`` üç tane) tarayıcı dosyanın geri kalanını dize sanıyor, yorumları
maskelemeyi bırakıyor ve Türkçe açıklamaları "sözlüğe taşınmamış metin" diye bildiriyor.

Bütçe testi bunu `message-blocks.ts`'te yakaladı. Çözüm kaynağında: desenler ``` escape'iyle
yazıldı, dosyada hiç ham ters tırnak kalmadı. **Aynı tuzak `message-item.tsx`'te de var**
(`formatMessageContentForMarkdown` içindeki bölme deseni) ve `components/chat` bütçesindeki
copy borcunun bir kısmı bundan olabilir — Dalga 3'te ölçülmeli.

---

## Plandan sapmalar

1. **`message-blocks.ts` blok listesi çizim için kullanılmıyor.** Plan `blocks` sözleşmesini
   istiyordu; modül onu üretiyor (`toMessageBlocks`) ama gövde hâlâ `react-markdown` ile
   çiziliyor — plan da bunu şart koşuyordu. Bloklar yalnız `toPlainText`/`excerpt`/`mentionsUser`
   için var, yani ikinci bir ayrıştırıcı yazılmadı.
2. **Satır testleri kaynak üzerinden.** `MessageItem` dört sağlayıcı istiyor (`useSocket`,
   `useQueryClient`, `useI18n`, `useAccountPreferenceRuntime`); dördünün sahtesini kurmak
   sınananı sahte kurulumunun altında bırakırdı. Yüzeyler kaynakta, saf mantık kendi modülünde,
   davranış Dalga 3'te.
3. **`Mesajı ilet` geri çağrısı bağlanmadı.** Menü satırı `onForward` verilmediği sürece
   **çizilmiyor**; iletme akışı Ş8'in kişi seçicisini istiyor ve o seçici bu turda ana alandaki
   boş durumda kullanılıyor. Bkz. açık kalanlar.
4. **Kanal ekranlarının öncesi/sonrası görüntüsü yok.** Karar #10 kanal tarafını da kapsıyor ve
   satır görsel dili değişti; ekran görüntüsü gerçek tarayıcı ister, Dalga 3'e taşındı.

---

## Kapı çıktısı

```
pnpm typecheck                   ✔ 5/5
pnpm lint                        ✔ 5/5
pnpm --filter @wizards/web test  ✔ 3583 / 3583
```

---

## Açık kalanlar

- **`Mesajı ilet` ucu yok.** Menü satırı hazır ve geri çağrı bekliyor; iletme bir hedef seçici
  (Ş8'in `NewMessagePicker`'ı) ve bir uç istiyor. Dalga 3'ten önce ya bağlanmalı ya SPEC'ten
  düşülmeli.
- **`dmConversationInclude` roster'ın tamamını çekiyor** (`participants` üzerinde `take` yok).
  250 üyeli bir grupta bu 250 satır demek ve başlık yalnız dördünü kullanıyor. Sözleşme
  değişikliği olduğu için Dalga 2 ortasında yapılmadı; `TODO(api)` olarak Dalga 3'e.
- Satırın gerçek tarayıcı davranışı (hover şeridi, menü konumu, sanallaştırma ölçümü) Dalga 3.
