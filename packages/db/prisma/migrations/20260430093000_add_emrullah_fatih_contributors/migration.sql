INSERT INTO "Contributor" ("id", "name", "createdAt", "updatedAt")
VALUES
  ('contrib-emrullah-saku', 'Emrullah Saku', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('contrib-fatih-gurbuzer', U&'Fatih G\00FCrb\00FCzer', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
