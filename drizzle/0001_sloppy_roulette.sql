CREATE TABLE `agent_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`actor` text NOT NULL,
	`role` text NOT NULL,
	`model` text,
	`ordinal` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`runtime` text,
	`runtime_name` text,
	`workspace_id` text,
	`pane_id` text,
	`summary` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_agent_sessions_task_ordinal` ON `agent_sessions` (`task_id`,`ordinal`);--> statement-breakpoint
CREATE INDEX `idx_agent_sessions_task_status` ON `agent_sessions` (`task_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_agent_sessions_runtime_name` ON `agent_sessions` (`runtime_name`);--> statement-breakpoint
CREATE TABLE `session_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`from_session_id` text,
	`to_session_id` text,
	`kind` text DEFAULT 'handoff' NOT NULL,
	`body` text NOT NULL,
	`artifacts` text DEFAULT '[]' NOT NULL,
	`git_ref` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`delivered_at` integer,
	`acknowledged_at` integer,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_session_id`) REFERENCES `agent_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_session_id`) REFERENCES `agent_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_session_messages_task_created` ON `session_messages` (`task_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_session_messages_to_status` ON `session_messages` (`to_session_id`,`status`);--> statement-breakpoint
ALTER TABLE `tasks` ADD `mode` text DEFAULT 'single' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `runtime` text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `active_session_id` text;--> statement-breakpoint
ALTER TABLE `workers` ADD `runtimes` text DEFAULT '["direct"]' NOT NULL;--> statement-breakpoint
PRAGMA optimize;
