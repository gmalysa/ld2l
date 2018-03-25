module.exports = function(db) {
	var cols = {
		id : db.int_t,
		posted : db.datetime_t,
		updated : db.datetime_t,
		author : [db.varchar_t, 25],
		title : [db.varchar_t, 255],
		content : db.text_t
	};

	db.add_filter("news", new db("news", cols, {}));
}
