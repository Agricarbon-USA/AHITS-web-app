-- NEW-2: project metadata fields (Customer, Code, Size in hectares, # Samples).
-- All nullable + additive → backward-compatible (old code keeps serving while
-- this applies). Float maps to double precision; Int to integer.
ALTER TABLE "projects" ADD COLUMN "customer" TEXT;
ALTER TABLE "projects" ADD COLUMN "code" TEXT;
ALTER TABLE "projects" ADD COLUMN "sizeHa" DOUBLE PRECISION;
ALTER TABLE "projects" ADD COLUMN "sampleCount" INTEGER;
