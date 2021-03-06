/**
 * Route that handles the simple and static content pages
 */

var fs = require('fs');
var db = require('db-filters');
var fl = require('flux-link');

var news = require('../lib/news');

/**
 * Just show the main page
 */
var index = new fl.Chain(
	news.getLatest,
	function(env, after, newsList) {
		env.$template('index');
		env.$output({
			title : 'Learn Dota 2 League',
			news : newsList,
			canEdit : news.canEdit(env.user)
		});
		after();
	}
);

/**
 * Show the generated rules content
 */
function rules(env, after) {
	env.$template('markdown');
	fs.readFile('static/markdown/rules.md', function(err, data) {
		if (err) {
			env.$throw(new Error('Unable to read rules file.'));
			return;
		}

		env.$output({
			title: 'Rules - Learn Dota 2 League',
			content: data
		});
		after();
	});
}

/**
 * Show info/about page with summary stuff
 */
function about(env, after) {
	env.$template('markdown');
	fs.readFile('static/markdown/about.md', function(err, data) {
		if (err) {
			env.$throw(new Error('Unable to read about file.'));
			return;
		}

		env.$output({
			title: 'About - Learn Dota 2 League',
			content: data
		});
		after();
	});
}

module.exports.init_routes = function(server) {
	server.add_route('/', {
		fn : index,
		pre : ['default', 'optional_user'],
		post : ['default']
	}, 'get');

	server.add_route('/rules', {
		fn : rules,
		pre : ['default', 'optional_user'],
		post : ['default']
	}, 'get');

	server.add_route('/about', {
		fn : about,
		pre : ['default', 'optional_user'],
		post : ['default']
	}, 'get');
};
