module.exports = function(db) {
	var cols = {
		matchid : db.int_t,
		steamid : [db.varchar_t, 25],
		property : db.int_t,
		value : db.int_t
	};

	db.add_filter("match_links", new db("match_links", cols, {}));
}
