-- CreateTable
CREATE TABLE "MessageThread" (
    "id"              SERIAL NOT NULL,
    "articleId"       INTEGER NOT NULL,
    "ownerUserId"     INTEGER NOT NULL,
    "requesterId"     INTEGER NOT NULL,
    "lastMessageAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ownerUnread"     BOOLEAN NOT NULL DEFAULT false,
    "requesterUnread" BOOLEAN NOT NULL DEFAULT false,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MessageThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id"           SERIAL NOT NULL,
    "threadId"     INTEGER NOT NULL,
    "senderUserId" INTEGER NOT NULL,
    "body"         VARCHAR(2000) NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_thread_article_requester" ON "MessageThread"("articleId", "requesterId");

-- CreateIndex
CREATE INDEX "MessageThread_ownerUserId_lastMessageAt_idx" ON "MessageThread"("ownerUserId", "lastMessageAt" DESC);

-- CreateIndex
CREATE INDEX "MessageThread_requesterId_lastMessageAt_idx" ON "MessageThread"("requesterId", "lastMessageAt" DESC);

-- CreateIndex
CREATE INDEX "MessageThread_articleId_idx" ON "MessageThread"("articleId");

-- CreateIndex
CREATE INDEX "Message_threadId_createdAt_idx" ON "Message"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_senderUserId_idx" ON "Message"("senderUserId");

-- AddForeignKey
ALTER TABLE "MessageThread" ADD CONSTRAINT "MessageThread_articleId_fkey"
    FOREIGN KEY ("articleId") REFERENCES "Article"("articleId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageThread" ADD CONSTRAINT "MessageThread_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageThread" ADD CONSTRAINT "MessageThread_requesterId_fkey"
    FOREIGN KEY ("requesterId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_threadId_fkey"
    FOREIGN KEY ("threadId") REFERENCES "MessageThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderUserId_fkey"
    FOREIGN KEY ("senderUserId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
