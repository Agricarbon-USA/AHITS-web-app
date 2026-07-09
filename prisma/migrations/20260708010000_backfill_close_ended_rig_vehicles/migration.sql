-- W0-10 PR-2b · Backfill: close historical open RigVehicle rows on already-ended rigs.
--
-- Before PR-2b, `deployments/[id]/end` ended a rig without stamping rig_vehicles.removedAt,
-- so ended rigs accumulated permanently-open vehicle rows. This backfill retroactively
-- closes them, stamping removedAt with the rig's own endedAt (the moment the vehicle
-- actually left service on that deployment) — so `removedAt IS NULL` becomes a true proxy
-- for "on an active rig", which the getVehicleOperators derivation and index C (PR-2c) need.
--
-- Idempotent: only touches rows that are still open on an ended rig, so a re-run is a no-op.
-- Additive/data-only (no schema change, no drop) — passes migration-safety. This ships in
-- PR-2b WITH the end-route close-out code fix; index C is created separately in PR-2c, only
-- AFTER the close-out fix is deployed and confirmed live (writer-before-constraint ordering,
-- mirroring PR-1-readers-before-PR-4-drop), so no new strands accumulate under the index.

UPDATE "rig_vehicles" rv
SET "removedAt" = r."endedAt",
    "removeNote" = COALESCE(rv."removeNote", '') || ' [closed: PR-2b backfill of ended-rig vehicle rows]'
FROM "rigs" r
WHERE rv."rigId" = r."id"
  AND r."endedAt" IS NOT NULL
  AND rv."removedAt" IS NULL
  -- Keep the source row OPEN for a vehicle with a still-PENDING outbound transfer from
  -- this rig — closing it would brick the recipient's accept (stillPresent guard). Such a
  -- vehicle has exactly one open row, so it does not violate the one-open-per-vehicle index.
  AND NOT EXISTS (
    SELECT 1 FROM "transfer_vehicles" tv
    JOIN "transfer_requests" tr ON tr."id" = tv."transferRequestId"
    WHERE tv."vehicleId" = rv."vehicleId"
      AND tr."fromRigId" = rv."rigId"
      AND tr."status" = 'PENDING'
  );
