-- A send that is retried must not become a second message.
--
-- The nonce already existed: the client mints one per send and the server echoed
-- it back so the author's optimistic bubble could absorb its own realtime copy.
-- It was never stored, so nothing on the server could tell a retry from a new
-- message — a dropped response, an offline replay or a double tap wrote a second
-- row, and the reader saw their message twice.
--
-- Unique per author rather than per channel: the nonce identifies one send by one
-- person, and scoping it to the channel would let the same send land twice if the
-- retry carried a different target. NULLs stay distinct in Postgres, so every
-- message written before this — and every system message, which has no client —
-- is unaffected.
ALTER TABLE "Message" ADD COLUMN "clientNonce" VARCHAR(128);
ALTER TABLE "DMMessage" ADD COLUMN "clientNonce" VARCHAR(128);

CREATE UNIQUE INDEX "Message_userId_clientNonce_key" ON "Message" ("userId", "clientNonce");
CREATE UNIQUE INDEX "DMMessage_userId_clientNonce_key" ON "DMMessage" ("userId", "clientNonce");
