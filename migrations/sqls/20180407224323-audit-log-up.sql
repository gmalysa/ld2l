CREATE TABLE `audit` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `time` datetime NOT NULL,
  `steamid` varchar(25) NOT NULL,
  `action` int(10) unsigned NOT NULL,
  `targetid` varchar(25) DEFAULT NULL,
  `data` text,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
