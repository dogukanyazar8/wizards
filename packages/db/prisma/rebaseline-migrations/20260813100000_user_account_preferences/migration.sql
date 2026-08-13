-- Account settings phase 1. Defaults preserve the behavior of every existing
-- account; null timeZone means the client follows its device/browser zone.
CREATE TYPE "ProfileVisibility" AS ENUM ('EVERYONE', 'FRIENDS', 'NOBODY');
CREATE TYPE "PresenceVisibility" AS ENUM ('EVERYONE', 'FRIENDS', 'NOBODY');
CREATE TYPE "UserDateFormat" AS ENUM ('LOCALE', 'DMY', 'MDY', 'YMD');
CREATE TYPE "UserTimeFormat" AS ENUM ('LOCALE', 'H12', 'H24');
CREATE TYPE "InterfaceDensity" AS ENUM ('COMFORTABLE', 'COMPACT');

ALTER TABLE "UserSettings"
  ADD COLUMN "profileVisibility" "ProfileVisibility" NOT NULL DEFAULT 'EVERYONE',
  ADD COLUMN "presenceVisibility" "PresenceVisibility" NOT NULL DEFAULT 'EVERYONE',
  ADD COLUMN "timeZone" TEXT,
  ADD COLUMN "dateFormat" "UserDateFormat" NOT NULL DEFAULT 'LOCALE',
  ADD COLUMN "timeFormat" "UserTimeFormat" NOT NULL DEFAULT 'LOCALE',
  ADD COLUMN "interfaceDensity" "InterfaceDensity" NOT NULL DEFAULT 'COMFORTABLE';
