-- AlterTable
ALTER TABLE "Job" ADD COLUMN "attachmentMime" TEXT;
ALTER TABLE "Job" ADD COLUMN "attachmentName" TEXT;
ALTER TABLE "Job" ADD COLUMN "attachmentPath" TEXT;

-- CreateTable
CREATE TABLE "MeterReading" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "readingKwh" REAL NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MeterReading_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Plan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "shopOpenMinutes" INTEGER NOT NULL,
    "shopCloseMinutes" INTEGER NOT NULL,
    "generatorLitersPerHour" REAL NOT NULL,
    "fuelPricePerLiter" REAL NOT NULL,
    "hasGenerator" BOOLEAN NOT NULL DEFAULT true,
    "hasSolar" BOOLEAN NOT NULL DEFAULT false,
    "solarStartMinutes" INTEGER,
    "solarEndMinutes" INTEGER,
    "feasible" BOOLEAN,
    "totalGeneratorMinutes" INTEGER,
    "totalSolarMinutes" INTEGER,
    "totalGeneratorCost" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Plan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Plan" ("createdAt", "feasible", "fuelPricePerLiter", "generatorLitersPerHour", "id", "label", "shopCloseMinutes", "shopOpenMinutes", "totalGeneratorCost", "totalGeneratorMinutes", "updatedAt", "userId") SELECT "createdAt", "feasible", "fuelPricePerLiter", "generatorLitersPerHour", "id", "label", "shopCloseMinutes", "shopOpenMinutes", "totalGeneratorCost", "totalGeneratorMinutes", "updatedAt", "userId" FROM "Plan";
DROP TABLE "Plan";
ALTER TABLE "new_Plan" RENAME TO "Plan";
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "googleId" TEXT,
    "shopName" TEXT NOT NULL,
    "generatorLitersPerHour" REAL NOT NULL DEFAULT 1.2,
    "fuelPricePerLiter" REAL NOT NULL DEFAULT 115,
    "hasGenerator" BOOLEAN NOT NULL DEFAULT true,
    "hasSolar" BOOLEAN NOT NULL DEFAULT false,
    "solarStartMinutes" INTEGER,
    "solarEndMinutes" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("createdAt", "email", "fuelPricePerLiter", "generatorLitersPerHour", "id", "passwordHash", "shopName") SELECT "createdAt", "email", "fuelPricePerLiter", "generatorLitersPerHour", "id", "passwordHash", "shopName" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
