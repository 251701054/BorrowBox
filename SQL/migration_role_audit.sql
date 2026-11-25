-- BorrowBox Migration: Administrative User Role Management & Audit Logging
-- Adds JWT token versioning for immediate session invalidation on role changes
-- and a role_audit_logs table for tracking administrative role transitions.

USE `borrowbox`;

-- 1. Track token_version per user so stale JWTs are rejected immediately after a role change.
ALTER TABLE `users`
  ADD COLUMN `token_version` int NOT NULL DEFAULT 1 AFTER `password_hash`;

-- 2. Record all administrative role changes in an immutable audit log table.
CREATE TABLE IF NOT EXISTS `role_audit_logs` (
  `audit_id` int NOT NULL AUTO_INCREMENT,
  `target_user_id` int NOT NULL,
  `previous_role` enum('Student','Staff','Admin') NOT NULL,
  `new_role` enum('Student','Staff','Admin') NOT NULL,
  `changed_by_user_id` int NOT NULL,
  `reason` varchar(255) DEFAULT NULL,
  `changed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`audit_id`),
  KEY `idx_role_audit_target` (`target_user_id`),
  KEY `idx_role_audit_actor` (`changed_by_user_id`),
  KEY `idx_role_audit_changed_at` (`changed_at`),
  CONSTRAINT `role_audit_logs_ibfk_1`
    FOREIGN KEY (`target_user_id`) REFERENCES `users` (`user_id`)
    ON DELETE CASCADE,
  CONSTRAINT `role_audit_logs_ibfk_2`
    FOREIGN KEY (`changed_by_user_id`) REFERENCES `users` (`user_id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
