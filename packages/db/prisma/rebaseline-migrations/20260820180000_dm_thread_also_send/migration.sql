-- Mesajlar §6.1. DM thread yanıtının ana sohbete de düşmesi.
--
-- Kanal tarafında bu bayrak (`Message.alsoSentToChannel`) zaten var ve
-- çalışıyor; DM tarafında yoktu, o yüzden panelde işaretlenen bir kutu hiçbir
-- şey yapamazdı. Kolon `false` varsayılanıyla geliyor: yazılmış her mesaj
-- bugünkü davranışını koruyor.
ALTER TABLE "DMMessage"
  ADD COLUMN IF NOT EXISTS "alsoSentToChannel" BOOLEAN NOT NULL DEFAULT false;

-- Ana sohbet listesinin **tam** yüklemi bu üçlü: konuşma + bayrak + zaman.
-- İndeks olmadan, kök olmayan ama ana sohbete düşen mesajları da kapsayan
-- sorgu her sayfada tam tarama yapardı.
CREATE INDEX IF NOT EXISTS "DMMessage_conversationId_alsoSentToChannel_createdAt_idx"
  ON "DMMessage" ("conversationId", "alsoSentToChannel", "createdAt");
