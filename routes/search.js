/**
 * Search for users and autocomplete user names endpoints
 */

var _ = require('underscore');
var fl = require('flux-link');
var db = require('db-filters');
var dotaconstants = require('dotaconstants');

var users = require('../lib/users.js');

/**
 * Search for a user, including an optional partial string in the url for form results
 */
var search = new fl.Chain(
	function(env, after) {
		env.key = '';
		env.results = {};
		after();
	},
	new fl.Branch(
		function(env, after) {
			if (env.req.body.key)
				after(env.req.body.key.length > 0);
			else
				after(false);
		},
		new fl.Chain(
			function(env, after) {
				after(env.req.body.key);
			},
			users.search,
			function(env, after, matches) {
				env.results = matches;
				after();
			}
		),
		function(env, after) {
			after();
		}
	),
	function(env, after) {
		if (env.req.accepts('html')) {
			env.$template('search');

			if (env.req.body.key) {
				env.$output({searchtext : env.req.body.key});
			}

			if (env.results.length > 0) {
				env.$output({search : env.results});
			}
		}
		else {
			env.$json({
				search : env.results
			});
		}

		after();
	}
);

/**
 * Search for a hero, this only supports json output for use in autocomplete for now
 */
function hero(env, after) {
	var matches = [];
	if (env.req.body.key.length > 0) {
		var tester = new RegExp(env.req.body.key, 'i');
		matches = _.filter(dotaconstants.heroes, function(hero) {
			return tester.test(hero.name) || tester.test(hero.localized_name);
		});

	}

	env.$json({
		search : matches
	});

	after();
}

/**
 * Search for an item, this only supports json output for use in autocomplete for now
 */
function item(env, after) {
	var matches = [];
	if (env.req.body.key.length > 0) {
		var tester = new RegExp(env.req.body.key, 'i');
		matches = _.filter(dotaconstants.items, function(item) {
			// items < 1000 are currently normal game items
			return tester.test(item.dname) && item.id < 1000;
		});

	}

	env.$json({
		search : matches
	});

	after();
}

module.exports.init_routes = function(server) {
	server.add_route('/search', {
		pre : ['default', 'optional_user'],
		post : ['default'],
		fn : search
	}, 'get');

	server.add_route('/search', {
		pre : ['default', 'optional_user'],
		post : ['default'],
		fn : search
	}, 'post');

	server.add_route('/items', {
		pre : ['default', 'optional_user'],
		post : ['default'],
		fn : item
	}, 'post');

	server.add_route('/heroes', {
		pre : ['default', 'optional_user'],
		post : ['default'],
		fn : hero
	}, 'post');
};
