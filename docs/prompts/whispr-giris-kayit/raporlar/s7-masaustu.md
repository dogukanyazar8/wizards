# Ş7 — Masaüstü kabuğu ve ölçek kademesi (Dalga 3)

Durum: **tamamlandı.** Dal: `uat`. Commit yok.

Kaynak: `design_handoff/giris-kayit-paketi/SPEC.md` §3.3 (masaüstü varyantı), §3.4, §3.5, §5.
Kararlar: `PLAN.md` §3 (K7), `00-ortak-baglam.md` §4 (Ç3).

---

## 1. Şeridin beklediğinden küçük çıktı

Şerit dosyası 38px'lik yeni bir başlık çubuğu bileşeni yazmayı planlıyordu.
**Ürün zaten bir başlık çubuğuna sahip:** `components/desktop/desktop-window-chrome.tsx` —
uygulama genelinde, kök düzenden render ediliyor, yüksekliğini `var(--desktop-titlebar-height)`
değişkeninden okuyor ve Tauri pencere eylemlerine (minimize · maximize/restore · close) bağlı.

İkinci bir çubuk yazmak iki başlık çubuğu demek olurdu. Ş7 bunun yerine:

- K7 ile çubuğun yüksekliğini 38px'e taşıdı (Ş1'de yapıldı, burada doğrulandı),
- kimlik ekranlarını masaüstü ölçek kademesine bağladı,
- pencere yüksekliğinden çubuğu düştü,
- K7'nin tüm pakette ne kırdığını ölçtü.

## 2. Yapılanlar

| Dosya                                   | İş                                                                                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `components/auth/auth-surface-gate.tsx` | **yeni.** Masaüstü çalışma zamanını okuyup `AuthSurfaceProvider surface="desktop"` sarmalıyor.                                                               |
| `app/(auth)/layout.tsx`                 | Kapı düzene bağlandı — yüzey **bir kez**, en dışta işaretleniyor.                                                                                            |
| `app/globals.css`                       | `html.whispr-desktop-chrome [data-auth-surface]` yüksekliği `100dvh - var(--desktop-titlebar-height)`. Aksi hâlde her kimlik ekranı 38px kaydırma bırakırdı. |

SPEC §5'in ölçek tablosu Ş3'te `AUTH_METRICS` + `buildAuthCssVars` olarak kurulmuştu; Ş7 onu
gerçek yüzeye bağladı ve **21 satırını teste sabitledi**.

## 3. Ölçek kademesi (SPEC §5) — teste bağlanan tablo

| Öğe                       | Web         | Masaüstü    |
| ------------------------- | ----------- | ----------- |
| Marka paneli              | 512         | 376         |
| Işıma halkası             | 150         | 104         |
| Wordmark                  | 42          | 32          |
| Slogan                    | 14.5        | 13          |
| Ayırıcı                   | 300         | 230         |
| Panel başlığı             | 21          | 18          |
| Form dolgusu / genişliği  | 72 / 384    | 56 / 352    |
| Kayıt dolgusu / genişliği | 56 / 424    | 48 / 392    |
| Başlık                    | 29          | 25          |
| Alan etiketi              | 12.5        | 12          |
| Metin alanı               | 46          | 43          |
| Birincil düğme            | 48          | 46          |
| Sağlayıcı düğmesi         | 44          | 42          |
| Seçici / segment          | 30 / 26     | 28 / 24     |
| Alt bilgi (sol, alt)      | 72, 30      | 56, 22      |
| Seçici konumu (üst, sağ)  | 26, 32      | 18, 22      |
| Aurora                    | `-30%`, 18s | `-32%`, 16s |
| Logo ölçeği               | 1.55        | 1.2         |

Bileşenlerin **hiçbirinde** masaüstü koşulu yok; test on bir auth bileşenini tarayıp
`isWhisprDesktopRuntime` / `whispr-desktop-chrome` / `isDesktop` geçmediğini doğruluyor.

