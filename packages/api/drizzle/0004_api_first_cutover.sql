CREATE TABLE `personal_access_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`token_prefix` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `personal_access_tokens_token_hash_idx` ON `personal_access_tokens` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `personal_access_tokens_user_id_idx` ON `personal_access_tokens` (`user_id`);
