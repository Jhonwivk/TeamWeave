CREATE TABLE `workspace_files` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`worker_id` text,
	`path` text NOT NULL,
	`kind` text DEFAULT 'file' NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`modified_at` integer,
	`status` text DEFAULT 'present' NOT NULL,
	`last_seen_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `development_workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_workspace_files_workspace_path` ON `workspace_files` (`workspace_id`,`path`);--> statement-breakpoint
CREATE INDEX `idx_workspace_files_owner_workspace_status` ON `workspace_files` (`owner_id`,`workspace_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_workspace_files_worker_last_seen` ON `workspace_files` (`worker_id`,`last_seen_at`);