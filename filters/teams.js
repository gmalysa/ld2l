module.exports = function(db) {
	var cols = {
		id : db.int_t,
		seasonid : db.int_t,
		captainid : [db.varchar_t, 25],
		steam_teamid : db.int_t,
		name : [db.varchar_t, 64],
		tag : [db.varchar_t, 10],
		logo : [db.varchar_t, 125]
	};

	db.add_filter("teams", new db("teams", cols, {}));
}
