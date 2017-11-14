CREATE TABLE `users` (
  `steamid` varchar(25) NOT NULL,
  `admin` tinyint(4) DEFAULT '0',
  `avatar` varchar(128) NOT NULL,
  `name` varchar(64) DEFAULT NULL,
  PRIMARY KEY (`steamid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
