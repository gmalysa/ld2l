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
var matches = require('../lib/matches.js');

/**
 * Show detailed information for the single match specified
 * @param[in] env.req.params.matchid The integer database id of the match to look up
 */
var match_details = new fl.Chain(
	function(env, after) {
		var id = parseInt(env.req.params.matchid);
		if (isNaN(id)) {
			env.$throw(new Error('Invalid match ID specified'));
			return;
		}

		env.matchId = id;
		after(id);
	},
	matches.getDetails,
	function(env, after, match) {
		env.$output({match : match});
		env.$template('match');
		after();
	}
).use_local_env(true);

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
	matches.getAllSeries,
	function(env, after, series) {
		var week = _.reduce(series, function(memo, v) {
			return v[0].round > memo ? v[0].round : memo;
		}, 0);

		var current = [];
		var past = [];
		_.each(series, function(v, k) {
			if (week == k) {
				current = v;
			}
			else {
				past.push({
					matchups : v,
					week : v[0].round
				});
			}
		});

		past.sort(function(a, b) {
			return b.week - a.week;
		});

		env.$template('schedule');
		env.$output({
			season : env.season,
			week : week,
			matchups : current,
			past_matchups : past
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
	matches.generateMatchups,
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

	server.add_route('/matches/:matchid', {
		fn : match_details,
		pre : ['default', 'optional_user'],
		post : ['default']
	}, 'get');
};
