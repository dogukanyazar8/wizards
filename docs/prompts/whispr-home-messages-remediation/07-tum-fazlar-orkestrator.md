# Ana Yürütücü Prompt — Tüm Fazları Sırayla Tamamla

`C:\Users\doguk\Desktop\Wizards` içindeki yerel, kirli `uat` çalışma ağacında Ana Sayfa ve Mesajlar
düzeltme paketinin bütün fazlarını sırayla tamamla.

Önce aşağıdaki belgeleri tamamen oku:

1. `docs/prompts/whispr-home-messages-remediation/00-ortak-baglam.md`
2. `docs/prompts/whispr-home-messages-remediation/01-faz1-guvenlik-yetkilendirme.md`
3. `docs/prompts/whispr-home-messages-remediation/02-faz2-dogruluk-yaris-lifecycle.md`
4. `docs/prompts/whispr-home-messages-remediation/03-faz3-ui-realtime-akislar.md`
5. `docs/prompts/whispr-home-messages-remediation/04-faz4-performans-veri-db.md`
6. `docs/prompts/whispr-home-messages-remediation/05-faz5-a11y-tasarim-kalite.md`
7. `docs/prompts/whispr-home-messages-remediation/06-faz6-final-dogrulama-kabul.md`

## Çalışma emri

- Fazları `01`, `02`, `03`, `04`, `05`, `06` sırasıyla yürüt.
- Aynı dirty worktree'de paralel kod yazan agent kullanma; shared state ve migration çakışması riski var.
- Read-only araştırma komutları paralel olabilir.
- Her fazdan önce güncel source/test üzerinden bulguyu yeniden üret. Zaten kapanmış bulguda gereksiz rewrite yok.
- Her davranış: failing regression test, minimal root-cause fix, narrow verification, phase-wide verification.
- Bir optional/environment kapısı bloklanırsa diğer bağımsız işleri tamamla; rapora `ENV BLOCKED` yaz.
- Güvenlik invariantı veya veri kaybı riski çözülemeden sonraki bağımlı faza geçme.
- İlgisiz hata görürsen düzeltme; `Additional observations` altında critical/medium/minor olarak kaydet.

## Mutlak yasaklar

`reset`, `clean`, `stash`, `restore`, branch/worktree, merge/rebase, commit, push, PR, deploy, UAT/prod DB
migration, secret/env dosyası değişikliği, yabancı süreç kapatma, broad staging, unrelated formatting yok.

## Tasarım ilkesi

En küçük güvenli değişiklik. Correctness ve security önce. Mevcut utility/component/query pattern'lerini kullan.
Yeni dependency, cache, provider, service layer, event type veya migration yalnız doğrulanmış ihtiyaç varsa.
Global `.app-shell` 12px padding'i değiştirme. Kanıtsız performans rewrite yapma.

## Devamlılık

Her faz sonunda kendi raporunu yaz. Sonraki faz önceki rapordaki açık zorunlu maddeleri devralır. Kullanım limiti
yaklaşırsa kodu yarım bırakma: çalışan dar kapıda dur, exact devam noktasını faz raporuna yaz. Yeni oturum aynı
rapordan devam edebilmeli.

## Bitiş tanımı

Yalnız Faz 6 final raporundaki zorunlu kapılar PASS olduğunda “tamamlandı” de. Şunları ayrı tut:

- Local source/test/build.
- Loopback DB/migration.
- Browser E2E/realtime/a11y/visual.
- Git parity.
- Remote CI.
- UAT deploy.
- Production/device kabulü.

Bu görev commit/push/deploy yetkisi vermez. Final cevap kısa: değişen ana davranışlar, test sayıları/kapıları,
bloklanan kanıtlar, kalan riskler, rapor yolu.
