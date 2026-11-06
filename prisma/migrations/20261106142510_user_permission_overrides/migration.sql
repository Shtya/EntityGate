-- CreateEnum
CREATE TYPE "PermissionEffect" AS ENUM ('ALLOW', 'DENY');

-- CreateTable
CREATE TABLE "user_permissions" (
    "user_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,
    "effect" "PermissionEffect" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("user_id","permission_id")
);

-- CreateIndex
CREATE INDEX "user_permissions_permission_id_idx" ON "user_permissions"("permission_id");

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
