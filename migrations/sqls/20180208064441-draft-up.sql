CREATE TABLE `teams` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `seasonid` int(10) unsigned NOT NULL,
  `captainid` varchar(25) NOT NULL,
  `steam_teamid` int(10) unsigned DEFAULT '0',
  `name` varchar(64) DEFAULT NULL,
  `tag` varchar(10) DEFAULT NULL,
  `logo` varchar(125) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `captain` (`seasonid`,`captainid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

ALTER TABLE `signups` ADD `draftable` int unsigned default 0 AFTER `captain`;
ALTER TABLE `signups` ADD `teamid` int unsigned default 0 AFTER `steamid`;
ALTER TABLE `signups` ADD `free_agent` int unsigned default 0 AFTER `draftable`;

