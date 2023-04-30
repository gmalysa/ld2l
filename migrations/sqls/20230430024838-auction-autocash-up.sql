/* Replace with your SQL commands */
ALTER TABLE seasons
	ADD COLUMN `auction_autocash` integer unsigned DEFAULT 1 AFTER `auction_resolution`;
