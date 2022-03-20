/* Replace with your SQL commands */
ALTER TABLE `signups`
	ADD COLUMN `unified_mmr` INT DEFAULT 0 AFTER `support_mmr`;
