CREATE TABLE `session_participants` (
	`session_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`session_id`, `user_id`),
	FOREIGN KEY (`session_id`) REFERENCES `retro_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `retro_sessions` ADD `share_token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `retro_sessions_share_token_unique` ON `retro_sessions` (`share_token`);