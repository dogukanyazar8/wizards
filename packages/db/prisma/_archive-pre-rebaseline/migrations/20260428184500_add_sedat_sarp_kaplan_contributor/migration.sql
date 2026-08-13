INSERT INTO "Contributor" ("id", "name", "createdAt", "updatedAt")
VALUES (
  'contrib-sedat-sarp-kaplan',
  'Sedat Sarp Kaplan',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO NOTHING;
