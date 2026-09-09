-- Ayarlar paketi — F2 düzeltmesi.
--
-- `Görünüm › Metin › Mesaj boyutu` (`m2`) 12–22 px arası bir kaydırıcı ve tasarımın varsayılanı
-- 15. Ş0 diğer on üç Görünüm kolonunu eklemişti ama bunu atlamıştı; satır çizildiği hâlde hiçbir
-- yere yazılmıyordu ve kutu yazmayı başarılı sayıp `Kaydedildi` gösteriyordu.
--
-- `messageBodySize` ile karıştırılmamalı: o mobilin dört adımlı ("small"…"xlarge") gövde
-- tercihidir ve string taşır. Web'in kaydırıcısı gerçek piksel değeri istiyor, aynı kolona
-- sıkıştırmak iki platformdan birini yalancı yapardı.
ALTER TABLE "UserSettings"
  ADD COLUMN IF NOT EXISTS "messageSizePx" INTEGER NOT NULL DEFAULT 15;
