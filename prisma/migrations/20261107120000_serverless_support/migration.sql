-- Serverless hosting has no writable disk, so uploaded files can be kept in the database.
CREATE TABLE "attachment_blobs" (
    "key" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attachment_blobs_pkey" PRIMARY KEY ("key")
);

-- Sign-in limits must be shared across instances, or each new instance would reset the count.
CREATE TABLE "rate_limits" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "last_request" BIGINT NOT NULL,
    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "rate_limits_key_key" ON "rate_limits"("key");
