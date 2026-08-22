-- CreateTable
CREATE TABLE "UrlShortUrl" (
    "id" TEXT NOT NULL,
    "shortCode" TEXT NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "UrlShortUrl_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UrlShortUrl_shortCode_key" ON "UrlShortUrl"("shortCode");

-- CreateIndex
CREATE INDEX "UrlShortUrl_userId_idx" ON "UrlShortUrl"("userId");

-- CreateIndex
CREATE INDEX "UrlShortUrl_expiresAt_idx" ON "UrlShortUrl"("expiresAt");
