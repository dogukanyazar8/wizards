# A7 — Sentez, önceliklendirme ve yol haritası

Ön koşul: `A1`–`A6` altısının da `raporlar/*.findings.json` dosyası kapıdan geçmiş.
Çıktı: `raporlar/A7.roadmap.json` + `raporlar/A7-yol-haritasi.md`.

## Amaç

Altı eksenin bulgularını **tek, çelişkisiz, sıralı bir iş planına** çevirmek. Plan iki katmanlıdır:

- **Uygulama planı** — ne yapılacak: iş kalemleri, bağımlılıklar, kabul kapıları, efor.
- **Geliştirme planı** — nasıl çalışılacak: kapı değişiklikleri, test disiplini, ölçüm döngüsü, sürüm ritmi.

İkincisi olmadan birincisi tekrar eder: aynı kusur sınıfı altı ay sonra geri gelir.

## Girdi

```bash
node -e "const fs=require('fs');const d='./docs/prompts/platform-denetimi-2026-08/raporlar/';const all=['A1','A2','A3','A4','A5','A6'].map(a=>JSON.parse(fs.readFileSync(d+a+'.findings.json','utf8')));console.log(all.map(f=>f.axis+' '+f.findings.length).join(' | '),'toplam',all.reduce((n,f)=>n+f.findings.length,0))"
```

Altı dosya da okunur. Eksik dosya varsa `A7` başlamaz.

## Adımlar

### 1. Birleştir ve tekilleştir

