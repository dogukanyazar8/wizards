-- Messaging redesign §2 "1a".6: DM previews and bubbles carry three tick states
-- (gönderildi / iletildi / okundu). "Read" already had `lastReadAt`; "delivered"
-- needs its own mark, because a message reaching someone's device is not the
-- same event as them opening the conversation.
--
-- Nullable additive column, no backfill: every existing row starts with no
-- delivery mark and settles on the first send or list read after deploy.
ALTER TABLE "DMParticipant"
  ADD COLUMN "lastDeliveredAt" TIMESTAMP(3);
