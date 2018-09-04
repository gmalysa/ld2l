ALTER TABLE seasons ADD `type` integer unsigned AFTER `status`;
UPDATE seasons SET type = 0;
