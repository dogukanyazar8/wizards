-- Keep legacy @everyone roles aligned with the centralized member baseline.
UPDATE "Role"
SET "permissions" = ("permissions" | 32704)
WHERE "isDefault" = true;
