CREATE TABLE `repositories` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`full_name` text NOT NULL,
	`url` text NOT NULL,
	`default_branch` text DEFAULT 'main' NOT NULL,
	`visibility` text DEFAULT 'unknown' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_repositories_owner_full_name` ON `repositories` (`owner_id`,`full_name`);--> statement-breakpoint
CREATE INDEX `idx_repositories_owner` ON `repositories` (`owner_id`);--> statement-breakpoint
CREATE TABLE `task_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` text NOT NULL,
	`kind` text NOT NULL,
	`message` text NOT NULL,
	`payload` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_task_events_task_created` ON `task_events` (`task_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`repository_id` text NOT NULL,
	`title` text NOT NULL,
	`prompt` text NOT NULL,
	`actor` text NOT NULL,
	`model` text,
	`base_branch` text DEFAULT 'main' NOT NULL,
	`work_branch` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`worker_id` text,
	`attempt` integer DEFAULT 1 NOT NULL,
	`summary` text,
	`diff_stat` text,
	`pr_url` text,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_tasks_owner_status_updated` ON `tasks` (`owner_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_tasks_worker_status` ON `tasks` (`worker_id`,`status`);--> statement-breakpoint
CREATE TABLE `workers` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`platform` text DEFAULT 'unknown' NOT NULL,
	`capabilities` text DEFAULT '[]' NOT NULL,
	`last_seen_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_workers_token_hash` ON `workers` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_workers_owner_last_seen` ON `workers` (`owner_id`,`last_seen_at`);--> statement-breakpoint
PRAGMA optimize;
