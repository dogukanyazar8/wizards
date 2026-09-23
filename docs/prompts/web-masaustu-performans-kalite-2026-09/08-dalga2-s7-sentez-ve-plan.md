# D2 / Ş7 — Sentez, önceliklendirme ve uygulama planı

Ön koşul: `00-ortak-baglam.md` okundu; `raporlar/00-baseline.json` ve `S1…S6.findings.json` kapılarını geçmiş.
Tür: **salt okuma** (kod açısından). Yazılanlar: `raporlar/08-plan.json`, `raporlar/08-yol-haritasi.md`, `raporlar/08-kararlar.md`, `raporlar/08-butceler.json`.
Bitiş: **DUR.** Kullanıcı planı ve kararları onaylamadan D3 başlamaz.

## Amaç

Altı şeridin bulgularını ve önceki denetimlerin açık maddelerini tek bir, **mekanik olarak doğrulanabilir** uygulama planına çevirmek: her iş kalemi ölçülebilir kabul ölçütü taşır, her şerit dosya sahipliği ilan eder, aynı alt dalgada iki şerit aynı dosyaya dokunmaz.

## Adımlar

### 1. Birleştir

- Tüm `S*.findings.json` → tek liste. Aynı kök neden (aynı `file:line` kümesi veya aynı mekanizma) → tek kalem, `mergedFrom: ["S1-003","S2-007"]`.
- `priorStatus`'ları birleştir: principal F-_, platform A-_, `denetim-2026-08` maddeleri için tek durum tablosu (`acik/kapandi/kismen/gecersiz`). Çelişen durum varsa kanıtı kodda yeniden oku, karar ver, gerekçe yaz.
- Şeritler arası çakışan iddiaları (ör. Ş1 "X eager" / Ş2 "X hiç çalışmıyor") çöz.

### 2. Puanla

Her kalem için:

- **etki (1–5):** kullanıcı metriğinde (`M-LAB`, `M-DSK`) ölçülmüş/tahmini değişim, etkilenen akışın sıklığı (her açılış > her kanal geçişi > ayarlar), kalite/tasarım kalemleri için sıcak nokta puanı ve ihlal sayısı.
- **güven çarpanı:** `confirmed` 1,0 · `probable` 0,6; `expectedGain.basis` `hypothesis` ise ×0,7.
- **effort:** S=1, M=3, L=8, XL=20.
- **risk cezası:** low 1,0 · med 0,8 · high 0,6.
- **ROI** = `etki × güven × risk / effort`. Formülü ve ağırlıkları `08-plan.json` başına yaz; tek bir ağırlığı değiştirmek sıralamayı ters çeviriyorsa bunu rapora yaz (duyarlılık notu).

### 3. Bütçeleri sabitle

`raporlar/08-butceler.json` — Ş8 bunu kapıya çevirir:

```jsonc
{
  "basedOn": "00-baseline.json@<treeFingerprint>",
  "bundle": {
    "M-BND-home": {
      "today": 0,
      "target": 0,
      "fail": 0,
      "unit": "KB-gz",
      "justification": "S1-001+S1-004 kapanınca",
    },
  },
  "lab": {
    "M-LAB-P4-interaction-dusuk": { "today": 0, "target": 0, "tolerance": "max(%15, 3×MAD)" },
  },
  "desktop": { "M-DSK-START-T3-p50": {}, "M-DSK-RSS-10m": {} },
  "dev": { "M-DEV-webtest-s": {} },
  "code": { "M-KOD-cycles": { "today": 0, "ratchet": "down" } },
}
```

- `target` = bulgular kapandığında beklenen değer (ölçülen bayt veya ölçülen süre kazancından türetilmiş); keyfi yuvarlak sayı yazma.
- `fail` eşiği = D0 varyansından: tolerans hiçbir zaman ölçülen gürültünün altında olamaz (yoksa kapı titrer).
- Core Web Vitals eşikleri (00 başı) saha hedefi olarak ayrı satırda; laboratuvar vekilleriyle karıştırma.

### 4. Şeritlere böl (`U-*`)

