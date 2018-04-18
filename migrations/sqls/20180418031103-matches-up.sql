CREATE TABLE `matches` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `dotaid` varchar(25) DEFAULT NULL,
  `season` int(10) unsigned NOT NULL,
  `week` int(10) unsigned DEFAULT NULL,
  `home` int(10) unsigned NOT NULL,
  `away` int(10) unsigned NOT NULL,
  `result` int(10) unsigned NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
