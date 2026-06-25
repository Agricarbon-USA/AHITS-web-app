-- M6: optional hub contact email. When set, HUB_RETURN status links are
-- auto-delivered to the hub by email on return (lib/status-links).
ALTER TABLE "hubs" ADD COLUMN "email" TEXT;
