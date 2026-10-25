-- Create owner-scoped family members before linking existing medical records.
CREATE TABLE "family_members" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "date_of_birth" DATE,
    "gender" "Gender",
    "is_self" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "family_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "family_members_id_user_id_key" ON "family_members"("id", "user_id");
CREATE INDEX "family_members_user_id_deleted_at_created_at_idx"
    ON "family_members"("user_id", "deleted_at", "created_at");

ALTER TABLE "family_members"
    ADD CONSTRAINT "family_members_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Every existing account gets a self member so old record-creation requests retain
-- their former meaning after family_member_id becomes required.
INSERT INTO "family_members" (
    "id", "user_id", "name", "relationship", "date_of_birth", "gender",
    "is_self", "created_at", "updated_at"
)
SELECT
    gen_random_uuid(),
    "id",
    COALESCE(NULLIF(TRIM(CONCAT_WS(' ', "first_name", "last_name")), ''), 'Me'),
    'self',
    "date_of_birth",
    "gender",
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "users";

ALTER TABLE "medical_records" ADD COLUMN "family_member_id" UUID;
UPDATE "medical_records" AS record
SET "family_member_id" = member."id"
FROM "family_members" AS member
WHERE member."user_id" = record."user_id" AND member."is_self" = true;

ALTER TABLE "medical_records" ALTER COLUMN "family_member_id" SET NOT NULL;
CREATE INDEX "medical_records_user_id_family_member_id_deleted_at_idx"
    ON "medical_records"("user_id", "family_member_id", "deleted_at");
ALTER TABLE "medical_records"
    ADD CONSTRAINT "medical_records_family_member_id_user_id_fkey"
    FOREIGN KEY ("family_member_id", "user_id")
    REFERENCES "family_members"("id", "user_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TYPE "RecordOcrStatus" AS ENUM ('queued', 'processing', 'succeeded', 'failed');

CREATE TABLE "record_ocr_jobs" (
    "id" UUID NOT NULL,
    "record_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "status" "RecordOcrStatus" NOT NULL DEFAULT 'queued',
    "text" TEXT,
    "confidence" DOUBLE PRECISION,
    "needs_review" BOOLEAN,
    "flags" JSONB,
    "quality" TEXT,
    "error_code" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "record_ocr_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "record_ocr_jobs_status_created_at_idx"
    ON "record_ocr_jobs"("status", "created_at");
CREATE INDEX "record_ocr_jobs_record_id_created_at_idx"
    ON "record_ocr_jobs"("record_id", "created_at" DESC);
CREATE UNIQUE INDEX "record_ocr_jobs_record_id_storage_key_key"
    ON "record_ocr_jobs"("record_id", "storage_key");
ALTER TABLE "record_ocr_jobs"
    ADD CONSTRAINT "record_ocr_jobs_record_id_fkey"
    FOREIGN KEY ("record_id") REFERENCES "medical_records"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
