-- Ayarlar paketi — Dalga 3 / Ş10, K7 · SPEC_DEVIATIONS #11.
--
-- Masaüstü kısayol atamaları. K3 bildirim tercihlerini tipli kolonlarda tutuyor ("push'u açık
-- olanlar" bir SQL filtresi olduğu için); kısayol listesinin böyle bir sorgusu yok ve eylem
-- sayısı sabit değil, o yüzden tek JSON kolonu K3'ün açıkça kaydedilmiş istisnasıdır.
--
-- Çakışma durumu **kaydedilmez**: o, her açılışta kabuğun gerçek kayıt denemesinden okunur.
-- Kolon NULL başlar — atama yapmamış hesap varsayılanları kullanır ve bunu bir satır yazarak
-- ilan etmesine gerek yoktur.
ALTER TABLE "UserSettings"
  ADD COLUMN IF NOT EXISTS "desktopShortcuts" JSONB;
