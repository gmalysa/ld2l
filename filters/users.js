module.exports = function(db) {
	var cols = {
		steamid : [db.varchar_t, 25],
		avatar : [db.varchar_t, 128],
		name : [db.varchar_t, 64],
		discord_id : [db.varchar_t, 25],
		discord_name : [db.varchar_t, 64],
		discord_avatar : [db.varchar_t, 128],
		discord_discriminator : [db.varchar_t, 8]
	};

	db.add_filter("users", new db("users", cols, {}));
}
