CREATE TABLE `privs` (
  `steamid` varchar(25) NOT NULL,
  `priv` int(11) NOT NULL,
  UNIQUE KEY `entry` (`steamid`,`priv`)
);
