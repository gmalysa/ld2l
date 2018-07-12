
var fl = require('flux-link');
var db = require('db-filters');
var _ = require('underscore');

var privs = require('../lib/privs.js');
var users = require('../lib/users.js');
var seasons = require('../lib/seasons.js');
var teams = require('../lib/teams.js');
var matches = require('../lib/matches.js');

/**
 * Get info about a specific team
 */
var team_info = new fl.Chain(
	function(env, after) {
		env.teamId = parseInt(env.req.params.teamid);
		if (isNaN(env.teamId)) {
			env.$throw(new Error('A team ID must be given.'));
			return;
		}

		after(env.teamId);
	},
	teams.get,
	function(env, after, team) {
		env.team = team;
		env.filters.seasons.select({id : team.seasonid})
			.exec(after, env.$throw);
	},
	function(env, after, season) {
		var isCaptain = teams.isCaptain(env.team, env.user);
		var isAdmin = privs.hasPriv(env.user.privs, privs.MODIFY_SEASON);
		var canEditName = isCaptain || isAdmin;

		env.team.players.forEach(function(v) {
			v.linear_medal = users.adjustMedal(v.medal);
		});

		if (env.team.captain) {
			env.team.captain.linear_medal = users.adjustMedal(env.team.captain.medal);
		}

		env.$template('teams_about');
		env.$output({
			team : env.team,
			season : season[0],
			canEditName : canEditName,
			canEditTeam : isAdmin
		});
		after();
	}
).use_local_env(true);

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
		after(env.seasonId);
	},
	teams.getAllTeams,
	function(env, after, teams) {
		after(teams, env.seasonId);
	},
	matches.addStandings,
	function(env, after, teams) {
		env.$template('teams_list');
		env.$output({
			season : env.seasonInfo,
			teams : teams
		});
		after();
	}
);

/**
 * Mark a team as disbanded, used by admins
 */
var disband = new fl.Chain(
	function(env, after) {
		env.teamID = parseInt(env.req.params.teamid);
		if (isNaN(env.teamID)) {
			env.$throw(new Error('Invalid team ID given.'));
			return;
		}

		env.$push(env.user);
		after(env.teamID);
	},
	teams.get,
	teams.disband,
	function(env, after) {
		env.$redirect('/teams/about/'+env.teamID);
		after();
	}
);

/**
 * Mark a team as un-disbanded, used by admins
 */
var undisband = new fl.Chain(
	function(env, after) {
		env.teamID = parseInt(env.req.params.teamid);
		if (isNaN(env.teamID)) {
			env.$throw(new Error('Invalid team ID given.'));
			return;
		}

		env.$push(env.user);
		after(env.teamID);
	},
	teams.get,
	teams.undisband,
	function(env, after) {
		env.$redirect('/teams/about/'+env.teamID);
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

	server.add_route('/teams/about/:teamid/disband', {
		fn : disband,
		pre : ['default', 'require_user'],
		post : ['default']
	}, 'get');

	server.add_route('/teams/about/:teamid/undisband', {
		fn : undisband,
		pre : ['default', 'require_user'],
		post : ['default']
	}, 'get');
}
