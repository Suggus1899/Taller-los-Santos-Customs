-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "audit_action" ADD VALUE 'CREATED';
ALTER TYPE "audit_action" ADD VALUE 'UPDATED';
ALTER TYPE "audit_action" ADD VALUE 'DELETED';
ALTER TYPE "audit_action" ADD VALUE 'PASSWORD_CHANGED';
ALTER TYPE "audit_action" ADD VALUE 'JOB_RETRIED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "audit_entity" ADD VALUE 'SERVICE';
ALTER TYPE "audit_entity" ADD VALUE 'PROMOTION';
ALTER TYPE "audit_entity" ADD VALUE 'JOB';
