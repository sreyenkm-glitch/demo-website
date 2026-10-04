CREATE TABLE `admin_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`reset_id` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`review_status` text DEFAULT 'comment' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`reset_id`) REFERENCES `weekly_resets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `admin_reviews_reset_idx` ON `admin_reviews` (`reset_id`);--> statement-breakpoint
CREATE TABLE `commitments` (
	`id` text PRIMARY KEY NOT NULL,
	`reset_id` text NOT NULL,
	`title` text NOT NULL,
	`expected_outcome` text DEFAULT '' NOT NULL,
	`kind` text DEFAULT 'priority' NOT NULL,
	`source_priority_id` text,
	`lineage_id` text NOT NULL,
	`status` text,
	`reason` text DEFAULT '' NOT NULL,
	`next_action` text DEFAULT '' NOT NULL,
	`carried_forward` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`reset_id`) REFERENCES `weekly_resets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `commitments_reset_idx` ON `commitments` (`reset_id`);--> statement-breakpoint
CREATE INDEX `commitments_lineage_idx` ON `commitments` (`lineage_id`);--> statement-breakpoint
CREATE TABLE `learnings` (
	`id` text PRIMARY KEY NOT NULL,
	`reset_id` text NOT NULL,
	`category` text DEFAULT 'execution' NOT NULL,
	`content` text NOT NULL,
	`is_biggest` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`reset_id`) REFERENCES `weekly_resets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `learnings_reset_idx` ON `learnings` (`reset_id`);--> statement-breakpoint
CREATE TABLE `misses` (
	`id` text PRIMARY KEY NOT NULL,
	`reset_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`controllability` text DEFAULT 'partially' NOT NULL,
	`correction` text DEFAULT '' NOT NULL,
	`is_biggest_miss` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`reset_id`) REFERENCES `weekly_resets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `misses_reset_idx` ON `misses` (`reset_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`href` text,
	`channel` text DEFAULT 'in_app' NOT NULL,
	`read_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`user_id`);--> statement-breakpoint
CREATE TABLE `priorities` (
	`id` text PRIMARY KEY NOT NULL,
	`reset_id` text NOT NULL,
	`title` text NOT NULL,
	`expected_outcome` text DEFAULT '' NOT NULL,
	`owner` text DEFAULT '' NOT NULL,
	`deadline` text DEFAULT '' NOT NULL,
	`priority_level` text DEFAULT 'p1' NOT NULL,
	`lineage_id` text NOT NULL,
	`carried_from_commitment_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`reset_id`) REFERENCES `weekly_resets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `priorities_reset_idx` ON `priorities` (`reset_id`);--> statement-breakpoint
CREATE TABLE `rating_categories` (
	`key` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`weight` real DEFAULT 1 NOT NULL,
	`inverted` integer DEFAULT false NOT NULL,
	`low_label` text DEFAULT 'Rough' NOT NULL,
	`high_label` text DEFAULT 'Elite' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ratings` (
	`id` text PRIMARY KEY NOT NULL,
	`reset_id` text NOT NULL,
	`metric` text NOT NULL,
	`score` integer NOT NULL,
	FOREIGN KEY (`reset_id`) REFERENCES `weekly_resets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ratings_reset_metric_uq` ON `ratings` (`reset_id`,`metric`);--> statement-breakpoint
CREATE TABLE `reflections` (
	`id` text PRIMARY KEY NOT NULL,
	`reset_id` text NOT NULL,
	`stop` text DEFAULT '' NOT NULL,
	`start` text DEFAULT '' NOT NULL,
	`continue` text DEFAULT '' NOT NULL,
	`non_negotiable` text DEFAULT '' NOT NULL,
	`reset_reflection` text DEFAULT '' NOT NULL,
	`do_differently` text DEFAULT '' NOT NULL,
	`custom_answers` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`reset_id`) REFERENCES `weekly_resets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reflections_reset_id_unique` ON `reflections` (`reset_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`title` text,
	`department` text,
	`avatar` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uq` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `weekly_resets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`week_id` text NOT NULL,
	`week_number` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`status` text DEFAULT 'not_started' NOT NULL,
	`sections_done` text DEFAULT '[]' NOT NULL,
	`started_at` text,
	`submitted_at` text,
	`reviewed_at` text,
	`overall_score` real,
	`updated_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`week_id`) REFERENCES `weeks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resets_user_week_uq` ON `weekly_resets` (`user_id`,`week_id`);--> statement-breakpoint
CREATE INDEX `resets_week_idx` ON `weekly_resets` (`week_id`);--> statement-breakpoint
CREATE TABLE `weeks` (
	`id` text PRIMARY KEY NOT NULL,
	`week_number` integer NOT NULL,
	`year` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`deadline` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`questions` text DEFAULT '{}' NOT NULL,
	`locked_at` text,
	`created_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `weeks_year_number_uq` ON `weeks` (`year`,`week_number`);--> statement-breakpoint
CREATE TABLE `wins` (
	`id` text PRIMARY KEY NOT NULL,
	`reset_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`impact` text DEFAULT '' NOT NULL,
	`is_biggest_win` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`reset_id`) REFERENCES `weekly_resets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `wins_reset_idx` ON `wins` (`reset_id`);--> statement-breakpoint
CREATE TABLE `work_items` (
	`id` text PRIMARY KEY NOT NULL,
	`reset_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`impact` text DEFAULT '' NOT NULL,
	`link` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`reset_id`) REFERENCES `weekly_resets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `work_items_reset_idx` ON `work_items` (`reset_id`);