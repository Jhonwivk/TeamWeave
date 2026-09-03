CREATE TABLE `development_workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`repository_id` text NOT NULL,
	`worker_id` text,
	`local_path` text,
	`base_branch` text DEFAULT 'main' NOT NULL,
	`working_branch` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`last_active_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_development_workspaces_owner_status_updated` ON `development_workspaces` (`owner_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_development_workspaces_worker_status` ON `development_workspaces` (`worker_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_development_workspaces_repository_status` ON `development_workspaces` (`repository_id`,`status`);--> statement-breakpoint
CREATE TABLE `workspace_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` text NOT NULL,
	`kind` text NOT NULL,
	`message` text NOT NULL,
	`payload` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `development_workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_workspace_events_workspace_created` ON `workspace_events` (`workspace_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `tasks` ADD `workspace_id` text REFERENCES development_workspaces(id);