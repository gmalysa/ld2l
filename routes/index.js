/**
 * Route that handles the simple and static content pages
 */

var fs = require('fs');

/**
 * Just show the main page
 */
function index(env, after) {
	env.$template('index');
	env.$output({title : 'Learn Dota 2 League'});
	after();
}

/**
 * Show the generated rules content
 */
function rules(env, after) {
	env.$template('rules');
	fs.readFile('static/markdown/rules.md', function(err, data) {
		if (err) {
			env.$throw(new Error('Unable to read rules file.'));
			return;
		}

		env.$output({
			title: 'Rules - Learn Dota 2 League',
			rules: data
		});
		after();
	});
}

module.exports.init_routes = function(server) {
	server.add_route('/', {
		fn : index,
		pre : ['default'],
		post : ['default']
	}, 'get');

	server.add_route('/rules', {
		fn : rules,
		pre : ['default'],
		post : ['default']
	}, 'get');
};
