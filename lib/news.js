
var fl = require('flux-link');
var db = require('db-filters');

var privs = require('../lib/privs');

/**
 * Get the latest news items from newest to oldest
 * @return Array of news items
 */
var getLatest = new fl.Chain(
	function(env, after) {
		env.filters.news.select()
			.left_join(env.filters.users)
			.on(['author', 'steamid'])
			.order(db.$desc('posted'))
			.limit(10)
			.exec(after, env.$throw);
	}
);

/**
 * Get a specific news item by id
 * @param[in] id The id of the news to retrieve
 * @return news An object containing all the news data
 */
var get = new fl.Chain(
	function(env, after, id) {
		env.filters.news.select({id : id})
			.left_join(env.filters.users)
			.on(['author', 'steamid'])
			.exec(after, env.$throw);
	},
	function(env, after, newsItems) {
		if (newsItems.length > 0)
			after(newsItems[0]);
		else
			after({});
	}
);

/**
 * Delete a news post
 * @param[in] id ID of a news post to be deleted
 */
var delete_news = new fl.Chain(
	function(env, after, id) {
		env.filters.news.delete({id : id}).limit(1).exec(after, env.$throw);
	}
);

/**
 * Determine if a user can edit news, which just checks the permission
 * @param[in] user The user object to test
 * @return bool True if they can
 */
function canEdit(user) {
	return privs.hasPriv(user.privs, privs.POST_NEWS);
}

module.exports = {
	getLatest : getLatest,
	get : get,
	canEdit : canEdit,
	delete : delete_news
};
