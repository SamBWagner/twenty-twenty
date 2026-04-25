CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE INDEX `action_reviews_session_created_at_idx` ON `action_reviews` (`session_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `actions_session_created_at_idx` ON `actions` (`session_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `items_session_created_at_idx` ON `items` (`session_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `project_members_user_id_idx` ON `project_members` (`user_id`);--> statement-breakpoint
CREATE INDEX `retro_sessions_project_sequence_idx` ON `retro_sessions` (`project_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE INDEX `session_participants_user_id_idx` ON `session_participants` (`user_id`);--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);