-- BorrowBox Migration: Student Care & Maintenance Access
-- Adds user_id tracking to maintenance requests and care_instructions to equipment.

USE `borrowbox`;

-- 1. Associate maintenance requests with the authenticated user who reported them.
ALTER TABLE `maintenance`
  ADD COLUMN `user_id` int DEFAULT NULL AFTER `equipment_id`,
  ADD KEY `idx_maintenance_user_id` (`user_id`),
  ADD CONSTRAINT `maintenance_ibfk_2`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
    ON DELETE SET NULL;

-- 2. Store equipment care instructions so students can view handling & maintenance guidelines.
ALTER TABLE `equipment`
  ADD COLUMN `care_instructions` text DEFAULT NULL AFTER `description`;

UPDATE `equipment`
SET `care_instructions` = CASE `category`
  WHEN 'Electronics' THEN 'Keep away from liquids and extreme heat. Shut down properly before packing, coil cables loosely, and report any screen, port, or battery issues immediately.'
  WHEN 'Photography' THEN 'Always attach lens caps when not shooting. Clean lenses only with a microfiber cloth, avoid dusty or wet environments, and never force memory cards or mounts.'
  WHEN 'Accessories' THEN 'Do not bend connectors or yank cables by the cord. Store adapters and power banks dry, and report frayed wires or overheating right away.'
  WHEN 'Storage' THEN 'Always eject the drive safely before unplugging. Keep away from magnets, moisture, and drops; back up your files before returning.'
  WHEN 'Audio' THEN 'Keep volume levels safe, coil audio cables without sharp kinks, and store headphones and recorders in their protective cases after use.'
  WHEN 'Presentation' THEN 'Allow projector or light bulbs to cool before moving. Never look directly into laser pointers, and wipe whiteboards clean before returning.'
  WHEN 'Lab Equipment' THEN 'Inspect probes, tips, and power leads before use. Unplug soldering irons and 3D printers after use, let hot parts cool, and follow lab safety rules.'
  ELSE 'Handle with care, keep clean and dry, return all included accessories, and report any damage before or after use.'
END
WHERE `care_instructions` IS NULL OR `care_instructions` = '';
