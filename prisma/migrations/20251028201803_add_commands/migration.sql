-- CreateTable
CREATE TABLE "Command" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "description" TEXT,
    "keywords" JSONB NOT NULL,
    "mode" TEXT NOT NULL,
    "disabledByDefault" BOOLEAN NOT NULL DEFAULT false,
    "beta" BOOLEAN NOT NULL DEFAULT false,
    "iconLight" TEXT,
    "iconDark" TEXT,
    "extensionId" TEXT NOT NULL,
    CONSTRAINT "Command_extensionId_fkey" FOREIGN KEY ("extensionId") REFERENCES "Extension" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Command_extensionId_name_key" ON "Command"("extensionId", "name");
