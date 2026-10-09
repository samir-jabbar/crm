CREATE TABLE `role_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`default_key` text,
	`name` text,
	`permissions` text NOT NULL,
	`order_scope` text DEFAULT 'all' NOT NULL,
	`own_entries_only` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text,
	`updated_by` text,
	`deleted_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "role_templates_scope_check" CHECK(order_scope IN ('all', 'assigned', 'customers')),
	CONSTRAINT "role_templates_name_length" CHECK(name IS NULL OR length(name) BETWEEN 1 AND 60)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `role_templates_default_key_unique` ON `role_templates` (`default_key`);--> statement-breakpoint
CREATE TABLE `order_assignments` (
	`order_id` text NOT NULL,
	`user_id` text NOT NULL,
	`assigned_at` integer NOT NULL,
	`assigned_by` text,
	PRIMARY KEY(`order_id`, `user_id`),
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `order_assignments_user_idx` ON `order_assignments` (`user_id`,`order_id`);--> statement-breakpoint
CREATE TABLE `registrations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`ip` text,
	`user_agent` text,
	`device_label` text,
	`location` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `registrations_ip_idx` ON `registrations` (`ip`,`created_at`);--> statement-breakpoint
CREATE INDEX `registrations_user_idx` ON `registrations` (`user_id`);--> statement-breakpoint
CREATE TABLE `user_customers` (
	`user_id` text NOT NULL,
	`customer_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `customer_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `user_customers_user_idx` ON `user_customers` (`user_id`,`customer_id`);--> statement-breakpoint
-- 005: drizzle-kit wanted to rebuild `users` (it would also drop the 001 Owner-protection triggers); columns are added instead.
ALTER TABLE `users` ADD `permissions` text;--> statement-breakpoint
ALTER TABLE `users` ADD `order_scope` text DEFAULT 'all' NOT NULL CONSTRAINT "users_order_scope_check" CHECK(order_scope IN ('all', 'assigned', 'customers'));--> statement-breakpoint
ALTER TABLE `users` ADD `own_entries_only` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `access_ends_on` text;--> statement-breakpoint
ALTER TABLE `users` ADD `template_id` text REFERENCES role_templates(id);--> statement-breakpoint
ALTER TABLE `users` ADD `permissions_adjusted` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `must_change_password` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `approved_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `approved_by` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `users` ADD `rejected_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `company_settings` ADD `registration_open` integer DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX `expenses_created_by_idx` ON `expenses` (`created_by`);--> statement-breakpoint
CREATE INDEX `payments_created_by_idx` ON `payments` (`created_by`);