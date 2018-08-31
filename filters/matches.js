module.exports = function(db) {
	var cols = {
		id : db.int_t,
		dotaid : [db.varchar_t, 25],
		replay : [db.varchar_t, 128],
		season : db.int_t,
		week : db.int_t,
		home : db.int_t,
		away : db.int_t,
		result : db.int_t
	};

	db.add_filter("matches", new db("matches", cols, {}));
}
