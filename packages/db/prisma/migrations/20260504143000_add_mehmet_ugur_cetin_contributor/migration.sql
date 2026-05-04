INSERT INTO "Contributor" ("id", "name", "createdAt", "updatedAt")
VALUES (
  'contrib-mehmet-ugur-cetin',
  U&'Mehmet U\011Fur \00C7etin',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO NOTHING;
