
ALTER TABLE matches ADD `replay` VARCHAR(128) AFTER dotaid;

CREATE TABLE `match_links` (
  `matchid` int(10) unsigned NOT NULL,
  `steamid` varchar(25) NOT NULL,
  `property` int(10) unsigned NOT NULL,
  `value` int(10) unsigned NOT NULL,
  UNIQUE KEY `entry` (`matchid`,`steamid`,`property`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
