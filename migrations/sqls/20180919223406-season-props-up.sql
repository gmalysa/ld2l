ALTER TABLE `seasons` ADD ticket integer unsigned default 0 AFTER `type`;
ALTER Table `seasons` ADD linearization integer unsigned default 0 AFTER `ticket`;
