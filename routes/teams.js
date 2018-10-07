
var fl = require('flux-link');
var db = require('db-filters');
var _ = require('underscore');

var privs = require('../lib/privs.js');
var users = require('../lib/users.js');
var seasons = require('../lib/seasons.js');
var teams = require('../lib/teams.js');
var matches = require('../lib/matches.js');

/**
 * Consistent team preamble, looks for :teamid
 */
var team_preamble = new fl.Chain(
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
		if (null == team) {
			env.$throw(new Error('No team matching id '+env.teamId));
			return;
		}
		after();
	},
);

/**
 * Get info about a specific team
 */
var team_info = new fl.Chain(
	function(env, after) {
		after(env.team);
	},
	matches.getTeamHistory,
	function(env, after, history) {
		var isCaptain = teams.isCaptain(env.team, env.user);
		var isAdmin = privs.hasPriv(env.user.privs, privs.MODIFY_SEASON);
		var canEditName = isCaptain || isAdmin;

		env.$template('teams_about');
		env.$output({
			team : env.team,
			season : env.team.season,
			history : history,
			canEditName : canEditName,
			canEditTeam : isAdmin,
			scripts : ['name']
		});
		after();
	}
).use_local_env(true);

/**
 * Get all the teams in the given season
 */
var team_index = new fl.Chain(
	function(env, after) {
		after(env.season.id);
	},
	teams.getAllTeams,
	function(env, after, teams) {
		after(teams, env.season.id);
	},
	matches.addStandings,
	function(env, after, teams) {
		env.$template('teams_list');
		env.$output({
			teams : teams,
			scripts : ['sort']
		});
		after();
	}
);

/**
 * Rename a team
 */
var rename = new fl.Chain(
	function(env, after) {
		after(env.user, env.team, env.req.body.name);
	},
	teams.rename,
	function(env, after) {
		env.$json({success : true});
		after();
	}
);

/**
 * Mark a team as disbanded, used by admins
 */
var disband = new fl.Chain(
	function(env, after) {
		after(env.user, env.team);
	},
	teams.disband,
	function(env, after) {
		env.$redirect('/teams/about/'+env.teamId);
		after();
	}
);

/**
 * Mark a team as un-disbanded, used by admins
 */
var undisband = new fl.Chain(
	function(env, after) {
		after(env.user, env.team);
	},
	teams.undisband,
	function(env, after) {
		env.$redirect('/teams/about/'+env.teamId);
		after();
	}
);

module.exports.init_routes = function(server) {
	server.add_pre_hook(team_preamble, 'team');

	server.add_route('/teams/:seasonid', {
		fn : team_index,
		pre : ['default', 'optional_user', 'season'],
		post : ['default']
	}, 'get');

	server.add_route('/teams/about/:teamid', {
		fn : team_info,
		pre : ['default', 'optional_user', 'team'],
		post : ['default']
	}, 'get');

	server.add_route('/teams/about/:teamid/disband', {
		fn : disband,
		pre : ['default', 'require_user', 'team'],
		post : ['default']
	}, 'get');

	server.add_route('/teams/about/:teamid/undisband', {
		fn : undisband,
		pre : ['default', 'require_user', 'team'],
		post : ['default']
	}, 'get');

	server.add_route('/teams/about/:teamid/rename', {
		fn : rename,
		pre : ['default', 'require_user', 'team'],
		post : ['default']
	}, 'post');
}
