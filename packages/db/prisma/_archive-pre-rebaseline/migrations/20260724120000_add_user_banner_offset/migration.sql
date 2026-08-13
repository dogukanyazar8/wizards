-- Normalized banner focal point (0..1 per axis, CSS object-position). Null keeps the
-- banner centred, so every existing account renders exactly as it did before.
ALTER TABLE "User" ADD COLUMN "bannerOffsetX" DOUBLE PRECISION;
ALTER TABLE "User" ADD COLUMN "bannerOffsetY" DOUBLE PRECISION;
