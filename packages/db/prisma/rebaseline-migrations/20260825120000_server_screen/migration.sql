-- Sunucu ekranı paketi — Ş0 (K2).
--
-- Tasarımdaki iki kontrolün bugün veri karşılığı yok:
--
--   * `Sunucu oluştur` ve `Sunucu ayarları › Genel` altı renk swatch'ı çiziyor. Renk bugün kısa
--     addan deterministik türetiliyor (harf kodları toplamı % palet uzunluğu), yani swatch'a
--     basmak hiçbir şeyi değiştirmiyordu. `iconColor` seçimi taşır; `null` = eski türetme.
--     **Geri doldurma yok** — mevcut sunucuların görünümü değişmemeli.
--
--   * `İçerik ve Mesajlaşma › Sunucu genelinde yavaş mod` 12 seçenekli bir çip grubu. Kolon
--     olmadığı için "yakında" etiketiyle bırakmak, `Channel.slowModeDelay` zaten varken gerçek
--     bir yeteneği saklamak olurdu. Değer kümesi `CHANNEL_SLOW_MODE_DELAYS` ile aynıdır ve
--     uygulama kuralı tek yerde yaşar: `max(server.slowModeDelay, channel.slowModeDelay)`.
--
-- Ban, zaman aşımı ve hedefli davet için migration **yok**: `ServerBan`,
-- `ServerMember.communicationDisabledUntil` ve `ServerInvite.targetUserId` zaten mevcut (K3).
ALTER TABLE "Server"
  ADD COLUMN IF NOT EXISTS "iconColor" TEXT;

ALTER TABLE "Server"
  ADD COLUMN IF NOT EXISTS "slowModeDelay" INTEGER NOT NULL DEFAULT 0;
