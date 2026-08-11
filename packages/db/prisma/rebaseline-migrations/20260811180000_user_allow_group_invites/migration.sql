-- Grup sohbetleri 2a-2f, Faz 4. 2b §7 draws a friend who is "Grup davetlerine
-- kapalı" at .55 opacity with a lock and refuses the tap; until now nothing in
-- the schema could say that about anybody.
--
-- Open is the default, so every existing account keeps the behaviour it has:
-- the row only ever narrows what a *friend* may do, and the eligibility check
-- still runs on the server for every create and every add.
ALTER TABLE "UserSettings"
  ADD COLUMN "allowGroupInvites" BOOLEAN NOT NULL DEFAULT true;
