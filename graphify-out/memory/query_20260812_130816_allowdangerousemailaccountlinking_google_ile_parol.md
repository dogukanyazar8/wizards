---
type: "query"
date: "2026-08-12T13:08:16.985414+00:00"
question: "allowDangerousEmailAccountLinking Google ile parola hesabını otomatik bağlıyor; 2FA açık kullanıcı TOTP olmadan girebiliyor. A tamamen kapatmak mı, B yalnız 2FA hesapları engellemek mi? Ne yapmak lazım?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["canOAuthUserAccessWhispr", "linkMobileGoogleAccount", "createMobileGoogleSession", "verifyWebLoginTwoFactor"]
---

# Q: allowDangerousEmailAccountLinking Google ile parola hesabını otomatik bağlıyor; 2FA açık kullanıcı TOTP olmadan girebiliyor. A tamamen kapatmak mı, B yalnız 2FA hesapları engellemek mi? Ne yapmak lazım?

## Answer

Expanded from original query via graph vocab: [authjs, google, oauth, totp, email, account, linking, provider, signin]. Karar: B+ hemen. Google OAuth oturumunu mevcut twoFactorEnabled kullanıcı için, hesap önceden bağlı olsa da olmasa da reddet. Web canOAuthUserAccessWhispr sorgusuna twoFactorEnabled ekle. Native mobile akışında kontrolü linkMobileGoogleAccount içindeki herhangi bir Account/User yazımından ve createMobileGoogleSession oturum üretiminden önce uygula. Non-2FA kullanıcılar için allowDangerousEmailAccountLinking geçici olarak açık kalabilir. Dağıtım sonrası Google bağlantılı 2FA kullanıcıların mevcut web ve mobile oturumlarını kapsamlı risk değerlendirmesiyle iptal et. Sonraki iş: OAuth sonrası TOTP step-up; ardından ayarlarda recent reauthentication kullanan açık link/unlink akışı ve allowDangerousEmailAccountLinking=false. Testler: yeni/non-2FA izin; 2FA linked/unlinked ret; ret halinde link/session yazımı yok; web ve native mobile parity.

## Outcome

- Signal: useful

## Source Nodes

- canOAuthUserAccessWhispr
- linkMobileGoogleAccount
- createMobileGoogleSession
- verifyWebLoginTwoFactor