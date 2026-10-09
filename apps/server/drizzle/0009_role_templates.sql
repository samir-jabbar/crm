-- Custom SQL migration (005): the five default role templates (FR-015). A NULL name shows the translated default
-- name until the Owner renames the template. Permissions are normalized PermissionSets (View included in every
-- other action, modules and groups in their canonical order). No template includes Direct payments (FR-016).
INSERT INTO `role_templates` (`id`, `default_key`, `name`, `permissions`, `order_scope`, `own_entries_only`, `created_at`, `updated_at`) VALUES
  ('tpl-logistics', 'logistics', NULL,
   '{"modules":{"orders":["view"],"suppliers":["view"],"shipments":["view","create","edit"],"documents":["view","create"]},"hidden":["sellingPrice","supplierPrices","customerContacts","paymentAmounts","bankDetails"]}',
   'assigned', 0, 0, 0),
  ('tpl-site_assistant', 'site_assistant', NULL,
   '{"modules":{"expenses":["view","create"]},"hidden":["sellingPrice","supplierPrices","supplierIdentity","customerContacts","paymentAmounts","bankDetails"]}',
   'assigned', 1, 0, 0),
  ('tpl-accountant', 'accountant', NULL,
   '{"modules":{"orders":["view"],"customers":["view"],"suppliers":["view"],"expenses":["view","export"],"payments.bank":["view","export"],"shipments":["view"],"invoices":["view","export"],"dashboard":["view","export"],"rates":["view"]},"hidden":[]}',
   'all', 0, 0, 0),
  ('tpl-sales_assistant', 'sales_assistant', NULL,
   '{"modules":{"orders":["view","create","edit"],"customers":["view","create","edit"],"payments.bank":["view"],"invoices":["view","create"]},"hidden":["supplierPrices","supplierIdentity","bankDetails"]}',
   'all', 0, 0, 0),
  ('tpl-read_only', 'read_only', NULL,
   '{"modules":{"orders":["view"],"customers":["view"],"suppliers":["view"],"expenses":["view"],"payments.bank":["view"],"shipments":["view"],"documents":["view"],"invoices":["view"],"dashboard":["view"],"rates":["view"]},"hidden":[]}',
   'all', 0, 0, 0);
