INSERT INTO "Contributor" ("id", "name", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Alperen Mezireli', NOW(), NOW())
ON CONFLICT ("name") DO NOTHING;
