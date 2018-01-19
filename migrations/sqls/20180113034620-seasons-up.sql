/* Replace with your SQL commands */
CREATE TABLE `seasons` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) DEFAULT NULL,
  `status` int(10) unsigned NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `signups` (
  `time` datetime NOT NULL,
  `steamid` varchar(25) NOT NULL,
  `season` int(10) unsigned NOT NULL,
  `medal` tinyint(3) unsigned NOT NULL,
  `standin` tinyint(3) unsigned NOT NULL,
  `captain` tinyint(3) unsigned NOT NULL,
  `statement` varchar(255) DEFAULT NULL,
  UNIQUE KEY `signup` (`steamid`,`season`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
