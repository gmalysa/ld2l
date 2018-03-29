CREATE TABLE `news` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `posted` datetime DEFAULT NULL,
  `updated` datetime DEFAULT NULL,
  `author` varchar(25) NOT NULL,
  `title` varchar(255) NOT NULL,
  `content` text,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TRIGGER news_date BEFORE INSERT on `news`
FOR EACH ROW SET NEW.posted = NOW(), NEW.updated = NOW();
