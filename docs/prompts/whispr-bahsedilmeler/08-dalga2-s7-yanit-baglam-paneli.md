# Dalga 2 · Ş7 — Satır içi yanıt kutusu + Bağlam paneli (326)

**Ön koşul:** Dalga 1 kapısı yeşil. **Paralel:** Ş5, Ş6, Ş8.

---

## Sahiplenilen dosyalar

- `apps/web/src/components/mentions/mention-reply-box.tsx` (yeni) + `.test.tsx`
- `apps/web/src/components/mentions/mention-context-panel.tsx` (yeni) + `.test.tsx`
- `apps/web/src/lib/mentions/reply-target.ts` (yeni) + `.test.ts`

**Okunur, yazılmaz:** `components/chat/message-input.tsx`, `components/chat/reply-preview.tsx`,
`components/chat/thread-panel.tsx`, `components/chat/emoji-picker.tsx`, `lib/dm/client.ts`,
`lib/workspace/client.ts`.

---

## İş

### 1. Satır içi yanıt kutusu (SPEC §5.2)

Kartın içinde, eylem satırının altında; Ş6'nın `replySlot`'una takılır.

- Kabuk: marginTop 11, padding `11 12`, radius 13, `--surface-secondary/0.8`,
  `1px --primary/0.35`.
- **Meta satırı:** 13px yanıt ikonu + `{author} mesajına yanıt · {sunucu} › #{kanal}`
  (11.5 muted; ad ve kaynak 600 `--text-secondary`).
  Thread kartında metin `{author} mesajına thread'de yanıt · …` (K10).
- **Giriş satırı:** 28px kendi avatarın · alan height 38 radius 12 `--surface-base`
  `1px --border/0.7`, placeholder `Yanıt yaz — kanala gönderilir`
  (thread hedefinde `… thread'e gönderilir`) · içinde emoji ve dosya ekle ikon butonları
  (26×26 radius 8) · sağda gönder 38×38 radius 12 `--primary`.
- **Alt satır** (11px muted): `Enter gönder` · `Shift+Enter satır` · `Esc kapat`,
  sağda `Vazgeç` (600 11.5 `--primary`).

Davranış:

- `Enter` gönderir, `Shift+Enter` satır açar, `Esc` kapatır (kaydedilmemiş metin varsa
  **kaybolmaz**: metin kart kimliğine göre oturum belleğinde tutulur, kutu tekrar açıldığında
  geri gelir).
- Gönderim başarılı olduğunda kart **okundu** sayılır ve kutu kapanır.
- Gönderim hatasında kutu açık kalır, metin durur, satır altında hata metni çıkar.
- Boş/yalnız boşluk metin gönderilemez (gönder butonu `disabled`).
- Dosya ekleme mevcut yükleme yolunu kullanır; yeni yükleme kodu yazılmaz. Yükleme bu şeritte
  **kapsam dışıysa** buton `TODO(api):` ile devre dışı bırakılır ve rapora yazılır — sessizce
  hiçbir şey yapmayan bir buton bırakılmaz.

### 2. Yanıt hedefi (`reply-target.ts`, K10)

```ts
resolveReplyTarget(mention):
  | { type: "channel"; channelId: string; replyToId: string }
  | { type: "thread"; channelId: string; parentMessageId: string }
  | { type: "dm"; conversationId: string; replyToId: string }
```

- `kind === "thread"` → `thread` hedefi.
- `source.type === "dm"` → `dm`.
- diğer hepsi → `channel`.
- Hedefe göre **mevcut** gönderme istemcisi çağrılır (`lib/workspace/client`, `lib/dm/client`);
  bu şerit yeni gönderme ucu yazmaz.

### 3. Bağlam paneli (SPEC §6)

- Genişlik 326, `flex:none`, `--surface-panel`, sol kenar `1px --border/0.45`.
- **Başlık:** padding `15 16 13`, alt hairline. `Bağlam` 600 14.5 display; altında 16×16
  radius 5 sunucu tile + `{sunucu} › #{kanal}` 11.5 muted. Sağda kapat 30×30 radius 10.
- **Gövde:** padding `15 16`, gap 14, `overflow-y:auto`. Bahsetmenin ±2 mesajı
  (`GET /api/v1/mentions/[mentionId]/context`, Ş3). Her satır 28px avatar + ad 600 12.5 +
  saat 10.5 muted + metin 12.5/1.5.
  Bahsetmenin kendisi vurgulu: padding `10 12`, radius 13, `--primary/0.1`,
  `1px --primary/0.3`, metin `--foreground`. Diğer satırlar padding `2 0`, zemin/kenar yok.
- **Altlık:** padding `13 16`, üst hairline. `Kanalda aç` (flex:1, height 36, radius 11,
  `--primary`, `#fff` 600 12.5) + `Thread'de yanıtla` (height 36, padding `0 13`,
  `--surface-card`, `1px --border`).
  - `Kanalda aç` → mesajın kalıcı adresine gider ve bahsetmeyi okundu yapar.
  - `Thread'de yanıtla` → thread'i olmayan bahsetmede **gizlenir** (var olmayan bir yere
    götüren buton bırakılmaz); DM bahsetmesinde de gizlenir.
- İskelet olarak `ThreadPanel`'in düzeni yeniden kullanılır; `ThreadPanel` dosyası
  **değiştirilmez**, ortak parça çıkarmak gerekiyorsa yeni dosyaya kopyalanır ve rapora yazılır.
- Yükleme: 4 satırlık `Skeleton`. Hata: yeniden dene düğmesi.

### 4. Kırılımlar

- `<1100px`: panel akışın **üstüne binen katman** (overlay) olur — sağdan girer, arkasında
  `--backdrop/0.5`, `Esc` ve dışına tıklama kapatır, odak tuzağı kurulur.
- `≥1100px`: sütun olarak durur, akış 456px'e daralır, odak tuzağı **kurulmaz**
  (sütun bir diyalog değildir).
- Eşik CSS'te seçilir (tuzak #8); JavaScript genişlik okuması ile değil.

### 5. Durum disiplini

- Aynı kartta `Bağlamda gör`'e tekrar basmak paneli kapatır.
- Panel açılırken açık `⋯` menüsü ve yanıt kutusu kapanır — kural Ş5'in indirgeyicisinde;
  bu şerit yalnız `onClose` çağırır.

---

## Kabul

- [ ] Yanıt kutusu tasarımdaki ölçülerde; `Enter`/`Shift+Enter`/`Esc`/`Vazgeç` çalışıyor.
- [ ] Gönderim sonrası kart okundu ve kutu kapalı; hata durumunda metin kaybolmuyor.
- [ ] Thread kartında yanıt thread'e, DM kartında DM'e, diğerlerinde kanala gidiyor
      (`reply-target.test.ts` üç dalı da doğruluyor).
- [ ] Panel 326px; bahsetme satırı `--primary/0.1` + `--primary/0.3` ile vurgulu.
- [ ] `Kanalda aç` doğru adrese gidiyor ve bahsetmeyi okuyor; `Thread'de yanıtla` yalnız
      thread'i olan kanal bahsetmesinde görünüyor.
- [ ] `<1100px` overlay, `Esc` kapatıyor, odak tuzağı çalışıyor, kapanışta odak tetikleyiciye
      dönüyor.
- [ ] Panel açıkken akış 456px ve kartlar bozulmuyor.
- [ ] `ThreadPanel` dosyası değişmedi.

## Kapı

```
pnpm --filter @wizards/web typecheck
pnpm --filter @wizards/web lint
pnpm --filter @wizards/web test
```
