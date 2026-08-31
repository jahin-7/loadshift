-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "shopName" TEXT NOT NULL,
    "generatorLitersPerHour" REAL NOT NULL DEFAULT 1.2,
    "fuelPricePerLiter" REAL NOT NULL DEFAULT 115,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "shopOpenMinutes" INTEGER NOT NULL,
    "shopCloseMinutes" INTEGER NOT NULL,
    "generatorLitersPerHour" REAL NOT NULL,
    "fuelPricePerLiter" REAL NOT NULL,
    "feasible" BOOLEAN,
    "totalGeneratorMinutes" INTEGER,
    "totalGeneratorCost" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Plan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Cut" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "startMinutes" INTEGER NOT NULL,
    "endMinutes" INTEGER NOT NULL,
    CONSTRAINT "Cut_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "power" TEXT NOT NULL,
    "scheduledStart" INTEGER,
    "scheduledEnd" INTEGER,
    "actualPower" TEXT,
    "sequence" INTEGER,
    "unscheduled" BOOLEAN NOT NULL DEFAULT false,
    "manuallyPlaced" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Job_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
