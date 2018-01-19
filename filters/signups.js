module.exports = function(db) {
	var cols = {
		time : db.datetime_t,
		steamid : [db.varchar_t, 25],
		season : db.int_t,
		medal : db.int_t,
		standin : db.int_t,
		captain : db.int_t,
		statement : [db.varchar_t, 255]
	};

	db.add_filter("signups", new db("signups", cols, {}));
}
