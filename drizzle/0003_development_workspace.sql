CREATE TABLE `development_workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`repository_id` text NOT NULL,
	`worker_id` text NOT NULL,
	`local_path` text NOT NULL,
	`base_branch` text DEFAULT 'main' NOT NULL,
	`working_branch` text,
	`status` text DEFAULT 'preparing' NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_active_at` integer NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_development_workspaces_repo_worker` ON `development_workspaces` (`repository_id`,`worker_id`);
--> statement-breakpoint
CREATE INDEX `idx_development_workspaces_owner_status` ON `development_workspaces` (`owner_id`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_development_workspaces_worker_active` ON `development_workspaces` (`worker_id`,`last_active_at`);
--> statement-breakpoint
CREATE TABLE `workspace_processes` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`pid` integer NOT NULL,
	`command` text NOT NULL,
	`cwd` text,
	`status` text DEFAULT 'running' NOT NULL,
	`started_at` integer,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `development_workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_workspace_processes_workspace_pid` ON `workspace_processes` (`workspace_id`,`pid`);
--> statement-breakpoint
CREATE INDEX `idx_workspace_processes_workspace_status` ON `workspace_processes` (`workspace_id`,`status`);
--> statement-breakpoint
CREATE TABLE `workspace_ports` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`process_id` text,
	`port` integer NOT NULL,
	`protocol` text DEFAULT 'tcp' NOT NULL,
	`host` text DEFAULT '127.0.0.1' NOT NULL,
	`kind` text DEFAULT 'unknown' NOT NULL,
	`status` text DEFAULT 'listening' NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `development_workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`process_id`) REFERENCES `workspace_processes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_workspace_ports_workspace_port_protocol` ON `workspace_ports` (`workspace_id`,`port`,`protocol`);
--> statement-breakpoint
CREATE INDEX `idx_workspace_ports_workspace_status` ON `workspace_ports` (`workspace_id`,`status`);
--> statement-breakpoint
ALTER TABLE `tasks` ADD `workspace_id` text REFERENCES development_workspaces(id);
--> statement-breakpoint
CREATE INDEX `idx_tasks_workspace_updated` ON `tasks` (`workspace_id`,`updated_at`);
