/**
 * @todo this needs audit logging of changes being made
 */

var fl = require('flux-link');
var db = require('db-filters');
var _ = require('underscore');

var privs = require('../lib/privs.js');
var users = require('../lib/users.js');
var seasons = require('../lib/seasons.js');
var teams = require('../lib/teams.js');

/**
 * Show all matches from the given season
 * @param[in] season id
 * @todo handle weeks, separate into weeks, show results, etc.
 */
var show_matches = new fl.Chain(
	function(env, after) {
		var id = parseInt(env.req.params.seasonid);
		if (isNaN(id)) {
			env.$throw(new Error('Invalid season ID specified'));
			return;
		}

		env.seasonId = id;
		after(id);
	},
	seasons.getSeason,
	function(env, after, season) {
		env.season = season;
		after(env.seasonId);
	},
	seasons.getCurrentMatchups,
	function(env, after, matchups) {
		var week = 0;
		if (matchups.length > 0)
			week = matchups[0].week;

		env.$template('schedule');
		env.$output({
			season : env.season,
			week : week,
			matchups : matchups
		});
		after();
	}
);

/**
 * Generate new matchups in swiss format
 */
var generate_matchups = new fl.Chain(
	function(env, after) {
		var id = parseInt(env.req.params.seasonid);
		if (isNaN(id)) {
			env.$throw(new Error('Invalid season ID specified'));
			return;
		}

		if (!privs.hasPriv(env.user.privs, privs.MODIFY_SEASON)) {
			env.$throw(new Error('You do not have the ability to generate matchups'));
			return;
		}

		env.seasonId = id;
		after(id);
	},
	seasons.generateMatchups,
	function(env, after) {
		env.$redirect('/schedule/'+env.seasonId);
		after();
	}
);

module.exports.init_routes = function(server) {
	server.add_route('/schedule/:seasonid', {
		fn : show_matches,
		pre : ['default', 'optional_user'],
		post : ['default']
	}, 'get');

	server.add_route('/schedule/:seasonid/next', {
		fn : generate_matchups,
		pre : ['default', 'require_user'],
		post : ['default']
	}, 'get');
};
