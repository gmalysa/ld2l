/* Replace with your SQL commands */
ALTER TABLE `signups` DROP `mmr`, ADD `solo_mmr` INT UNSIGNED AFTER `medal`, ADD `party_mmr` INT UNSIGNED AFTER `solo_mmr`;
