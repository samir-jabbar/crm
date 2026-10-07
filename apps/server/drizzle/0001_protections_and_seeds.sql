-- Custom SQL migration: database-level protections (defense in depth) and reference data.

-- FR-004: the Owner can never be deleted, demoted or made inactive — not even by a bug.
CREATE TRIGGER `users_owner_no_delete`
BEFORE DELETE ON `users`
WHEN OLD.role = 'owner'
BEGIN
  SELECT RAISE(ABORT, 'owner_protected');
END;
--> statement-breakpoint
CREATE TRIGGER `users_owner_no_demote`
BEFORE UPDATE OF role, status ON `users`
WHEN OLD.role = 'owner' AND (NEW.role <> 'owner' OR NEW.status <> 'active')
BEGIN
  SELECT RAISE(ABORT, 'owner_protected');
END;
--> statement-breakpoint
-- FR-022: audit entries are append-only through every route.
CREATE TRIGGER `audit_no_update`
BEFORE UPDATE ON `audit_entries`
BEGIN
  SELECT RAISE(ABORT, 'audit_append_only');
END;
--> statement-breakpoint
CREATE TRIGGER `audit_no_delete`
BEFORE DELETE ON `audit_entries`
BEGIN
  SELECT RAISE(ABORT, 'audit_append_only');
END;
--> statement-breakpoint
-- FR-036 / ROADMAP D1: supported currencies; CNY is the base.
INSERT INTO `currencies` (`code`, `symbol`, `minor_units`, `sort_order`) VALUES
  ('CNY', '¥', 2, 1),
  ('USD', '$', 2, 2),
  ('MAD', 'DH', 2, 3),
  ('EUR', '€', 2, 4);
--> statement-breakpoint
-- Single settings row with defaults (idle timeout 12 h).
INSERT INTO `company_settings` (`id`, `company_name`, `base_currency`, `session_idle_timeout_minutes`, `updated_at`)
VALUES (1, '', 'CNY', 720, CAST(strftime('%s', 'now') AS INTEGER) * 1000);
