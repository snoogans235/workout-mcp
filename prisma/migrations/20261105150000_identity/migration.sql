-- Only identity persistence is migrated. Other schema models remain design drafts.
CREATE TYPE "WeightUnit" AS ENUM ('LB', 'KG');

CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "displayName" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "preferredWeightUnit" "WeightUnit" NOT NULL DEFAULT 'LB',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExternalIdentity" (
    "issuer" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExternalIdentity_pkey" PRIMARY KEY ("issuer", "subject"),
    CONSTRAINT "ExternalIdentity_issuer_nonempty" CHECK (length(btrim("issuer")) > 0),
    CONSTRAINT "ExternalIdentity_subject_nonempty" CHECK (length(btrim("subject")) > 0)
);
CREATE UNIQUE INDEX "ExternalIdentity_userId_key" ON "ExternalIdentity"("userId");
ALTER TABLE "ExternalIdentity" ADD CONSTRAINT "ExternalIdentity_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
