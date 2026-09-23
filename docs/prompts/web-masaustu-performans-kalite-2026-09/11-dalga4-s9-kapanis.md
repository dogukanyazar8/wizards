# D4 / Ş9 — Kapanış: son ölçüm, önce/sonra, rapor

Ön koşul: `00-ortak-baglam.md` okundu; Ş8 kapıları yeşil; tüm `U-*` raporları var.
Tür: **ölçüm + rapor.** Kod değiştirmez. Yazılanlar: `raporlar/11-final.json`, `raporlar/11-kapanis.md`, `docs/reports/whispr-web-masaustu-performans-2026-09.html`.

## Amaç

Paketin sonunda tek soruya kanıtla cevap vermek: **Whispr web ve masaüstü ne kadar iyileşti ve bu iyileşme korunuyor mu?**

## Adımlar

### 1. Son ölçüm

D0'ın tüm komutlarını **aynen** koş (aynı rota listesi, aynı senaryolar, aynı profiller, aynı N, mümkünse aynı makine ve güç planı) → `raporlar/11-final.json` (00-baseline ile aynı şema). Ortam D0'dan farklıysa (makine, Chromium/WebView2 sürümü, Node) farkı yaz; farklı ortam sayılarını doğrudan kıyaslama — gerekirse D0 temelini (`treeFingerprint`'ine ait ağacı ayrı worktree'de kurup) aynı ortamda yeniden ölç. Worktree: `git worktree add --detach <scratchpad>/whispr-d0 <sha>` (K1-A ise); K1-B ise temel yeniden kurulamaz — bunu raporda sınırlama olarak yaz.

### 2. Önce/sonra

Her `M-*` için: D0 · final · fark · % · gürültü eşiğini geçti mi (00 §3) · bütçe hedefi tutturuldu mu · sorumlu `U-*` şeritleri. İyileşmeyen veya gerileyen metrikleri **saklama**; nedenini yaz.

### 3. Bulgu kapanışı

Her `S*` bulgusu ve her önceki denetim maddesi (F-_, A-_, `denetim-2026-08`) için son durum: `kapandi` (kanıt: şerit + test + metrik) · `gecersiz` · `gecersiz-kazanc` · `ertelendi` (tetikleyici metrik) · `reddedildi` (neden). Açık kalan hiçbir kalem durumsuz olmaz.

### 4. Kalıcılık kontrolü

- Ş8 kapıları bugünkü ağaçta yeşil; her birinin kasıtlı ihlal kanıtı `10-kapilar-rapor.md`'de.
- Runbook (`docs/operations/web-desktop-performance.md`) komutları kopyala-yapıştır koşuyor.
- `graphify update .` koşuldu; `graphify-out/` güncel.

### 5. Commit planı önerisi

Kullanıcı commit'leri kendisi atar. Çalışma ağacındaki değişiklikleri mantıksal commit'lere böl: şerit başına bir commit (conventional commits, normal dil, `U-*` ve bulgu kimlikleri gövdede). Her commit için dosya listesi ve sıra (bağımlılık). Bu paketle ilgisiz WIP dosyalarını ayrı listele — karıştırma. **Commit atma.**

### 6. HTML rapor

`docs/reports/whispr-web-masaustu-performans-2026-09.html` — tek dosya, dış bağımlılıksız, açık/koyu tema, telefon genişliğinde yatay kaydırma yok. Emsal: `docs/reports/whispr-platform-denetimi-2026-08.html`.

İçerik:

1. Özet kartları: ana 6–8 metrik, önce → sonra, fark.
2. Rota bazlı ilk yükleme (yatay çubuk, önce/sonra) ve etkileşim senaryoları (P1–P10) tablosu.
3. Masaüstü: açılış kırılımı, süreç/bellek, boyut.
4. Kod kalitesi ve mimari karnesi: `M-KOD-*` önce/sonra, sıcak nokta listesindeki değişim, uygunluk fonksiyonları.
5. Şerit listesi: `U-*`, kapanan bulgular, kazanç.
6. Ertelenenler ve tetikleyicileri; bilerek yapılmayanlar.
7. Yöntem ve sınırlamalar (ortam, N, gürültü eşiği, ölçülemeyenler).

Sayılar yalnız `11-final.json` ve `00-baseline.json`'dan gelir; HTML'e elle sayı yazılmaz (üretim betiği scratchpad'de, JSON'u gömer).

### 7. Kapanış raporu

`raporlar/11-kapanis.md`: 1–7'nin metin hali + "sonraki tur" önerisi (ertelenenlerin tetikleyicileri, saha verisi — Sentry Web Vitals — bağlanmadıysa ilk iş).

## Kapı

```bash
node -e "const a=require('./docs/prompts/web-masaustu-performans-kalite-2026-09/raporlar/00-baseline.json');const b=require('./docs/prompts/web-masaustu-performans-kalite-2026-09/raporlar/11-final.json');const ids=new Set(b.metrics.map(m=>m.id));const eksik=a.metrics.filter(m=>!ids.has(m.id)).map(m=>m.id);console.log('baseline',a.metrics.length,'final',b.metrics.length,'finalde eksik',eksik.length,eksik.join(','))"
```

`finalde eksik 0` olmalı (bilerek bırakılan varsa `notRun` + neden). HTML dosyası tarayıcıda açılıyor, konsol hatası yok, koyu/açık temada okunuyor.

## Kullanıcıya bitiş (caveman ultra)

En büyük 5 kazanım (metrik, önce → sonra), gerileyen/iyileşmeyen metrikler, açık kararlar, commit planı özeti, rapor yolu.