Aynı kök nedeni gösteren bulgular birleşir. Ölçüt: **aynı `file` + aynı davranış** ya da farklı dosyalarda aynı kök neden (örneğin "presence kapısı fail-open" hem `A3` hem `A6`'da çıktıysa tek kalem).

Birleştirilen bulgu:

```jsonc
{
  "id": "R-012",
  "sourceFindings": ["A3-004", "A6-011"],
  "title": "…",
  "severity": "high", // en yükseği alınır
  "confidence": "confirmed", // en düşüğü alınır
  "platforms": ["web", "backend"],
  "rootCause": "Tek cümle: kusurun kaynağı.",
}
```

Tekilleştirme kaydı zorunlu: hangi bulgular hangi kaleme gitti, `A7-yol-haritasi.md`'de tablo olarak.

### 2. Puanla

Deterministik formül. HTML raporundaki varsayılan sıralama budur, elle sıra değiştirilmez.

```
severityWeight: critical=100, high=60, medium=25, low=8
confidenceFactor: confirmed=1.0, probable=0.7
effortCost:     S=1, M=3, L=8, XL=20
riskPenalty:    low=1.0, med=0.85, high=0.7
reachFactor:    etkilenen platform sayısı (1..4) -> 1.0, 1.15, 1.3, 1.4

score = round( severityWeight * confidenceFactor * riskPenalty * reachFactor / effortCost )
```

Puan sıra verir, karar vermez. İki istisna elle uygulanır ve gerekçesi yazılır:

- `severity: critical` olan her kalem eforu ne olursa olsun `W0`'dadır.
- Bir kalem başka kalemlerin **ön koşuluysa** (bağımlılık grafiğinde girişi olan), puanı düşük olsa da onlardan önce gelir.

### 3. Bağımlılık grafiği

Kalemler arası kenarlar: `R-012 -> R-030` = 012 bitmeden 030 yapılamaz. Kenar sebebi bir cümleyle yazılır (paylaşılan sözleşme, migration sırası, ortak dosya, ölçüm önkoşulu).

Grafik `A7.roadmap.json` içinde `edges` olarak durur ve `A8`'de görselleşir. Döngü olamaz — döngü varsa kalemleri böl.

### 4. Dalgalara yerleştir

`00 §6` dalga tanımları. Ek kısıtlar:

- Bir dalga **tek bir ekibin** kapasitesini varsayar; dalga içi toplam efor `S=1` biriminden `W0 ≤ 25`, `W1 ≤ 60`, `W2 ≤ 150` birimle sınırlı. Sığmayan kalem bir sonraki dalgaya kayar ve bu **açıkça** yazılır ("kapasite nedeniyle ertelendi"), sessizce düşürülmez.
- Her dalganın bir **tema cümlesi** vardır ("W0: veri sızıntısını ve üretimi bozan hataları kapat").
- Her dalganın **çıkış kapısı** vardır: koşulabilir komut + gözlemlenebilir ölçüt. Örnek: "`pnpm --filter @wizards/web test` yeşil, `A3` rota guard tablosunda guard'sız rota 0, mobil süiti CI'da koşuyor".

### 5. İş kalemini yürütülebilir yap

Her kalem, ayrı bir oturumda başka soru sorulmadan uygulanabilir olmalı:

```jsonc
{
  "id": "R-012",
  "title": "…",
  "wave": "W0",
  "score": 140,
  "severity": "critical",
  "platforms": ["backend"],
  "rootCause": "…",
  "sourceFindings": ["A3-004"],
  "touches": ["apps/web/src/app/api/v1/…/route.ts", "packages/types/src/workspace.ts"],
  "approach": "3-6 cümle: hangi katmanda ne değişir, hangi sözleşme korunur.",
  "testPlan": "Önce hangi test yazılır (dosya + iddia), RED nasıl gösterilir.",
  "acceptance": ["Ölçülebilir kabul ölçütü", "…"],
  "gate": "pnpm --filter @wizards/web test && pnpm typecheck",
  "effort": "M",
  "risk": "low",
  "dependsOn": [],
  "rollback": "Geri alma yolu (migration varsa geri migration, flag varsa kapatma).",
  "owner": "backend | web | mobile | desktop | infra",
}
```

`approach` alanı çözümü **anlatır**, kod yazmaz. Kod `A7`'nin işi değil.

### 6. Geliştirme planı

Bu bölüm iş kalemi değil, çalışma biçimi. En az şunları kapsar, her biri `A4` bulgularına bağlanır:

- **Kapı değişiklikleri**: CI'da neyin koşacağı (mobil/types/db/desktop süitleri, e2e, kapsam eşiği, `cargo audit`), kırmızı kapının atlanamaz hale getirilmesi.
- **Test disiplini**: yeni kod için test-önce kuralı, hangi katmanda hangi test tipi, "bu fonksiyonun bir satırı bozulsa hangi test kırılır" kabul sorusu.
- **Sözleşme disiplini**: `packages/types` tek kaynak; şema `.strict()` politikası; socket olayı eklerken zorunlu kayıt noktaları.
- **Ölçüm döngüsü**: hangi metrikler sürekli toplanır (sıcak yol p50/p95, hata oranı, süit süresi, bundle boyutu), eşik aşımında ne olur.
- **Mimari sınırların araçla zorlanması**: import kuralı, `exports` daraltma, project reference — `A1` bulgularına bağlı.
- **Sürüm ritmi**: dalga başına sürüm, UAT doğrulaması, geri alma prosedürü, migration iki aşamalı desen.
- **Borç kaydı**: kapatılmayan bulguların nerede yaşayacağı ve ne zaman gözden geçirileceği.

Her madde **bugünkü durum → hedef durum → ilk adım** biçiminde yazılır. Genel öğüt yasağı burada da geçerli.

## Çıktı şeması

`raporlar/A7.roadmap.json`:

```jsonc
{
  "baseCommit": "5a2b3990733b17672cf65fba631b7ec44a7bf96a",
  "generatedAt": "2026-08-08",
  "summary": {
    "findingsTotal": 0,
    "itemsTotal": 0,
    "bySeverity": { "critical": 0, "high": 0, "medium": 0, "low": 0 },
    "byAxis": { "A1": 0, "A2": 0, "A3": 0, "A4": 0, "A5": 0, "A6": 0 },
    "byPlatform": { "web": 0, "mobile": 0, "desktop": 0, "backend": 0, "infra": 0 },
    "effortUnits": { "W0": 0, "W1": 0, "W2": 0, "W3": 0 },
  },
  "waves": [
    {
      "id": "W0",
      "theme": "…",
      "window": "0–2 hafta",
      "items": ["R-001", "R-012"],
      "exitGate": ["komut veya ölçüt", "…"],
    },
  ],
  "items": [/* §5 şeması */],
  "edges": [{ "from": "R-012", "to": "R-030", "reason": "…" }],
  "devPlan": [
    {
      "area": "CI kapıları",
      "today": "…",
      "target": "…",
      "firstStep": "…",
      "sourceFindings": ["A4-003"],
    },
  ],
  "deferred": [{ "id": "R-044", "reason": "kapasite", "revisit": "W2" }],
}
```

## Yapılmayacaklar

- Kod yazmak, düzeltme uygulamak.
- Bulgu üretmek. `A7` yalnız birleştirir; yeni kusur görülürse ilgili eksenin JSON'una eklenir ve oradan alınır.
- Puanı elle "hissederek" değiştirmek. İstisna yalnız §2'deki iki kural, gerekçeli.
- Tahmini takvim tarihi vermek (kişi/gün bilinmiyor). Efor birimi ve dalga penceresi yeterli.
- Bulguları "kolay olanlar" diye yeniden sıralamak. Hızlı kazanımlar zaten yüksek puan alır.

## Kapı

```bash
node -e "
const r=require('./docs/prompts/platform-denetimi-2026-08/raporlar/A7.roadmap.json');
const ids=new Set(r.items.map(i=>i.id));
const kayipKenar=r.edges.filter(e=>!ids.has(e.from)||!ids.has(e.to));
const dalgasiz=r.items.filter(i=>!i.wave||!i.gate||!i.acceptance||!i.acceptance.length);
const critDisi=r.items.filter(i=>i.severity==='critical'&&i.wave!=='W0');
const kaynaksiz=r.items.filter(i=>!i.sourceFindings||!i.sourceFindings.length);
console.log('kalem',r.items.length,'kopuk kenar',kayipKenar.length,'eksik alan',dalgasiz.length,'W0 disi critical',critDisi.length,'kaynaksiz',kaynaksiz.length);
"
```

Dördünün de `0` olması gerekir. Ayrıca döngü kontrolü:

```bash
node -e "
const r=require('./docs/prompts/platform-denetimi-2026-08/raporlar/A7.roadmap.json');
const g={};r.items.forEach(i=>g[i.id]=[]);r.edges.forEach(e=>g[e.from].push(e.to));
const st={};let cyc=null;
const dfs=n=>{st[n]=1;for(const m of g[n]||[]){if(st[m]===1){cyc=n+'->'+m;return true}if(!st[m]&&dfs(m))return true}st[n]=2;return false};
for(const n of Object.keys(g))if(!st[n]&&dfs(n))break;
console.log('dongu',cyc||'yok');
"
```

`dongu yok` olmalı.
