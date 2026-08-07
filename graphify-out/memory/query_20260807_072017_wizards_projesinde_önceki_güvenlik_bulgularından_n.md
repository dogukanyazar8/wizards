---
type: "query"
date: "2026-08-07T07:20:17.603795+00:00"
question: "Wizards projesinde önceki güvenlik bulgularından neler düzeldi, neler kaldı ve yeni bulgu var mı?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["refresh-token-family.ts,totp-secret-encryption.ts,two-factor.ts,logger.ts,client-ip.ts,ci.yml,pnpm-workspace.yaml"]
---

# Q: Wizards projesinde önceki güvenlik bulgularından neler düzeldi, neler kaldı ve yeni bulgu var mı?

## Answer

Refresh token ailesi, TOTP ciphertext-only yeni yazımlar, replay koruması, CI TOTP değişkenleri ve URI userinfo redaksiyonu kodda düzeldi. UAT verify bir plaintext TOTP satırı gösteriyor; backfill ve contract migration kaldı. Yeni bulgular: MFA kurulumu yalnız aktif oturuma güveniyor ve pending-secret güncellemesi yarışa açık; logger serbest metindeki kısa password/token/authorization/cookie değerlerini kaçırıyor; js-yaml 3.15.0 ve 4.3.0 için GHSA-5p4m-2wfm-xmqj nedeniyle prod audit FAIL. Railway X-Real-IP spoof-overwrite kabul testi yapılmadı. Odaklı 125 test ve güvenlik lint PASS; mevcut bağımsız WIP yüzünden web typecheck FAIL; son CI Build aşamasında FAIL ve Playwright işleri skipped.

## Outcome

- Signal: useful

## Source Nodes

- refresh-token-family.ts,totp-secret-encryption.ts,two-factor.ts,logger.ts,client-ip.ts,ci.yml,pnpm-workspace.yaml