## 4. K7 (34px → 38px) ne kırdı?

Tüm web node paketi koşuldu: **7 504 test, 4 başarısız.**

Dördü de **başlık çubuğu yüzünden değil**, Ş2'de eklediğim `POST /api/v1/auth/username-availability`
ucunun iki depo sözleşmesini çiğnemesinden düşüyordu:

1. Kimlik doğrulaması olmayan uçlar `route-contract.test.ts` içindeki allowlist'e yazılmak zorunda.
2. Gövde okuyan uçlar `request.json()` yerine merkezî `parseJsonBody` kullanmak zorunda.

İkisi de düzeltildi: uç `parseJsonBody` + zod şemasıyla yeniden yazıldı ve allowlist'e gerekçesiyle
eklendi. `route-contract.test.ts` → **25/25 ✅**.

**K7 tek bir testi bile kırmadı** — yükseklik zaten değişkenden okunuyordu.

## 5. Testler

`components/auth/auth-desktop-contract.test.ts` — 7 test: yüzeyin tek yerde işaretlenmesi ·
bileşenlere masaüstü koşulu sızmaması · SPEC §5'in 21 satırlık ölçek tablosu · aurora'nın
küçülmesi · 38px'in tek kaynakta durması ve ürün kabuğunun onu okuması · pencere yüksekliğinden
çubuğun düşmesi · masaüstü logo ölçeği.

`pnpm --filter @wizards/web typecheck` → **0 hata** (Ş7 tarafında).

## 6. Kararlar ve sapmalar

1. **Ürünün başlık çubuğu SPEC §5'in görsel ayrıntılarına çekilmedi.** Üç fark var:
   çubukta bir uygulama simgesi var (SPEC'te yok), etiket `600 12px` (SPEC `600 11px`) ve
   10px içeriden başlıyor (SPEC 16px), düğme kutuları 36×28 (SPEC 38×28).
   **Neden dokunulmadı:** bu çubuk uygulama geneli — oturum açıldıktan sonraki her ekranda da
   duruyor. `00-ortak-baglam.md` §1 "oturum açıldıktan sonraki hiçbir yüzeye dokunulmaz" diyor;
   çubuğu SPEC'e çekmek bütün masaüstü uygulamasının görünümünü değiştirirdi. Yükseklik (38px)
   istisnadır, çünkü K7 ile açıkça karara bağlandı.
2. **Sürükleme Tauri'nin kendi mekanizmasıyla** (`data-tauri-drag-region`), SPEC'in
   `-webkit-app-region: drag` yazımıyla değil. Ç3'ün (Electron → Tauri) doğrudan karşılığı;
   davranış aynı, düğmeler sürükleme bölgesinin dışında.
3. **2FA, doğrulama ve sıfırlama pencereleri ayrı kurulmadı.** SPEC §5 son paragrafı zaten
   "aynı kabuğu ve web muadilinin içeriğini kullanır" diyor; tek anahtar bütün rotaları birden
   kademeye indiriyor.
4. **`.auth-canvas` / `.auth-frame` kuralları korundu.** Kimlik paketine ait değiller —
   `/invite/[code]`, `/g/[code]` ve `/desktop/oauth/*` kullanıyor; ikisi de değişkeni okuduğu için
   38px ile doğru çalışmaya devam ediyor.

## 7. Sonraki şeritler için borç

1. **Başlık çubuğunun üç görsel farkı** (madde 6/1) ürün kararı bekliyor: SPEC'e çekilecekse
   masaüstü uygulamasının tamamını kapsayan ayrı bir iş olmalı.
2. **Masaüstünde canlı doğrulama yapılmadı.** Tauri kabuğu bu ortamda çalıştırılamadı; ölçek
   kademesi ve pencere yüksekliği kaynak ve değişken düzeyinde doğrulandı. Ş9'un e2e'si
   masaüstü çalışma zamanını taklit edemiyorsa bu madde açık kalır.
