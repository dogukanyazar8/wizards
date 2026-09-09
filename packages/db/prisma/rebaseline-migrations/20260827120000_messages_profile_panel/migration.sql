-- SPEC-MESAJLAR §15.5 + §17 — profil panelinin gizlilik anahtarlari ve sureli sessize alma.
--
-- Iki kolon, iki tablo:
--   1. "DMParticipant"."mutedUntil"  — §17 "Sessize al" alt menusunun 15 dk / 1 saat / 8 saat
--      secenekleri. "muted" bayragi kalir ve "Suresiz" secimini tasir; sureli sessizlikte ikisi
--      birlikte yazilir. Emsal: "UserChannelSettings"."mutedUntil" ve "UserServerSettings"."mutedUntil".
--   2. "UserSettings"."showTypingIndicator" — §15.5 gizlilik kartinin ikinci anahtari.
--      "showReadReceipts" zaten var; ikisi ikiz olarak okunur ve yaziliyor tarafinda uygulanir.
--
-- Index eklenmiyor: "mutedUntil" uzerinde filtre yok, deger satir zaten okunmusken degerlendirilir.
-- Geri doldurma gerekmiyor: biri nullable, digeri default'lu.

ALTER TABLE "DMParticipant" ADD COLUMN "mutedUntil" TIMESTAMP(3);

ALTER TABLE "UserSettings" ADD COLUMN "showTypingIndicator" BOOLEAN NOT NULL DEFAULT true;
