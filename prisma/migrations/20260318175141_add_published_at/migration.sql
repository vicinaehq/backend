-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Extension" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "apiVersion" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "trending" BOOLEAN NOT NULL DEFAULT false,
    "iconLight" TEXT,
    "iconDark" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "publishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorId" TEXT NOT NULL,
    "killListedAt" DATETIME,
    CONSTRAINT "Extension_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Extension" ("apiVersion", "authorId", "checksum", "createdAt", "description", "downloadCount", "iconDark", "iconLight", "id", "killListedAt", "name", "storageKey", "title", "trending", "updatedAt") SELECT "apiVersion", "authorId", "checksum", "createdAt", "description", "downloadCount", "iconDark", "iconLight", "id", "killListedAt", "name", "storageKey", "title", "trending", "updatedAt" FROM "Extension";
DROP TABLE "Extension";
ALTER TABLE "new_Extension" RENAME TO "Extension";
CREATE UNIQUE INDEX "Extension_authorId_name_key" ON "Extension"("authorId", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
