# Ş0.3 — 2026-09-17

Yerel izole DB `wizards_screen_share_e2e_20260917`, Redis 6391, LiveKit dev 7980; üretim derlemesi üzerinde port 3100. UAT/production verisi kullanılmadı.

PASS: gerçek medya ilk dört senaryo aynı çalıştırmada: decode/başlangıç 1080 + 61 örnek + start/interval/end HTTP200; stop <=2s; kaynak değişimi; iki paylaşım sınırı. Desen testi düzeltme sonrası ayrı çalıştırmada PASS: SSIM 0.9997, latency median 516.5ms (soft 300ms hedefi AŞILDI). Kaynak native getDisplayMedia tarayıcı sekmesi; mikrofon sessiz sentetik.

Desen tarayıcısı `channel: chromium`: tam Chromium headless. Fake-device görüntüyü yeşil test karesiyle değiştirir; fake-ui masaüstünü seçer. İkisi desen grubunda kaldırıldı. Test native yakalama displaySurface browser değilse yayın öncesi durdurur; saat şeridi ilerlemek zorunda. Önceki yanlış kaynağa ait geçişler GEÇERSİZ; ilgili yerel görüntü çıktıları silindi. Kaynak: https://playwright.dev/docs/browsers#chromium-new-headless-mode

Dört RTP senaryosu sentetik video ile gerçek LiveKit'i doğrular; gerçek sekme içeriğini beşinci senaryo doğrular. Geçici odalar test sonunda açıkça terk edilir; reconnect grace sonraki testi kirletmez.

NOT RUN: remote CI/nightly netem, Android Maestro, fiziksel GPU/ekran, WebView2, Cloud TURN. Dalga 0 yerel kod/test kapısı geçti; fiziksel performans kabulü verilmedi.
