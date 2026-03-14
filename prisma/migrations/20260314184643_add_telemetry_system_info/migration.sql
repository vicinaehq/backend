-- CreateTable
CREATE TABLE "TelemetrySystemInfo" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "desktops" TEXT NOT NULL,
    "vicinaeVersion" TEXT NOT NULL,
    "displayProtocol" TEXT NOT NULL,
    "architecture" TEXT NOT NULL,
    "operatingSystem" TEXT NOT NULL,
    "buildProvenance" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "screens" TEXT NOT NULL,
    "chassisType" TEXT NOT NULL,
    "kernelVersion" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productVersion" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "TelemetrySystemInfo_date_idx" ON "TelemetrySystemInfo"("date");

-- CreateIndex
CREATE INDEX "TelemetrySystemInfo_vicinaeVersion_idx" ON "TelemetrySystemInfo"("vicinaeVersion");

-- CreateIndex
CREATE UNIQUE INDEX "TelemetrySystemInfo_userId_date_key" ON "TelemetrySystemInfo"("userId", "date");
