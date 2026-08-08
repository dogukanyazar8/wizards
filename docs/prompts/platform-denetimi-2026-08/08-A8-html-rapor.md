# A8 — Etkileşimli HTML rapor

Ön koşul: `A7` kapıdan geçti; `raporlar/` altında altı `*.findings.json` + `A7.roadmap.json` var.
Çıktı: `docs/reports/whispr-platform-denetimi-2026-08.html` (tek dosya).

## Amaç

Denetimin tamamını **tek, bağımsız, çevrimdışı çalışan** bir HTML sayfasına koymak. Sayfa bir sunum değil, çalışma aracıdır: filtrelenir, aranır, sıralanır, bağlantısı paylaşılır, kalem kalem işlenir.

Tasarım yönü: **minimal ve modern.** Az renk, çok boşluk, net hiyerarşi, hızlı etkileşim. Süsleme yok.

## Sert kısıtlar

1. **Tek dosya.** Ayrı `.css`/`.js`/görsel yok. Her şey inline.
2. **Sıfır dış istek.** CDN, web font, uzak resim, `fetch`, analytics yok. Sayfa uçakta, kablosuz kapalıyken açılmalı.
3. **Derleme adımı yok.** Repo bu dosyayı olduğu gibi taşır; npm paketi eklenmez.
4. **Çerçeve yok.** Vanilla JS. React/Vue/htmx/Tailwind CDN hiçbiri yok.
5. **Veri koddan ayrı.** Tüm bulgular tek `<script type="application/json" id="denetim-verisi">` bloğunda; DOM bu veriden üretilir. Bulgu metnini HTML'e elle gömme — sayfayı yeniden üretmek imkânsız hale gelir.
6. **Dil Türkçe.** Teknik terimler, dosya yolları, komutlar aynen.
7. **Boyut ≤ 1 MB.** Aşıyorsa veri kısaltılmaz; `quote` alanları 200 karakterde kırpılır ve bu rapora yazılır.

## Veri paketi

`A1`–`A6` findings + `A7.roadmap.json` + `A6.parityMatrix` tek nesnede birleşir:

```jsonc
{
  "meta": {
    "baseCommit": "5a2b3990733b17672cf65fba631b7ec44a7bf96a",
    "commitSubject": "fix(security): patch js-yaml audit",
    "commitDate": "2026-08-07",
    "generatedAt": "2026-08-08",
    "scale": {
      "webFiles": 1235,
      "webLoc": 204900,
      "mobileFiles": 563,
      "mobileLoc": 142600,
      "apiRoutes": 228,
      "prismaModels": 69,
      "testFiles": 720,
    },
  },
  "axes": [{ "id": "A1", "title": "Mimari", "scope": "…", "coverage": [/* surfaceCoverage */] }],
  "findings": [/* altı eksenin findings dizisi, axis alanı korunarak birleşik */],
  "metrics": [/* altı eksenin metrics dizisi, axis alanı eklenerek */],
  "parityMatrix": [/* A6 */],
  "roadmap": {/* A7.roadmap.json tamamı */},
  "openQuestions": [{ "axis": "A2", "text": "…" }],
}
```

Paketi elle yazma — üret:

```bash
node -e "
const fs=require('fs');const d='docs/prompts/platform-denetimi-2026-08/raporlar/';
const ax=['A1','A2','A3','A4','A5','A6'].map(a=>JSON.parse(fs.readFileSync(d+a+'.findings.json','utf8')));
const bundle={
  meta:{},
  axes:ax.map(f=>({id:f.axis,title:f.axisTitle,coverage:f.surfaceCoverage||[]})),
  findings:ax.flatMap(f=>f.findings.map(x=>({...x,axis:f.axis}))),
  metrics:ax.flatMap(f=>(f.metrics||[]).map(m=>({...m,axis:f.axis}))),
  parityMatrix:(ax.find(f=>f.axis==='A6')||{}).parityMatrix||[],
  roadmap:JSON.parse(fs.readFileSync(d+'A7.roadmap.json','utf8')),
  openQuestions:ax.flatMap(f=>(f.openQuestions||[]).map(t=>({axis:f.axis,text:t})))
};
fs.writeFileSync(d+'_bundle.json',JSON.stringify(bundle));
console.log('bulgu',bundle.findings.length,'kalem',bundle.roadmap.items.length,'boyut',JSON.stringify(bundle).length);
"
```

