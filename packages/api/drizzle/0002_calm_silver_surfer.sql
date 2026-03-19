CREATE TABLE `project_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`email` text NOT NULL,
	`invited_by_user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_invitations_token_unique` ON `project_invitations` (`token`);--> statement-breakpoint
CREATE INDEX `projectInvitations_projectId_idx` ON `project_invitations` (`project_id`);--> statement-breakpoint
CREATE INDEX `projectInvitations_email_idx` ON `project_invitations` (`email`);