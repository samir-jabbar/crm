-- Custom SQL migration (003): reference data for expenses and exchange rates.

-- FR-021: the 13 default categories, labelled by translation (`expenseCategory.<key>`), in the brief's order.
INSERT INTO `expense_categories` (`id`, `key`, `name`, `position`, `hidden`, `created_at`, `updated_at`) VALUES
  ('cat-equipment_purchase', 'equipment_purchase', NULL, 0, 0, 0, 0),
  ('cat-inland_transport_china', 'inland_transport_china', NULL, 1, 0, 0, 0),
  ('cat-port_loading', 'port_loading', NULL, 2, 0, 0, 0),
  ('cat-sea_freight', 'sea_freight', NULL, 3, 0, 0, 0),
  ('cat-insurance', 'insurance', NULL, 4, 0, 0, 0),
  ('cat-customs_clearance_china', 'customs_clearance_china', NULL, 5, 0, 0, 0),
  ('cat-customs_duties_morocco', 'customs_duties_morocco', NULL, 6, 0, 0, 0),
  ('cat-labor', 'labor', NULL, 7, 0, 0, 0),
  ('cat-hotel_accommodation', 'hotel_accommodation', NULL, 8, 0, 0, 0),
  ('cat-local_travel', 'local_travel', NULL, 9, 0, 0, 0),
  ('cat-commission', 'commission', NULL, 10, 0, 0, 0),
  ('cat-bank_fees', 'bank_fees', NULL, 11, 0, 0, 0),
  ('cat-other', 'other', NULL, 12, 0, 0, 0);
--> statement-breakpoint
-- FR-014: the single settings row. Currency API is the default provider (research R1): no key, dated rates.
INSERT INTO `rate_settings` (`id`, `provider`, `api_key`, `auto_fill`, `updated_at`) VALUES (1, 'currency_api', NULL, 1, 0);
