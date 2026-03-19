DROP INDEX `projectInvitations_email_idx`;--> statement-breakpoint
ALTER TABLE `project_invitations` DROP COLUMN `email`;--> statement-breakpoint
ALTER TABLE `project_invitations` DROP COLUMN `accepted_at`;