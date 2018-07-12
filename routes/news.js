
var fl = require('flux-link');
var db = require('db-filters');
var _ = require('underscore');

var privs = require('../lib/privs.js');
var users = require('../lib/users.js');
var news = require('../lib/news.js');

/**
 * Show a single news post
 * @param[in] req.newsid
 */
var read = new fl.Chain(
	function(env, after) {
		var id = parseInt(env.req.params.newsid, 10);
		if (isNaN(id))
			id = 0;

		after(id);
	},
	news.get,
	function(env, after, newsItem) {
		env.$template('news');
		env.$output({
			canEdit : news.canEdit(env.user),
			news : [newsItem]
		});
		after();
	}
);

/**
 * Show the edit or create news form
 */
var show_edit = new fl.Chain(
	function(env, after) {
		var id = parseInt(env.req.params.newsid, 10);
		if (isNaN(id))
			id = 0;

		if (news.canEdit(env.user))
			after(id);
		else
			env.$throw(new Error('You do not have permission to edit or post news'));
	},
	news.get,
	function(env, after, newsItem) {
		env.$template('news_post');

		if (newsItem.id) {
			env.$output({
				edit : 1,
				id : newsItem.id,
				title : newsItem.title,
				content : newsItem.content
			});
		}

		after();
	}
);

/**
 * Process the results of the edit/create news form
 * @todo move update into a news function as well
 */
var do_edit = new fl.Chain(
	function(env, after) {
		var id = parseInt(env.req.params.newsid, 10);
		if (isNaN(id))
			id = 0;

		env.newsID = id;

		if (news.canEdit(env.user))
			after();
		else
			env.$throw(new Error('You do not have permission to edit or post news'));
	},
	new fl.Branch(
		function(env, after) {
			after(0 == env.newsID);
		},
		new fl.Chain(
			function(env, after) {
				after(env.req.body.title, env.req.body.content, env.user);
			},
			news.insert,
			function(env, after, result) {
				env.result = result;
				after();
			}
		),
		new fl.Chain(
			function(env, after) {
				env.filters.news.update({
					title : env.req.body.title,
					content : env.req.body.content
				}, {
					id : env.newsID
				}).exec(after, env.$throw);
			},
			function(env, after, result) {
				env.result = result;
				after();
			}
		)
	),
	function(env, after) {
		if (0 == env.newsID)
			env.$redirect('/news/'+env.result.insertId);
		else
			env.$redirect('/news/'+env.newsID);
		after();
	}
).use_local_env(true);

/**
 * Delete a news post unceremoniously
 */
var delete_news = new fl.Chain(
	function(env, after) {
		var id = parseInt(env.req.params.newsid, 10);
		if (isNaN(id))
			env.$throw(new Error('Invalid news ID specified'));
		else if (news.canEdit(env.user))
			after(id);
		else
			env.$throw(new Error('You do not have permission to delete news'));
	},
	news.delete,
	function(env, after) {
		env.$redirect('/');
		after();
	}
);

module.exports.init_routes = function(server) {
	server.add_route('/news/:newsid', {
		fn : read,
		pre : ['default', 'optional_user'],
		post: ['default']
	}, 'get');

	server.add_route('/news/edit/:newsid', {
		fn : show_edit,
		pre : ['default', 'require_user'],
		post : ['default']
	}, 'get');

	server.add_route('/news/edit/:newsid', {
		fn : do_edit,
		pre : ['default', 'require_user'],
		post : ['default']
	}, 'post');

	server.add_route('/news/delete/:newsid', {
		fn : delete_news,
		pre : ['default', 'require_user'],
		post : ['default']
	}, 'get');
};
