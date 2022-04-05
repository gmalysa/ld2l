ALTER TABLE `seasons`
	ADD COLUMN `auction_base` integer unsigned DEFAULT 500 AFTER `linearization`,
	ADD COLUMN `auction_scale` integer unsigned DEFAULT 55 AFTER `auction_base`,
	ADD COLUMN `auction_resolution` integer unsigned DEFAULT 5 AFTER `auction_scale`;

ALTER TABLE `signups`
	ADD COLUMN `cost` integer unsigned DEFAULT 0 AFTER `unified_mmr`;

ALTER TABLE `teams`
	ADD COLUMN `starting_money` integer unsigned DEFAULT 0 AFTER `logo`,
	ADD COLUMN `money` integer unsigned DEFAULT 0 AFTER `starting_money`;
