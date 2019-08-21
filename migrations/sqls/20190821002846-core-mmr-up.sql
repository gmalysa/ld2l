/* Replace with your SQL commands */
ALTER TABLE `signups`
	ADD COLUMN `core_mmr` INT DEFAULT 0 AFTER `party_mmr`,
	ADD COLUMN `support_mmr` INT DEFAULT 0 AFTER `core_mmr`;
