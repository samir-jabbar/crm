-- Custom SQL migration (004): reference data for payments, and a plan for every existing order.

-- FR-027: the single settings row. Null channel names mean the translated defaults.
INSERT INTO `payment_settings` (`id`, `direct_channel_name`, `bank_channel_name`, `updated_at`) VALUES (1, NULL, NULL, 0);
--> statement-breakpoint
-- FR-013: the default plan, matching brief §9 AC2: a 30% deposit through Direct before production,
-- and the 70% balance through the bank before shipping (i.e. before the order is on the vessel).
INSERT INTO `default_payment_stages` (`id`, `position`, `type`, `channel`, `percent_bp`, `due_before_status`) VALUES
  ('dps-0', 0, 'deposit', 'direct', 3000, 'in_production'),
  ('dps-1', 1, 'balance', 'bank', 7000, 'on_vessel');
--> statement-breakpoint
-- FR-027: the Chinese banks offered first in the bank-rate field.
INSERT INTO `chinese_banks` (`id`, `name`, `position`, `created_at`) VALUES
  ('bank-boc', 'Bank of China', 0, 0),
  ('bank-icbc', 'ICBC', 1, 0),
  ('bank-abc', 'ABC', 2, 0),
  ('bank-ccb', 'CCB', 3, 0);
--> statement-breakpoint
-- FR-013: orders created before 004 (deleted ones included, so a restore brings them back with a plan)
-- receive the default plan.
INSERT INTO `order_payment_stages` (`id`, `order_id`, `position`, `type`, `channel`, `percent_bp`, `due_before_status`, `due_date`)
SELECT 'stg-' || `orders`.`id` || '-' || `default_payment_stages`.`position`, `orders`.`id`, `default_payment_stages`.`position`,
       `default_payment_stages`.`type`, `default_payment_stages`.`channel`, `default_payment_stages`.`percent_bp`,
       `default_payment_stages`.`due_before_status`, NULL
FROM `orders` CROSS JOIN `default_payment_stages`;
