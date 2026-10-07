CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`username_normalized` text NOT NULL,
	`display_name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text NOT NULL,
	`status` text NOT NULL,
	`language` text NOT NULL,
	`password_changed_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "users_role_check" CHECK(role IN ('owner', 'worker')),
	CONSTRAINT "users_status_check" CHECK(status IN ('active', 'pending', 'suspended', 'deleted')),
	CONSTRAINT "users_language_check" CHECK(language IN ('en', 'fr', 'ar'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_normalized_unique` ON `users` (username_normalized);--> statement-breakpoint
CREATE UNIQUE INDEX `users_one_owner` ON `users` (role) WHERE role = 'owner';--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_active_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`revoked_reason` text,
	`ip` text NOT NULL,
	`user_agent` text NOT NULL,
	`device_label` text NOT NULL,
	`location` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_user_revoked_idx` ON `sessions` (`user_id`,`revoked_at`);--> statement-breakpoint
CREATE TABLE `sign_in_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`occurred_at` integer NOT NULL,
	`username_input` text NOT NULL,
	`username_normalized` text NOT NULL,
	`user_id` text,
	`outcome` text NOT NULL,
	`reason` text NOT NULL,
	`ip` text NOT NULL,
	`user_agent` text NOT NULL,
	`device_label` text NOT NULL,
	`location` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sign_in_attempts_username_idx` ON `sign_in_attempts` (`username_normalized`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `sign_in_attempts_ip_idx` ON `sign_in_attempts` (`ip`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `sign_in_attempts_user_idx` ON `sign_in_attempts` (`user_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `audit_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`occurred_at` integer NOT NULL,
	`actor_user_id` text,
	`actor_label` text NOT NULL,
	`action` text NOT NULL,
	`target_type` text,
	`target_id` text,
	`ip` text,
	`user_agent` text,
	`device_label` text,
	`before_json` text,
	`after_json` text,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_entries_occurred_idx` ON `audit_entries` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `audit_entries_actor_idx` ON `audit_entries` (`actor_user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `audit_entries_action_idx` ON `audit_entries` (`action`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `company_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`company_name` text DEFAULT '' NOT NULL,
	`base_currency` text DEFAULT 'CNY' NOT NULL,
	`session_idle_timeout_minutes` integer DEFAULT 720 NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "company_settings_single_row" CHECK(id = 1),
	CONSTRAINT "company_settings_base_currency" CHECK(base_currency = 'CNY'),
	CONSTRAINT "company_settings_timeout_range" CHECK(session_idle_timeout_minutes BETWEEN 15 AND 10080)
);
--> statement-breakpoint
CREATE TABLE `currencies` (
	`code` text PRIMARY KEY NOT NULL,
	`symbol` text NOT NULL,
	`minor_units` integer NOT NULL,
	`sort_order` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
