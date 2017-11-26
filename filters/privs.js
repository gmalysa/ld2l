module.exports = function(db) {
	var cols = {
		steamid : [db.varchar_t, 25],
		priv : db.int_t
	};

	db.add_filter("privs", new db("privs", cols, {}));
}