- Bir `U-*` = tek tema, ≤ 3 gün, bağımsız teslim edilebilir, geri alınabilir.
- `touches` = şeridin dokunacağı dosya/glob listesi, bulguların `fix.touches` birleşimi + testleri.
- **Alt dalgalar:** `U-A` (hızlı kazanım, düşük risk), `U-B` (çalışma zamanı ve gerçek zaman), `U-C` (yapısal: bölme, döngü, sınır — K4'e bağlı), `U-D` (Ş8 kapılarıyla birlikte koşanlar). Aynı alt dalgadaki şeritlerin `touches` kesişimi **boş** olmalı — kesişim tablosunu mekanik hesapla ve rapora koy; kesişen iki şerit ya birleşir ya ardışık alt dalgalara ayrılır.
- Paylaşılan sıcak dosyalar (`live-voice-provider.tsx`, `lib.rs`, `channel-sidebar.tsx`, `wizards-shell.tsx`, `authenticated-app-providers.tsx`): bir alt dalgada **tek** şeridin sahipliğinde.
- Bölme şeritleri (K4-A) performans şeritlerinden **sonra** gelir: önce kazanımı al, sonra taşı (tersi, performans değişikliklerini taşınmış kodda yeniden yazdırır). İstisna: performans düzeltmesi dosyayı bölmeden yapılamıyorsa gerekçeyle.
- Davranış değiştiren kalemler (`behaviorChange: true`) ayrı şerit veya şerit içinde açık madde; `08-kararlar.md`'ye girer.

### 5. Kararları derle

`raporlar/08-kararlar.md` — kullanıcıya soru listesi. Her karar: bağlam (2–3 cümle), seçenekler, **önerilen** ve neden, etkilediği `U-*`. Kaynaklar: K4/K5 (README), Ş6 ADR taslakları, `behaviorChange` kalemleri, bütçe hedefleri, yeni bağımlılık istekleri, ürün koduna ölçüm işareti ekleme ihtiyacı (D0 `openQuestions`).

## `08-plan.json` şeması

```jsonc
{
  "treeFingerprint": "…",
  "scoring": { "formula": "etki*guven*risk/effort", "weights": {} },
  "priorStatus": [{ "ref": "F-08", "status": "kismen", "evidence": "…", "coveredBy": ["U-02"] }],
  "lanes": [
    {
      "id": "U-02",
      "wave": "U-A",
      "title": "LiveKit'i ses katılımına kadar yükleme",
      "findings": ["S1-001"],
      "touches": [
        "apps/web/src/components/providers/voice-provider.tsx",
        "apps/web/src/components/providers/live-voice-provider.tsx",
        "apps/web/src/components/providers/*.test.ts",
      ],
      "dependsOn": [],
      "acceptance": [
        {
          "metric": "M-BND-home",
          "op": "<=",
          "value": 0,
          "method": "pnpm --filter @wizards/web perf:bundle",
        },
        {
          "metric": "M-LAB-P9-join-masaustu",
          "op": "no-regression",
          "tolerance": "max(%10, 3×MAD)",
        },
      ],
      "tests": [
        "davranış: /home ilk yüklemesinde livekit chunk'ı yok (AST/bundle testi)",
        "ses katılımı e2e yeşil",
      ],
      "behaviorChange": false,
      "decisions": [],
      "risk": "med",
      "effort": "M",
      "rollback": "tek commit geri alınır; sözleşme testi eski hale döner",
      "roi": 0,
    },
  ],
  "overlapMatrix": { "U-A": [], "U-B": [] },
  "deferred": [
    {
      "finding": "S3-009",
      "reason": "ölçüm eşiği aşılmadı (F-10 ilkesi)",
      "trigger": "M-SRV-FANOUT-p95 > …",
    },
  ],
}
```

Kurallar: her `acceptance` bir `M-*` kimliğine ve koşulabilir `method`'a bağlı; kalite/tasarım şeritleri de ölçülebilir kabul taşır (ör. `M-KOD-cycles` 2 → 0, `lib.rs` satır ≤ X, taşıma sonrası tüm testler yeşil ve test sayısı düşmemiş). `deferred` kalemler tetikleyici metrikle kaydedilir — "belki sonra" yok.

## Yol haritası dokümanı

`raporlar/08-yol-haritasi.md`:

1. Yönetici özeti: bugün (ana metrikler), hedef, en büyük 5 kazanım, toplam efor.
2. Önceki denetimlerle mutabakat tablosu.
3. Alt dalga ve şerit tablosu: `U-*`, başlık, bulgular, efor, risk, kabul metrikleri, bağımlılık.
4. Kesişim matrisi.
5. Ertelenenler ve tetikleyicileri.
6. Bilerek yapılmayanlar (00 §9 "Önerilmeyenler" + bu turda reddedilen öneriler ve nedeni).

## Kapı

```bash
node -e "const p=require('./docs/prompts/web-masaustu-performans-kalite-2026-09/raporlar/08-plan.json');const L=p.lanes;const bad=L.filter(l=>!l.touches?.length||!l.acceptance?.length||l.acceptance.some(a=>!a.metric||!a.method&&a.op!=='no-regression'));const byWave={};for(const l of L)(byWave[l.wave]??=[]).push(l);let clash=0;for(const [w,ls] of Object.entries(byWave))for(let i=0;i<ls.length;i++)for(let j=i+1;j<ls.length;j++){const s=new Set(ls[i].touches);const x=ls[j].touches.filter(t=>s.has(t));if(x.length){clash++;console.log('CAKISMA',w,ls[i].id,ls[j].id,x.join(','))}}console.log('serit',L.length,'eksik',bad.length,'cakisma',clash)"
```

`eksik 0` ve `cakisma 0` olmalı (glob'lar birebir karşılaştırılır — glob kesişimini de elle kontrol et). Her açık `S*` bulgusu ya bir şeride ya `deferred`'a ya "reddedildi + neden"e bağlı.

## Bitiş

Kullanıcıya (caveman ultra): en büyük 5 kazanım + bekleyen kararlar listesi + "D3 onay bekliyor". Onay gelmeden `U-*` başlatma.
