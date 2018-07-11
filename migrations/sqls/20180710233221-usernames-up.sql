ALTER TABLE users ADD display_name varchar(64) DEFAULT NULL AFTER name;
UPDATE users SET display_name = name;
