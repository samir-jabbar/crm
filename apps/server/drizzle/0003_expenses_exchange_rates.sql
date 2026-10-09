CREATE TABLE `expense_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text,
	`name` text,
	`position` integer NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "expense_categories_label_check" CHECK(key IS NOT NULL OR name IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expense_categories_key_unique` ON `expense_categories` (`key`);--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`mime` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "files_kind_check" CHECK(kind IN ('receipt')),
	CONSTRAINT "files_mime_check" CHECK(mime IN ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf')),
	CONSTRAINT "files_size_check" CHECK(size_bytes BETWEEN 1 AND 10485760)
);
--> statement-breakpoint
CREATE INDEX `files_created_idx` ON `files` (`created_at`);--> statement-breakpoint
CREATE TABLE `exchange_rates` (
	`provider` text NOT NULL,
	`rate_date` text NOT NULL,
	`currency` text NOT NULL,
	`rate_micro` integer NOT NULL,
	`fetched_at` integer NOT NULL,
	PRIMARY KEY(`provider`, `rate_date`, `currency`),
	CONSTRAINT "exchange_rates_currency_check" CHECK(currency IN ('USD', 'MAD', 'EUR')),
	CONSTRAINT "exchange_rates_rate_check" CHECK(rate_micro > 0)
);
--> statement-breakpoint
CREATE TABLE `rate_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`provider` text DEFAULT 'currency_api' NOT NULL,
	`api_key` text,
	`auto_fill` integer DEFAULT true NOT NULL,
	`last_fetch_at` integer,
	`last_error` text,
	`last_error_at` integer,
	`updated_at` integer NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "rate_settings_single_row" CHECK(id = 1),
	CONSTRAINT "rate_settings_provider_check" CHECK(provider IN ('currency_api', 'exchangerate_api_open', 'manual'))
);
--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`name` text NOT NULL,
	`category_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`rate_micro` integer NOT NULL,
	`rate_source` text NOT NULL,
	`cny_minor` integer NOT NULL,
	`usd_cny_micro` integer,
	`mad_cny_micro` integer,
	`expense_date` text NOT NULL,
	`paid_to_supplier_id` text,
	`paid_to_name` text,
	`payment_method` text DEFAULT 'cash' NOT NULL,
	`advanced_by` text,
	`reimbursed` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'paid' NOT NULL,
	`due_date` text,
	`receipt_file_id` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `expense_categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`paid_to_supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`receipt_file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "expenses_currency_check" CHECK(currency IN ('CNY', 'USD', 'MAD', 'EUR')),
	CONSTRAINT "expenses_amount_check" CHECK(amount_minor BETWEEN 1 AND 100000000000000),
	CONSTRAINT "expenses_cny_check" CHECK(cny_minor BETWEEN 0 AND 100000000000000),
	CONSTRAINT "expenses_rate_check" CHECK(rate_micro > 0),
	CONSTRAINT "expenses_cny_rate_check" CHECK(currency <> 'CNY' OR rate_micro = 1000000),
	CONSTRAINT "expenses_paid_to_check" CHECK(NOT (paid_to_supplier_id IS NOT NULL AND paid_to_name IS NOT NULL)),
	CONSTRAINT "expenses_status_check" CHECK(status IN ('paid', 'to_pay')),
	CONSTRAINT "expenses_method_check" CHECK(payment_method IN ('cash', 'bank', 'other')),
	CONSTRAINT "expenses_rate_source_check" CHECK(rate_source IN ('manual', 'auto', 'auto_edited'))
);
--> statement-breakpoint
CREATE INDEX `expenses_order_idx` ON `expenses` (`order_id`,`deleted_at`,`expense_date`);--> statement-breakpoint
CREATE INDEX `expenses_category_idx` ON `expenses` (`category_id`);--> statement-breakpoint
CREATE INDEX `expenses_paid_to_supplier_idx` ON `expenses` (`paid_to_supplier_id`);--> statement-breakpoint
CREATE INDEX `expenses_advanced_by_idx` ON `expenses` (`advanced_by`);--> statement-breakpoint
CREATE INDEX `expenses_receipt_idx` ON `expenses` (`receipt_file_id`);--> statement-breakpoint
-- Hand-edited: drizzle-kit rebuilt `orders` to add this column, but its copy read the new column from the old
-- table and the rebuild cannot drop `orders` while order items and notes reference it. SQLite accepts a CHECK
-- on ADD COLUMN, so the 002 rows and indexes are kept as they are.
ALTER TABLE `orders` ADD `agreed_rate_micro` integer CONSTRAINT "orders_agreed_rate_check" CHECK(agreed_rate_micro IS NULL OR agreed_rate_micro > 0);
