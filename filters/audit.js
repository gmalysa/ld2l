module.exports = function(db) {
	var cols = {
		id : db.int_t,
		time : db.datetime_t,
		steamid : [db.varchar_t, 25],
		action : db.int_t,
		targetid : [db.varchar_t, 25],
		data : db.text_t
	};

	db.add_filter("audit", new db("audit", cols, {}));
}
