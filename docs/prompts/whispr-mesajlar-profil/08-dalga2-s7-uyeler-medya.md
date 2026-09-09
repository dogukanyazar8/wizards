# Dalga 2 · Ş7 — Üyeler ve Medya sekmeleri

> **Başlatma prompt'u.** Aşağıdaki bloğun tamamını yeni bir Claude Code oturumuna ver.
> **Ön koşul:** Dalga 0 kapısı geçti. Ş5 panel yuvası + tint yardımcısı sözleşmesi
> (`raporlar/06-rapor.md`), Ş3 medya ucu sözleşmesi (`raporlar/04-rapor.md`) okunur.

---

Whispr monorepo, `uat` dalı. Görev: SPEC §15.4 (Üyeler, yalnız grup) ve §15.5'in Medya bölümünü
yaz. Karşılıkları `screens/20` ve `screens/17`.

Önce oku: `docs/prompts/whispr-mesajlar-profil/00-ortak-baglam.md` ve `SPEC-MESAJLAR.md` §15.4,
§15.5 "Medya". Ölçüler `Mesajlar.dc.html` `L1079–L1235`.

## Sahiplenilen dosyalar

- `apps/web/src/components/messages/profile-tab-members.tsx` (yeni) + `.test.tsx`
- `apps/web/src/components/messages/profile-invite-link-card.tsx` (yeni) + `.test.tsx`
- `apps/web/src/components/messages/profile-tab-media.tsx` (yeni) + `.test.tsx`
- `apps/web/src/components/messages/profile-media-grid.tsx` (yeni) + `.test.tsx`
- `apps/web/src/components/messages/profile-file-row.tsx` (yeni) + `.test.tsx`
- `apps/web/src/lib/messages/format-file-size.ts` (yeni, yoksa) + `.test.ts`

**Yazma:** `metrics.ts`, `messages-screen.ts`, `tr.ts`, `en.ts`, Ş5/Ş6/Ş8 dosyaları,
`apps/mobile/**`.

## Üyeler sekmesi (§15.4)

### 1. `Üye ekle` butonu

h38, radius 13, `--primary/0.08` zemin, `1px dashed --primary/0.5`, `--primary` metin,
hover `--primary/0.16`. Dalga 3 Ş10'un modalını açar; şimdilik `onAddMembers` prop'u ile dışarı
verilir.

**Yetki kapısı:** `permAddMembers` `ADMINS` ise ve viewer üye ise buton **çizilmez**.
Sunucu zaten reddediyor, ama tıklanabilir bir buton bırakmak kullanıcıya yalan söyler.

### 2. `DAVET BAĞLANTISI` kartı

Mono `whispr.app/g/{kod}` + 34×34 kopyala butonu (`--primary/0.14`). Alt satır
`{süre} geçerli · {kural}` — kural §15.5'teki `KİMLER ÜYE EKLEYEBİLİR` segmentinden okunur, ayrı
bir kaynak uydurulmaz. Kopyala → Dalga 3 Ş9'un toast'ını tetikler (`messages.toast.inviteCopied`);
toast bileşeni henüz yoksa prop olarak `onToast` dışarı verilir.

Davet yoksa (`invite: null`) kart yerine oluşturma satırı çizilir — yönetici ise `Davet
bağlantısı oluştur`, üye ise bölüm çizilmez.

Kopyalama `navigator.clipboard` ile yapılır ve **başarısızlık sessiz geçmez**: reddedilirse
hata toast'ı gösterilir.

### 3. `YÖNETİCİ` {n} / `ÜYE` {m} grupları

Satır padding `7 8`, radius 11, hover `--surface-soft`; 32px **renkli** daire karo (Ş5 tinti) +
10px presence (2.5px `--surface-panel` kenar); ad 600 12.5 + kendinde `Sen` pill'i
(`--primary/0.14`); alt satır 11 muted durum metni.

Gruplama **istemcide** yapılır (uç düz liste + `role` döndürüyor). Satır gerçek `button`;
tıklanınca o kişinin profil paneline geçer. Uzun listede sanallaştırma **gerekmez** (250 üye üst
sınırı ve panel dar) — ama ilk sayfadan sonrası için "daha fazla" satırı olur (K16 imleci).

## Medya sekmesi (§15.5)

### 1. `PAYLAŞILAN MEDYA` {n}

3 kolon kare grid, gap 6, radius 12, `--surface-tertiary/0.7`, `1px --border/0.5`.
**Altıncı** karoda `+{kalan}` örtüsü (`--backdrop/0.55`) — kalan sayısı Ş3'ün `total` alanından
hesaplanır, sayfa uzunluğundan **değil** (Ş3 raporu bunu özellikle söylüyor).

Görseller `loading="lazy"`; her karo gerçek `button` ve tıklanınca mevcut medya görüntüleyiciyi
açar (yeni bir görüntüleyici yazma). Video karoları süre rozetiyle ayrılır.

### 2. `PAYLAŞILAN DOSYALAR`

32×32 uzantı karosu (`PDF`, `FIG` — addan türetilir, Ş3 kolon açmadı) + ad 600 + alt satır
`{boyut} · {tarih}` + indirme ikonu. Boyut biçimi Türkçe ondalık virgülüyle (`1,2 MB`) —
`format-file-size.ts` locale'e saygılı yazılır, `toFixed` ile İngilizce nokta gömülmez.

İndirme ikonu gerçek `a[download]`, `aria-label` taşır.

### 3. `PAYLAŞILAN BAĞLANTILAR`

Başlık (varsa) + host satırı. Başlık yoksa host tek satır olarak gösterilir. Bağlantılar
`rel="noopener noreferrer"` ve `target="_blank"` ile açılır.

## Ortak davranış

- Üç bölüm de kendi `Skeleton` bileşenini gösterir; sorgular **paralel** koşar, biri diğerini
  beklemez.
- Boş hâl: her bölümün ortasında tek satır muted metin (§10 "boş varyantlar").
- Sekme açılana kadar hiçbir sorgu koşmaz (kural 7 — tembel sekme).
- 1:1 DM ile grup **aynı** medya ucunu kullanır (Ş3).

## Test

- `permAddMembers: ADMINS` + üye rolü → `Üye ekle` butonu yok.
- Davet yokken üyeye bölüm çizilmiyor, yöneticiye oluşturma satırı çiziliyor.
- Kopyalama reddedilince hata toast'ı tetikleniyor.
- `Sen` pill'i yalnız kendi satırında.
- Yönetici/üye gruplaması ve sıralama doğru.
- `+{kalan}` sayısı `total - gösterilen` (sayfa uzunluğu değil).
- Boyut biçimi `1,2 MB` (tr locale) ve `1.2 MB` (en locale).
- Boş üç bölüm boş hâlini gösteriyor.
- Sekme kapalıyken sorgu koşmuyor.

## Kapı

```bash
pnpm --filter @wizards/web test
```

```bash
pnpm --filter @wizards/web typecheck
```

Rapor: `raporlar/08-rapor.md` — medya görüntüleyicinin hangi mevcut bileşen olduğu, `onToast`
prop imzası (Ş9 bağlayacak), sanallaştırma kararının gerekçesi.
