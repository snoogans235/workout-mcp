-- Units belong to exercise/set metrics rather than the authenticated user.
-- Preserve user records and identity mappings from the already-merged migration.
ALTER TABLE "User" DROP COLUMN "preferredWeightUnit";
DROP TYPE "WeightUnit";
