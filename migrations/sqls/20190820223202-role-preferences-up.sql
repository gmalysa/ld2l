/* Replace with your SQL commands */
ALTER TABLE `signups`
  ADD COLUMN `pos_5` TINYINT DEFAULT 1 AFTER `mmr_valid`,
  ADD COLUMN `pos_4` TINYINT DEFAULT 1 AFTER `mmr_valid`,
  ADD COLUMN `pos_3` TINYINT DEFAULT 1 AFTER `mmr_valid`,
  ADD COLUMN `pos_2` TINYINT DEFAULT 1 AFTER `mmr_valid`,
  ADD COLUMN `pos_1` TINYINT DEFAULT 1 AFTER `mmr_valid`
