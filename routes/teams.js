
var fl = require('flux-link');
var db = require('db-filters');
var _ = require('underscore');

var privs = require('../lib/privs.js');
var users = require('../lib/users.js');
var seasons = require('../lib/seasons.js');
var teams = require('../lib/teams.js');

/**
 * Get info about a specific team
 */
var team_info = new fl.Chain(
	function(env, after) {
		env.teamId = parseInt(env.req.params.teamid);
		if (isNaN(env.teamId)) {
		}
	}
);

/**
 * Get all the teams in the given season
 */
var team_index = new fl.Chain(
	function(env, after) {
		env.seasonId = parseInt(env.req.params.seasonid);
		if (isNaN(env.seasonId)) {
			env.$throw(new Error('A season ID must be given.'));
			return;
		}
		env.filters.seasons.select({
			id : env.seasonId
		}).exec(after, env.$throw);
	},
	function(env, after, results) {
		// @todo hide team listings for hidden seasons to non-admins
		if (0 == results.length) {
			env.$throw(new Error('No season matching that ID was found'));
			return;
		}

		env.seasonInfo = results[0];
		env.filters.teams.select({seasonid : env.seasonId})
			.left_join(env.filters.users, 'users')
			.on(['captainid', 'steamid'])
			.options({nestTables : '_'})
			.order(0, db.$asc('id'))
			.exec(after, env.$throw);
	},
	function(env, after, teams) {
		env.$template('teams_list');
		env.$output({
			season : env.seasonInfo,
			teams : teams
		});
		after();
	}
);

module.exports.init_routes = function(server) {
	server.add_route('/teams/:seasonid', {
		fn : team_index,
		pre : ['default', 'optional_user'],
		post : ['default']
	}, 'get');

	server.add_route('/teams/about/:teamid', {
		fn : team_info,
		pre : ['default', 'optional_user'],
		post : ['default']
	}, 'get');
}
