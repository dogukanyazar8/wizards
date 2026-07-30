---
type: "investigation"
date: "2026-07-30T08:16:06.914501+00:00"
question: "1A Hakkında sağ üst kopyala eylemi ve beta katılım toast okunabilirliği nerede çözülür?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["MobileAboutSettingsScreen", "AboutScreenHeader", "AboutBellIcon", "ToastProvider", "ToastCard", "openAboutBetaConsent", "AboutBetaConsentSheet"]
---

# Q: 1A Hakkında sağ üst kopyala eylemi ve beta katılım toast okunabilirliği nerede çözülür?

## Answer

1A eylemi mobile-about-settings-screen.tsx AboutScreenHeader action alanında; mevcut navigateToBugReport ve 1C AboutBellIcon/Bildir paterni yeniden kullanılabilir. Beta kabul sonrası başarı metni aynı dosyada showToast title alanına uzun kanal etkisi cümlesi olarak veriliyor; ortak toast title ve subtitle alanlarını numberOfLines=1 ile kesiyor ve varsayılan 3000 ms sürüyor. Renk tokenları ayrı açık/koyu toast paletinde yüksek kontrastlı; temel sorun uzun cümlenin tek satırlık title olarak modellenmesi. En dar çözüm kısa başarı başlığı + açıklama subtitle + daha uzun yerel süre; global toast davranışını değiştirmemek.

## Outcome

- Signal: useful

## Source Nodes

- MobileAboutSettingsScreen
- AboutScreenHeader
- AboutBellIcon
- ToastProvider
- ToastCard
- openAboutBetaConsent
- AboutBetaConsentSheet