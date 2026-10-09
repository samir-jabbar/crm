CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`channel` text NOT NULL,
	`type` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`payment_date` text NOT NULL,
	`reference` text,
	`usd_cny_micro` integer NOT NULL,
	`mad_cny_micro` integer NOT NULL,
	`eur_cny_micro` integer,
	`rate_source` text NOT NULL,
	`rates_fetched_at` integer,
	`market_rate_micro` integer,
	`market_rate_date` text,
	`bank_rate_micro` integer,
	`bank_name` text,
	`bank_rate_type` text,
	`bank_rate_at` integer,
	`cny_minor` integer NOT NULL,
	`order_minor` integer NOT NULL,
	`order_minor_manual` integer DEFAULT false NOT NULL,
	`usd_minor` integer NOT NULL,
	`mad_minor` integer NOT NULL,
	`proof_file_id` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proof_file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payments_channel_check" CHECK(channel IN ('direct', 'bank')),
	CONSTRAINT "payments_type_check" CHECK(type IN ('deposit', 'balance', 'other')),
	CONSTRAINT "payments_currency_check" CHECK(currency IN ('CNY', 'USD', 'MAD', 'EUR')),
	CONSTRAINT "payments_rate_source_check" CHECK(rate_source IN ('manual', 'auto', 'auto_edited')),
	CONSTRAINT "payments_bank_type_check" CHECK(bank_rate_type IS NULL OR bank_rate_type IN ('buying', 'selling', 'other')),
	CONSTRAINT "payments_amount_check" CHECK(amount_minor BETWEEN 1 AND 100000000000000),
	CONSTRAINT "payments_values_check" CHECK(cny_minor BETWEEN 0 AND 100000000000000 AND order_minor BETWEEN 0 AND 100000000000000 AND usd_minor BETWEEN 0 AND 100000000000000 AND mad_minor BETWEEN 0 AND 100000000000000),
	CONSTRAINT "payments_rates_check" CHECK(usd_cny_micro > 0 AND mad_cny_micro > 0 AND (eur_cny_micro IS NULL OR eur_cny_micro > 0) AND (bank_rate_micro IS NULL OR bank_rate_micro > 0) AND (market_rate_micro IS NULL OR market_rate_micro > 0)),
	CONSTRAINT "payments_bank_complete_check" CHECK((bank_rate_micro IS NULL) = (bank_name IS NULL) AND (bank_name IS NULL) = (bank_rate_type IS NULL) AND (bank_rate_type IS NULL) = (bank_rate_at IS NULL)),
	CONSTRAINT "payments_bank_currency_check" CHECK(currency <> 'CNY' OR bank_rate_micro IS NULL),
	CONSTRAINT "payments_eur_rate_check" CHECK(currency <> 'EUR' OR eur_cny_micro IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX `payments_order_idx` ON `payments` (`order_id`,`deleted_at`,`payment_date`);--> statement-breakpoint
CREATE INDEX `payments_proof_idx` ON `payments` (`proof_file_id`);--> statement-breakpoint
CREATE TABLE `order_payment_stages` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`position` integer NOT NULL,
	`type` text NOT NULL,
	`channel` text NOT NULL,
	`percent_bp` integer NOT NULL,
	`due_before_status` text,
	`due_date` text,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "order_payment_stages_type_check" CHECK(type IN ('deposit', 'balance', 'other')),
	CONSTRAINT "order_payment_stages_channel_check" CHECK(channel IN ('direct', 'bank')),
	CONSTRAINT "order_payment_stages_percent_check" CHECK(percent_bp BETWEEN 1 AND 10000),
	CONSTRAINT "order_payment_stages_status_check" CHECK(due_before_status IS NULL OR due_before_status IN ('draft', 'confirmed', 'purchased', 'in_production', 'inland_transport', 'at_port', 'on_vessel', 'arrived', 'customs_cleared', 'delivered', 'closed', 'cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_payment_stages_position_unique` ON `order_payment_stages` (`order_id`,`position`);--> statement-breakpoint
CREATE TABLE `default_payment_stages` (
	`id` text PRIMARY KEY NOT NULL,
	`position` integer NOT NULL,
	`type` text NOT NULL,
	`channel` text NOT NULL,
	`percent_bp` integer NOT NULL,
	`due_before_status` text,
	CONSTRAINT "default_payment_stages_type_check" CHECK(type IN ('deposit', 'balance', 'other')),
	CONSTRAINT "default_payment_stages_channel_check" CHECK(channel IN ('direct', 'bank')),
	CONSTRAINT "default_payment_stages_percent_check" CHECK(percent_bp BETWEEN 1 AND 10000),
	CONSTRAINT "default_payment_stages_status_check" CHECK(due_before_status IS NULL OR due_before_status IN ('draft', 'confirmed', 'purchased', 'in_production', 'inland_transport', 'at_port', 'on_vessel', 'arrived', 'customs_cleared', 'delivered', 'closed', 'cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `default_payment_stages_position_unique` ON `default_payment_stages` (`position`);--> statement-breakpoint
CREATE TABLE `payment_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`direct_channel_name` text,
	`bank_channel_name` text,
	`updated_at` integer NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payment_settings_single_row" CHECK(id = 1)
);
--> statement-breakpoint
CREATE TABLE `chinese_banks` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chinese_banks_name_unique` ON `chinese_banks` (`name`);--> statement-breakpoint
-- Rebuild of `files` to widen its kind CHECK. Foreign keys are turned off around the whole migration run by
-- runMigrations (004 research R7): a PRAGMA here would be ignored inside Drizzle's transaction.
CREATE TABLE `__new_files` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`mime` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "files_kind_check" CHECK(kind IN ('receipt', 'payment_proof')),
	CONSTRAINT "files_mime_check" CHECK(mime IN ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf')),
	CONSTRAINT "files_size_check" CHECK(size_bytes BETWEEN 1 AND 10485760)
);
--> statement-breakpoint
INSERT INTO `__new_files`("id", "kind", "mime", "size_bytes", "sha256", "created_by", "created_at") SELECT "id", "kind", "mime", "size_bytes", "sha256", "created_by", "created_at" FROM `files`;--> statement-breakpoint
DROP TABLE `files`;--> statement-breakpoint
ALTER TABLE `__new_files` RENAME TO `files`;--> statement-breakpoint
CREATE INDEX `files_created_idx` ON `files` (`created_at`);