module.exports = function(db) {
	var cols = {
		time : db.datetime_t,
		steamid : [db.varchar_t, 25],
		teamid : db.int_t,
		season : db.int_t,
		medal : db.int_t,
		standin : db.int_t,
		captain : db.int_t,
		draftable : db.int_t,
		valid_standin : db.int_t,
		statement : [db.varchar_t, 255]
	};

	db.add_filter("signups", new db("signups", cols, {}));
}
