-- CreateTable
CREATE TABLE "Extension" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "apiVersion" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "authorId" TEXT NOT NULL,
    "killListedAt" DATETIME,
    CONSTRAINT "Extension_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExtensionPlatform" (
    "id" TEXT NOT NULL PRIMARY KEY
);

-- CreateTable
CREATE TABLE "ExtensionCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "GitHubUser" (
    "id" TEXT NOT NULL PRIMARY KEY
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "githubId" TEXT NOT NULL,
    CONSTRAINT "User_githubId_fkey" FOREIGN KEY ("githubId") REFERENCES "GitHubUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_ExtensionToExtensionCategory" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_ExtensionToExtensionCategory_A_fkey" FOREIGN KEY ("A") REFERENCES "Extension" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ExtensionToExtensionCategory_B_fkey" FOREIGN KEY ("B") REFERENCES "ExtensionCategory" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_ExtensionToExtensionPlatform" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_ExtensionToExtensionPlatform_A_fkey" FOREIGN KEY ("A") REFERENCES "Extension" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ExtensionToExtensionPlatform_B_fkey" FOREIGN KEY ("B") REFERENCES "ExtensionPlatform" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Extension_authorId_name_key" ON "Extension"("authorId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "User_githubId_key" ON "User"("githubId");

-- CreateIndex
CREATE UNIQUE INDEX "_ExtensionToExtensionCategory_AB_unique" ON "_ExtensionToExtensionCategory"("A", "B");

-- CreateIndex
CREATE INDEX "_ExtensionToExtensionCategory_B_index" ON "_ExtensionToExtensionCategory"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_ExtensionToExtensionPlatform_AB_unique" ON "_ExtensionToExtensionPlatform"("A", "B");

-- CreateIndex
CREATE INDEX "_ExtensionToExtensionPlatform_B_index" ON "_ExtensionToExtensionPlatform"("B");
