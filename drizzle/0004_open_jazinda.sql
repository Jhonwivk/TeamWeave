CREATE TABLE `workspace_ports` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`worker_id` text,
	`process_id` text,
	`pid` integer,
	`host` text DEFAULT '127.0.0.1' NOT NULL,
	`port` integer NOT NULL,
	`protocol` text DEFAULT 'http' NOT NULL,
	`label` text,
	`url` text,
	`status` text DEFAULT 'listening' NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `development_workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_workspace_ports_workspace_protocol_port` ON `workspace_ports` (`workspace_id`,`protocol`,`port`);--> statement-breakpoint
CREATE INDEX `idx_workspace_ports_owner_workspace_status` ON `workspace_ports` (`owner_id`,`workspace_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_workspace_ports_worker_last_seen` ON `workspace_ports` (`worker_id`,`last_seen_at`);--> statement-breakpoint
CREATE TABLE `workspace_processes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`worker_id` text,
	`pid` integer NOT NULL,
	`parent_pid` integer,
	`name` text NOT NULL,
	`command` text,
	`cwd` text,
	`status` text DEFAULT 'running' NOT NULL,
	`started_at` integer,
	`last_seen_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `development_workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_workspace_processes_workspace_pid` ON `workspace_processes` (`workspace_id`,`pid`);--> statement-breakpoint
CREATE INDEX `idx_workspace_processes_owner_workspace_status` ON `workspace_processes` (`owner_id`,`workspace_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_workspace_processes_worker_last_seen` ON `workspace_processes` (`worker_id`,`last_seen_at`);