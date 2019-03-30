/**
 * Load hovercard-style data via ajax
 */

var _ = require('underscore');
var fl = require('flux-link');
var db = require('db-filters');

var users = require('../lib/users.js');
var teams = require('../lib/teams.js');
var matches = require('../lib/matches.js');

/**
 * Map player records as part of the team record
 */
function hoverTeamPlayerInfo(player) {
	return {
		steamid : player.steamid,
		avatar : player.avatar,
		display_name : player.display_name,
		medal : player.medal
	}
}

/**
 * Map database data into the format expected for the hovercard team object
 */
function hoverTeamInfo(team) {
	return {
		id : team.id,
		name : team.name,
		logo : team.logo,
		wins : team.wins,
		losses : team.losses,
		tiebreaker : team.tiebreaker,
		captain : hoverTeamPlayerInfo(team.captain),
		players : _.map(team.players, hoverTeamPlayerInfo)
	};
}

/**
 * Generate the hovercard information for a team
 */
var hovercard_team = new fl.Chain(
	function(env, after) {
		env.teamId = parseInt(env.req.body.id);
		if (isNaN(env.teamId)) {
			env.$throw(new Error('Invalid team ID'));
			return;
		}

		after(env.teamId);
	},
	teams.get,
	matches.addRecord,
	function(env, after, team) {
		env.$json({
			hoverTemplate : 'hover_team',
			hoverData : hoverTeamInfo(team)
		});
		after();
	}
).use_local_env(true);

/**
 * Generate hovercard information for a player
 */
var hovercard_player = new fl.Chain(
).use_local_env(true);

/**
 * Hovercard entry point
 */
var hovercard = new fl.Branch(
	function(env, after) {
		after(env.req.body.type == 'team');
	},
	hovercard_team,
	hovercard_player
);

module.exports.init_routes = function(server) {
	server.add_route('/hovercard', {
		pre : ['default', 'optional_user'],
		post : ['default'],
		fn : hovercard
	}, 'post');
};
