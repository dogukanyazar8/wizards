# Ş14 — Ölçekleme · a11y · i18n · parity · temizlik (Dalga 6, kapanış)

> Önce oku: `00-ortak-baglam.md`, `SPEC-SUNUCU.md` §11, §12, `PROMPT.md` kabul kriterleri,
> **tüm** `raporlar/*.md`.
> Bağımlılık: Ş0–Ş13'ün tamamı.

---

## Görev

Paketi kapat: ölçek kırılımları, erişilebilirlik, iki dilde metin denetimi, token denetimi,
parity matrisi ve ölü kod temizliği. Yeni özellik eklenmez.

---

## 1. Ölçekleme ve kırılımlar (§11)

- rem tabanlı ölçek adımları 16 · 18 · 24 · 32 px; seçim `min(100vw/1360, 100dvh/920)` —
  **mevcut** `lib/home/scale.ts` motoru kullanılır.
- Daha büyük ekranda **daha fazla kolon değil**, aynı kompozisyonun büyümüş hali. Kanal ve mesaj
  listesi daha çok satır gösterir.
- Kırılımlar:
  - `<1400px` → sağ panel içeriğin üstüne binen katman.
  - `<1200px` → gezinme paneli daraltılır (yalnız ikonlar, 74px); **kanal kenar çubuğu korunur**.
  - `<960px` → kanal kenar çubuğu drawer'a taşınır (`MobileDrawerTrigger`).
  - `<1024px` → sunucu ayarları ve sunucu oluşturma tek kolona düşer; önizleme kolonu forma
    **üstten** eklenir.
- Dört çözünürlükte (1360×920 · 1920×1080 · 2560×1440 · 3840×2160) taşma/kırpma taraması.

## 2. Erişilebilirlik (§12)

Her yüzey için tek tek doğrula ve eksikleri kapat:

- Tıklanabilir her satır gerçek `button`/`a`; ikon-only düğmelerde `aria-label`.
- Anahtarlar `role="switch"` + `aria-checked`; radyo grupları `role="radiogroup"` + ok tuşları
  (erişim · bildirim · yeni sahip).
- Menü ve pencerelerde: `Esc`, focus tuzağı, açılışta ilk odaklanabilir öğe, kapanışta tetikleyiciye
  dönüş.
- Okunmamış sayaçları okunabilir etiket taşır.
- Ses kartlarında "konuşuyor" metni; `prefers-reduced-motion` altında dalga durur.
- Devre dışı kontroller `aria-disabled` + neden metni (`Keşfet'te listele`, sahip satırının çıkarma
  düğmesi, pasif birincil düğmeler).
- Sürükle-bırak listelerinin klavye alternatifi çalışır.
- `pnpm --filter @wizards/web e2e:a11y` yeşil; sunucu ekranı için yeni a11y senaryosu eklenir.

## 3. i18n denetimi

- `apps/web/src/lib/servers/server-screen-copy.test.ts` (mevcut `*-screen-copy.test.ts` düzeni):
  - `server.*` ağacındaki her anahtar `tr.ts` ve `en.ts`'te var,
  - TR metinleri SPEC'teki **birebir** metinle eşleşiyor (kritik cümleler için sabit liste),
  - çoğul kuralları kurulmuş (`N üye`, `N yetki seçili`, `3 / 25`),
  - JSX'te gömülü Türkçe metin kalmamış (tarama).
- Ş0 raporundaki `serverSettings.*` listesi tamamen `server.settings.*` altına taşınmış ve eski
  anahtarlar silinmiş.

## 4. Token ve tipografi denetimi

- `lib/home/token-audit.ts` denetimini sunucu dosyalarına genişlet.
- `rg "#[0-9a-fA-F]{3,8}"` paketin dokunduğu dosyalarda **sıfır** (yalnız `--accent-2` tanımı hariç).
- Tipografi `--font-display` / `--font-sans` üzerinden; bileşende font adı yok.
- Tema anahtarı çalışıyor; hiçbir parça tek temaya sabitlenmemiş (açık/koyu ekran görüntüsüyle kanıt).

## 5. Parity matrisi

- `apps/web/e2e/specs/design/server-parity.spec.ts`'teki tüm `test.fixme` işaretleri kalkar.
- Matris: **16 ekran durumu × 2 tema**, ayrıca 9 ayar bölümü.
- `lib/servers/parity.test.ts` SERVER_METRICS ↔ SPEC eşleşmesini tam kapsar; K1 dışında beyaz liste
  girdisi kalmaz (kalıyorsa her biri gerekçeli).

## 6. Temizlik

- Silinen yüzeylerin artıkları: eski `server-settings-overlay.tsx` referansları, `server-tags-editor.tsx`,
  kaldırılan panel kartları, kullanılmayan i18n anahtarları, ölü `data-testid`'ler.
- `workspace-modals.tsx` yalnız yönlendirici olarak kalmış.
- `TODO(api):` envanteri: her biri hangi uç eksik, hangi şerit açtı — tek tabloda.

## 7. Kapanış kanıtı

- Açık ve koyu temada, dört çözünürlükte ekran görüntüleri alınır ve referans HTML ile karşılaştırılır.
- PROMPT'un kabul listesi madde madde işaretlenir; işaretlenemeyen madde **gerekçesiyle** raporda.

---

## Kabul kriterleri

- [ ] Dört kırılım da doğru davranıyor; dört çözünürlükte taşma/kırpma yok.
- [ ] a11y taraması temiz; `e2e:a11y` yeşil.
- [ ] `server-screen-copy.test.ts` yeşil; gömülü metin yok; eski `serverSettings.*` anahtarı kalmadı.
- [ ] Yeni hex sıfır; token denetimi yeşil; iki temada da doğru.
- [ ] `server-parity.spec.ts` tam matrisle yeşil; `parity.test.ts` yeşil.
- [ ] Ölü kod ve artık `data-testid` kalmadı.
- [ ] `TODO(api):` envanteri çıkarıldı.
- [ ] Tam doğrulama zinciri yeşil:
      `pnpm --filter @wizards/types test && pnpm --filter @wizards/db test && pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test`

## Rapor

`raporlar/s14-kapanis.md` — PROMPT kabul listesinin madde madde durumu + `TODO(api):` envanteri girer.
