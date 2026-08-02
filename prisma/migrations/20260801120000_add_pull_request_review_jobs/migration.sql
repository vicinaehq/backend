-- CreateTable
CREATE TABLE "PullRequestReviewJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deliveryId" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "repository" TEXT NOT NULL,
    "pullNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "headSha" TEXT,
    "reviewId" BIGINT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "PullRequestReviewJob_deliveryId_key" ON "PullRequestReviewJob"("deliveryId");

-- CreateIndex
CREATE INDEX "PullRequestReviewJob_status_createdAt_idx" ON "PullRequestReviewJob"("status", "createdAt");

-- CreateTable
CREATE TABLE "PullRequestReviewState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "owner" TEXT NOT NULL,
    "repository" TEXT NOT NULL,
    "pullNumber" INTEGER NOT NULL,
    "statusCommentId" BIGINT,
    "targetHeadSha" TEXT,
    "lastNotifiedSha" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "PullRequestReviewState_owner_repository_pullNumber_key" ON "PullRequestReviewState"("owner", "repository", "pullNumber");
