CREATE TABLE `action_review_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`action_id` text NOT NULL,
	`session_id` text NOT NULL,
	`voter_id` text NOT NULL,
	`status` text NOT NULL,
	`comment` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`action_id`) REFERENCES `actions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `retro_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`voter_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `action_review_votes_session_action_voter_idx` ON `action_review_votes` (`session_id`,`action_id`,`voter_id`);--> statement-breakpoint
CREATE INDEX `action_review_votes_session_action_idx` ON `action_review_votes` (`session_id`,`action_id`);--> statement-breakpoint
ALTER TABLE `action_reviews` ADD `actioned_vote_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `action_reviews` ADD `did_nothing_vote_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `action_reviews` ADD `disagree_vote_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `action_review_votes` (
	`id`,
	`action_id`,
	`session_id`,
	`voter_id`,
	`status`,
	`comment`,
	`created_at`,
	`updated_at`
)
SELECT
	`id`,
	`action_id`,
	`session_id`,
	`reviewer_id`,
	`status`,
	`comment`,
	`created_at`,
	`created_at`
FROM `action_reviews`;
--> statement-breakpoint
UPDATE `action_reviews`
SET
	`actioned_vote_count` = (
		SELECT COUNT(*)
		FROM `action_review_votes`
		WHERE
			`action_review_votes`.`session_id` = `action_reviews`.`session_id`
			AND `action_review_votes`.`action_id` = `action_reviews`.`action_id`
			AND `action_review_votes`.`status` = 'actioned'
	),
	`did_nothing_vote_count` = (
		SELECT COUNT(*)
		FROM `action_review_votes`
		WHERE
			`action_review_votes`.`session_id` = `action_reviews`.`session_id`
			AND `action_review_votes`.`action_id` = `action_reviews`.`action_id`
			AND `action_review_votes`.`status` = 'did_nothing'
	),
	`disagree_vote_count` = (
		SELECT COUNT(*)
		FROM `action_review_votes`
		WHERE
			`action_review_votes`.`session_id` = `action_reviews`.`session_id`
			AND `action_review_votes`.`action_id` = `action_reviews`.`action_id`
			AND `action_review_votes`.`status` = 'disagree'
	);
--> statement-breakpoint
DELETE FROM `action_reviews`
WHERE `rowid` NOT IN (
	SELECT MIN(`rowid`)
	FROM `action_reviews`
	GROUP BY `session_id`, `action_id`
);
--> statement-breakpoint
CREATE UNIQUE INDEX `action_reviews_session_action_idx` ON `action_reviews` (`session_id`,`action_id`);