`meta` alanı elle doldurulur (yukarıdaki değerler `00 §4`'ten). Sonra `_bundle.json` içeriği HTML'deki JSON script bloğuna gömülür.

## Sayfa yapısı

Tek sayfa, üstte sabit başlık + sekmeler. Sekme değişimi hash ile (`#/bulgular`, `#/yol-haritasi`) — geri tuşu çalışır.

### 0. Başlık şeridi (sabit)

Sol: `Whispr Platform Denetimi`. Sağ: temel commit kısa hash + tarih, tema düğmesi. İkinci satır: sekmeler.

### 1. Özet (`#/ozet`)

- **Skor kartları** (satırda 4, dar ekranda 2): toplam bulgu, critical, high, toplam iş kalemi, W0 efor birimi. Her kart tıklanınca ilgili filtreli görünüme atlar.
- **Eksen şeridi**: 6 eksen, her biri için bulgu dağılımı yatay yığılmış bar (critical/high/medium/low) + kapsam yüzdesi.
- **Platform dağılımı**: web / mobil / desktop / backend / infra bulgu sayıları.
- **En ağır 10 bulgu** listesi (puana göre), tıklayınca detay.
- **Metodoloji kutusu**: temel commit, ne tarandı, ne taranmadı, kanıt kuralı, `confidence` anlamı. Kısa, 6-8 satır.

### 2. Bulgular (`#/bulgular`)

Ana çalışma yüzeyi.

- **Filtre çubuğu** (yapışkan): eksen (çoklu seçim), severity (çoklu), platform (çoklu), confidence, dalga, `parity` etiketi. Seçili filtreler çip olarak görünür, tek tıkla kalkar. "Tümünü temizle" var.
- **Arama**: başlık + kanıt dosya yolu + failureScenario içinde, 150 ms debounce, eşleşen terim vurgulanır.
- **Sıralama**: puan (varsayılan), severity, eksen, efor.
- **Sonuç sayacı**: "N / M bulgu" — filtre değişince anında güncellenir.
- **Bulgu satırı** (kapalı hâl, tek satır): severity rozeti + id + başlık + platform çipleri + efor. Rozet **yalnız renkle değil metinle de** severity taşır.
- **Açık hâl**: failureScenario, impact, refutation, kanıt listesi (`file:line` monospace, satır aralığıyla, tıklanınca yola kopyala), düzeltme özeti + efor/risk/dokunulan dosyalar, ilgili yol haritası kalemi bağlantısı, parity notu.
- Her bulgunun kalıcı çapası: `#/bulgular?id=A3-001` — açılışta o bulgu açık ve görünür konumda.

### 3. Ölçümler (`#/olcumler`)

Tablo: metrik, değer, birim, eksen, ağaç durumu, komut. Kolon başlığından sıralanır, eksene göre filtrelenir. Komut hücresi tek tıkla kopyalanır.

### 4. Parite (`#/parite`)

`parityMatrix` tablosu, boyuta göre gruplu. Sütunlar: yetenek, Whispr, Discord, Slack, Zoom, boşluk, efor, dalga. Rakip hücresi `[public-ref]`/`[assumption]` etiketini **görünür** taşır. Boyut başlıkları katlanabilir. Üstte "yalnız boşluklar" anahtarı.

### 5. Yol haritası (`#/yol-haritasi`)

- Dalga sütunları (W0–W3) yan yana; dar ekranda alt alta. Her sütun başlığında tema cümlesi, pencere, kalem sayısı, toplam efor birimi.
- Kalem kartı: id, başlık, severity rozeti, efor/risk, sahip (owner), bağımlılık sayısı. Tıklayınca detay paneli: approach, testPlan, acceptance listesi, gate komutu, rollback, kaynak bulgular (tıklanabilir, bulgular sekmesine atlar).
- **Bağımlılık görünümü**: bir kalem seçiliyken ön koşulları ve onu bekleyenler vurgulanır. Grafik çizmek zorunlu değil; vurgulama yeterli ve daha okunur.
- Dalga çıkış kapıları her sütunun altında liste hâlinde.
- **İlerleme işareti**: her kaleme `localStorage` tabanlı "yapıldı" işareti. Sayfa yeniden açıldığında korunur, üstte "N/M tamam" görünür. Bu tek durum saklama yeri; başka hiçbir şey saklanmaz.

### 6. Geliştirme planı (`#/gelistirme`)

`devPlan` maddeleri: alan, bugün, hedef, ilk adım, kaynak bulgular. Kart düzeni, üç sütun.

### 7. Kapsam ve açık sorular (`#/kapsam`)

Eksen bazlı `surfaceCoverage` tablosu (yüzey, incelenen/toplam, yöntem, kapsanmayan) + `openQuestions` listesi. Bu sekme raporun dürüstlük kaydıdır; kısaltılmaz.

## Görsel dil

- **Tipografi**: sistem yığını — `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`; kod/yol için `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`. Boyut ölçeği en fazla 5 kademe (12/14/16/20/28). Satır yüksekliği gövde metninde 1.55.
- **Renk**: CSS değişkeniyle tanımlı tek palet. Nötr yüzey + tek vurgu rengi + dört severity rengi. Gradyan yok, gölge en fazla bir kademe, kenarlık 1px.
- **Koyu/açık**: `prefers-color-scheme` varsayılan + başlıktaki düğmeyle elle geçiş (`:root[data-theme]` üstün gelir, seçim `localStorage`'da). İki temada da kontrast **WCAG AA** (metin 4.5:1, büyük metin 3:1).
- **Yoğunluk**: bulgu listesi kompakt (satır yüksekliği ~40px), okuma alanı ferah (paragraf genişliği ≤ 78ch).
- **İkon**: yok. İkon fontu, emoji, SVG ikon seti yok. Durum metinle ve renkle taşınır.
- **Hareket**: yalnız aç/kapa ve filtre geçişinde ≤ 150 ms; `prefers-reduced-motion` altında kapalı.

## Etkileşim ve erişilebilirlik

- Tüm filtreler gerçek `<button aria-pressed>` / `<input type="checkbox">`; tıklanabilir `div` yok.
- Klavye: `Tab` sırası mantıklı, `/` aramaya odaklanır, `Esc` açık paneli kapatır, `Enter`/`Space` satır açar. Odak halkası her zaman görünür.
- Genişleyen satır `aria-expanded` + `aria-controls` taşır. Sekmeler `role="tablist"`.
- Sonuç sayacı `aria-live="polite"`.
- Tablolar kendi `overflow-x: auto` kabında kayar; sayfa gövdesi **yatay kaymaz**.
- 360px genişlikte kullanılabilir; 1440px'te içerik ortalanır, maksimum genişlik ~1200px.
- Yazdırma: `@media print` — filtreler ve sekmeler gizli, tüm bulgular açık, bağlantılar okunur.

## Performans bütçesi

- İlk boyama 100 ms altında (200+ bulgu ile), yerel dosyadan.
- Filtre/arama yanıtı 50 ms altında. Filtreleme tek geçişli olmalı; her tuş vuruşunda tüm DOM'u yeniden kurma.
- DOM düğüm sayısı 5.000 altında: kapalı bulgu satırları hafif, detay **açılınca** üretilir.
- Sanallaştırma gerekmez (bu ölçek için fazla), ama `innerHTML` ile tüm listeyi her filtrede yeniden yazmak yerine kayıtlı düğümleri gizle/göster.

## Yayımlama

Rapor `A3` güvenlik bulgularını içerir. **Varsayılan: yerel dosya.** Sahibin açık onayı olmadan hiçbir dış servise (Artifact, gist, paylaşımlı sürücü, sohbet eki) yüklenmez. Onay verilirse bunun kalıcı bir bağlantı ürettiği ve içeriğin `critical` zafiyet ayrıntısı taşıdığı ayrıca hatırlatılır.

## Yapılmayacaklar

- Dış kütüphane, font, CDN, uzak görsel.
- Bulgu metnini HTML'e elle gömmek (veri bloğu dışında).
- Grafik kütüphanesi. Barlar `div` genişliğiyle çizilir; başka grafik gerekmiyor.
- Sunucu/derleme gerektiren çözüm (React, bundler, `npx serve` şartı).
- Sahte veri, örnek doldurma, "TODO" kart. Veri neyse o görünür; boş bölüm varsa "bulgu yok" yazar.
- Emoji, dekoratif ikon, gradyan, animasyonlu arka plan.

## Kapı

1. Dış istek yok, JSON geçerli, sayım tutuyor:

```bash
node -e "
const fs=require('fs');const p='docs/reports/whispr-platform-denetimi-2026-08.html';
const h=fs.readFileSync(p,'utf8');
const dis=(h.match(/(src|href)=[\"'](https?:)?\/\//g)||[]).filter(x=>!/href=[\"']#/.test(x));
const m=h.match(/<script type=\"application\/json\" id=\"denetim-verisi\">([\s\S]*?)<\/script>/);
if(!m){console.log('VERI BLOGU YOK');process.exit(1)}
const d=JSON.parse(m[1]);
console.log('boyut KB',Math.round(h.length/1024),'dis istek',dis.length,'bulgu',d.findings.length,'kalem',d.roadmap.items.length,'parite',d.parityMatrix.length);
"
```

`dis istek 0`, `boyut KB ≤ 1024`, bulgu sayısı altı eksenin toplamına eşit olmalı.

2. Her bulgu id'si sayfada ulaşılabilir (veri bloğunda var) ve `A7` kalemlerinin `sourceFindings` referansları veride mevcut:

```bash
node -e "
const fs=require('fs');const h=fs.readFileSync('docs/reports/whispr-platform-denetimi-2026-08.html','utf8');
const d=JSON.parse(h.match(/<script type=\"application\/json\" id=\"denetim-verisi\">([\s\S]*?)<\/script>/)[1]);
const ids=new Set(d.findings.map(f=>f.id));
const kayip=d.roadmap.items.flatMap(i=>(i.sourceFindings||[]).filter(s=>!ids.has(s)));
console.log('kayip kaynak',kayip.length,kayip.join(','));
"
```

`kayip kaynak 0`.

3. Tarayıcıda doğrula (dosya yolunu tarayıcıda aç, ya da oturumun tarayıcı araçlarıyla): konsol hatası yok, tema düğmesi iki yönde çalışıyor, bir filtre + bir arama + bir sıralama uygulanıp sayaç doğru değişiyor, bir bulgu açılıp `#/bulgular?id=…` bağlantısı yeniden yüklendiğinde aynı bulguyu açıyor, 360px genişlikte yatay kayma yok. Sonuç `A8` notuna yazılır; doğrulanmadan "tamam" denmez.
