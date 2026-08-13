-- Postgres refuses to use a freshly added enum value inside the same transaction,
-- so the CHECK constraint that references PROFILE_BANNER lands in the next migration.
ALTER TYPE "MobileMediaUploadPurpose" ADD VALUE IF NOT EXISTS 'PROFILE_BANNER';
