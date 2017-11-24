ALTER TABLE users
	DROP COLUMN admin,
	ADD COLUMN discord_id varchar(25) after name,
	ADD COLUMN discord_name varchar(64) after discord_id,
	ADD COLUMN discord_avatar varchar(128) after discord_name,
	ADD COLUMN discord_discriminator varchar(8) after discord_avatar;
