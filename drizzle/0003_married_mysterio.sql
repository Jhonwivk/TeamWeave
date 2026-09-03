CREATE TABLE `workspace_terminal_commands` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`terminal_id` text NOT NULL,
	`worker_id` text,
	`kind` text NOT NULL,
	`payload` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`claimed_at` integer,
	`completed_at` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `development_workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`terminal_id`) REFERENCES `workspace_terminals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_workspace_terminal_commands_workspace_status_created` ON `workspace_terminal_commands` (`workspace_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_workspace_terminal_commands_worker_status` ON `workspace_terminal_commands` (`worker_id`,`status`);--> statement-breakpoint
CREATE TABLE `workspace_terminal_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`terminal_id` text NOT NULL,
	`kind` text NOT NULL,
	`data` text,
	`payload` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `development_workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`terminal_id`) REFERENCES `workspace_terminals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_workspace_terminal_events_terminal_created` ON `workspace_terminal_events` (`terminal_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `workspace_terminals` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`worker_id` text,
	`shell` text DEFAULT 'bash' NOT NULL,
	`cwd` text,
	`cols` integer DEFAULT 120 NOT NULL,
	`rows` integer DEFAULT 32 NOT NULL,
	`pid` integer,
	`status` text DEFAULT 'queued' NOT NULL,
	`exit_code` integer,
	`error` text,
	`created_at` integer NOT NULL,
	`last_active_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `development_workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_workspace_terminals_owner_workspace_status` ON `workspace_terminals` (`owner_id`,`workspace_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_workspace_terminals_worker_status` ON `workspace_terminals` (`worker_id`,`status`);