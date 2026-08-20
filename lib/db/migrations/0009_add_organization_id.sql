ALTER TABLE "Chat" ADD COLUMN IF NOT EXISTS "organizationId" varchar(128);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Chat_organizationId_idx" ON "Chat" ("organizationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Chat_userId_organizationId_idx" ON "Chat" ("userId", "organizationId");

