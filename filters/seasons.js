module.exports = function(db) {
	var cols = {
		id : db.int_t,
		name : [db.varchar_t, 255],
		status : db.int_t,
		type : db.int_t,
		ticket : db.int_t,
		linearization : db.int_t
	};

	db.add_filter("seasons", new db("seasons", cols, {}));
}
