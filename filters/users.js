module.exports = function(db) {
	var cols = {
		steamid : [db.varchar_t, 25],
		admin : db.int_t,
		avatar : [db.varchar_t, 128],
		name : [db.varchar_t, 64]
	};

	db.add_filter("users", new db("users", cols, {}));
}
