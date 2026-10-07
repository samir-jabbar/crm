CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`company` text,
	`city` text,
	`country` text,
	`phone` text,
	`email` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `customers_deleted_idx` ON `customers` (`deleted_at`);--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`company` text,
	`contact_person` text,
	`phone` text,
	`wechat` text,
	`email` text,
	`city` text,
	`country` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `suppliers_deleted_idx` ON `suppliers` (`deleted_at`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`number` text NOT NULL,
	`number_year` integer NOT NULL,
	`number_seq` integer NOT NULL,
	`title` text NOT NULL,
	`customer_id` text NOT NULL,
	`delivery_city` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`agreed_price_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`incoterm` text,
	`destination_port` text,
	`expected_delivery_date` text,
	`budget_cny_minor` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "orders_status_check" CHECK(status IN ('draft', 'confirmed', 'purchased', 'in_production', 'inland_transport', 'at_port', 'on_vessel', 'arrived', 'customs_cleared', 'delivered', 'closed', 'cancelled')),
	CONSTRAINT "orders_currency_check" CHECK(currency IN ('CNY', 'USD', 'MAD', 'EUR')),
	CONSTRAINT "orders_incoterm_check" CHECK(incoterm IS NULL OR incoterm IN ('EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP')),
	CONSTRAINT "orders_price_check" CHECK(agreed_price_minor BETWEEN 0 AND 100000000000000),
	CONSTRAINT "orders_budget_check" CHECK(budget_cny_minor IS NULL OR budget_cny_minor BETWEEN 0 AND 100000000000000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_number_unique` ON `orders` (`number`);--> statement-breakpoint
CREATE INDEX `orders_deleted_created_idx` ON `orders` (`deleted_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_customer_idx` ON `orders` (`customer_id`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`position` integer NOT NULL,
	`product_name` text NOT NULL,
	`brand_model` text,
	`year` integer,
	`quantity` integer NOT NULL,
	`unit_price_minor` integer NOT NULL,
	`hs_code` text,
	`specs` text,
	`supplier_id` text,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "order_items_quantity_check" CHECK(quantity BETWEEN 1 AND 100000),
	CONSTRAINT "order_items_price_check" CHECK(unit_price_minor BETWEEN 0 AND 100000000000000),
	CONSTRAINT "order_items_year_check" CHECK(year IS NULL OR year BETWEEN 1950 AND 2100)
);
--> statement-breakpoint
CREATE INDEX `order_items_order_idx` ON `order_items` (`order_id`,`position`);--> statement-breakpoint
CREATE INDEX `order_items_supplier_idx` ON `order_items` (`supplier_id`);--> statement-breakpoint
CREATE TABLE `order_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`body` text NOT NULL,
	`author_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `order_notes_order_idx` ON `order_notes` (`order_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `order_number_counters` (
	`year` integer PRIMARY KEY NOT NULL,
	`last_value` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `company_settings` ADD `order_number_prefix` text DEFAULT 'HJ' NOT NULL;