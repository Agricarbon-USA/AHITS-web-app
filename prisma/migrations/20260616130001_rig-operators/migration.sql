-- Create rig_operators junction table for multi-operator deployments
CREATE TABLE "rig_operators" (
    "id"         TEXT NOT NULL,
    "rigId"      TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "addedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rig_operators_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "rig_operators"
    ADD CONSTRAINT "rig_operators_rigId_fkey"
    FOREIGN KEY ("rigId") REFERENCES "rigs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "rig_operators"
    ADD CONSTRAINT "rig_operators_operatorId_fkey"
    FOREIGN KEY ("operatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "rig_operators_rigId_operatorId_key" ON "rig_operators"("rigId", "operatorId");
