ALTER TABLE `retro_sessions` ADD `summary_share_token` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `retro_sessions_summary_share_token_unique` ON `retro_sessions` (`summary_share_token`);
